import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { HealthCheckDaily } from '../models/HealthCheckDaily.js';
import { Slo } from '../models/Slo.js';
import { runHealthCheck } from './healthCheckService.js';
import { computeNextState } from './statusService.js';
import { env } from '../config/env.js';
// incidentService imported lazily to avoid circular deps; imported at top since there are none here
import { handleCheckOutcome } from './incidentService.js';
import { evaluateSloAlerts } from './sloAlertService.js';
import { emitApplicationStatus, emitHealthCheckCompleted } from '../sockets/events.js';

let tickInterval = null;
let staleSweepInterval = null;
let isTickRunning = false;

/**
 * Saves the HealthCheck record, computes next status, atomically updates the
 * Application, then triggers incident logic.
 *
 * If the app was deleted or its URL changed while the check was in flight,
 * findOneAndUpdate returns null → we quietly discard the result (no incident update).
 *
 * @param {object} application - Application document snapshot captured at claim time
 * @param {object} result      - Check result from runHealthCheck / simulated result
 */
export async function processCheckResult(application, result) {
  const now = new Date();
  const checkedAt = now;

  // a) Insert HealthCheck document (best-effort; never abort the rest on failure)
  try {
    await HealthCheck.create({
      applicationId: application._id,
      ownerId: application.ownerId,
      checkedAt,
      success: result.success,
      statusCode: result.statusCode ?? null,
      responseTimeMs: result.responseTimeMs,
      errorType: result.errorType ?? null,
      errorMessage: result.errorMessage ?? null
    });
  } catch (err) {
    console.error(`[Scheduler] Failed to insert HealthCheck for ${application._id}:`, err.message);
  }

  // a2) Increment daily rollup counters (atomic upsert; never abort scheduler on failure)
  const startOfDay = new Date(Date.UTC(checkedAt.getUTCFullYear(), checkedAt.getUTCMonth(), checkedAt.getUTCDate()));
  try {
    await HealthCheckDaily.updateOne(
      { applicationId: application._id, day: startOfDay },
      {
        $setOnInsert: { ownerId: application.ownerId },
        $inc: { total: 1, good: result.success ? 1 : 0 }
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key race condition during initial upsert: retry once with plain update
      try {
        await HealthCheckDaily.updateOne(
          { applicationId: application._id, day: startOfDay },
          { $inc: { total: 1, good: result.success ? 1 : 0 } }
        );
      } catch (retryErr) {
        console.error(`[Scheduler] Rollup retry failed for app ${application._id}:`, retryErr.message);
      }
    } else {
      console.error(`[Scheduler] Failed to update HealthCheckDaily for ${application._id}:`, err.message);
    }
  }

  // b) Compute next state (pure function, no DB access)
  const nextState = computeNextState(application, result, env.SLOW_RESPONSE_MS);

  // c) Atomically update the application.
  // Filter by { _id, url } so a URL change during the check causes a no-op (prevents stale writes).
  const updatePayload = {
    status: nextState.status,
    consecutiveFailures: nextState.consecutiveFailures,
    consecutiveSuccesses: nextState.consecutiveSuccesses,
    lastCheckedAt: now,
    nextCheckAt: new Date(now.getTime() + application.checkIntervalSeconds * 1000),
    checkLockUntil: null
  };

  if (result.success) {
    updatePayload.lastSuccessfulAt = now;
  }

  const updatedApp = await Application.findOneAndUpdate(
    { _id: application._id, url: application.url },
    { $set: updatePayload },
    { new: true }
  );

  // If the app was deleted or its URL changed in-flight, discard result silently
  if (!updatedApp) return;

  // Real-time notification: emit completed healthcheck & application status to owner room
  emitHealthCheckCompleted(application.ownerId, {
    applicationId: application._id,
    success: result.success,
    statusCode: result.statusCode ?? null,
    responseTimeMs: result.responseTimeMs,
    errorType: result.errorType ?? null,
    checkedAt
  });
  emitApplicationStatus(application.ownerId, updatedApp);

  // d) Handle incident logic AFTER the application update succeeds.
  // Wrap in try/catch: an incident error must never break the scheduler or leave a lock held.
  // TODO(Step 9): emit incident:created / incident:updated via Socket.IO AFTER the DB write succeeds
  try {
    await handleCheckOutcome(updatedApp, result);
  } catch (err) {
    // Log without internal details (no stack trace, no IPs)
    console.error(`[Scheduler] Incident handling error for app ${application._id}:`, err.message);
  }

  // e) Trigger SLO alerting evaluation (Step 16)
  // Throttled to once per 60s per SLO. Errors are caught and logged and never break the scheduler.
  try {
    await evaluateSloAlerts({
      applicationId: updatedApp._id,
      application: updatedApp,
      trigger: 'check',
      now
    });
  } catch (err) {
    console.error(`[Scheduler] SLO alert evaluation error for app ${application._id}:`, err.message);
  }
}

/**
 * Executes one scheduler tick:
 * 1. Atomically claims up to MAX_CONCURRENT_CHECKS due applications (distributed lock).
 * 2. Runs their health checks in parallel.
 * 3. Saves results, updates application status, and triggers incident logic.
 */
async function tick() {
  if (isTickRunning) return; // Prevent overlapping ticks on the same process
  isTickRunning = true;

  try {
    const now = new Date();
    const claimedApps = [];

    // Claim apps one at a time up to the concurrency limit.
    // Lock duration = app.timeoutMs + 15 000 ms buffer.
    // We don't have timeoutMs before claiming, so we use a generous upper-bound (30 s).
    // The lock is released immediately in processCheckResult when the check finishes.
    for (let i = 0; i < env.MAX_CONCURRENT_CHECKS; i++) {
      const app = await Application.findOneAndUpdate(
        {
          nextCheckAt: { $lte: now },
          $or: [
            { checkLockUntil: null },
            { checkLockUntil: { $lte: now } }
          ]
        },
        {
          $set: {
            // Default lock: 30 s. Will be overridden once timeoutMs is known.
            // Correct per-app value: app.timeoutMs + 15 000 ms (set after claim if needed).
            checkLockUntil: new Date(now.getTime() + 30000)
          }
        },
        { new: true, sort: { nextCheckAt: 1 } }
      );

      if (!app) break;

      // Tighten the lock to this app's actual timeout + 15 s buffer
      const tightLockUntil = new Date(now.getTime() + app.timeoutMs + 15000);
      if (tightLockUntil > new Date(now.getTime() + 30000)) {
        // Only update if the correct lock is longer (some apps have timeoutMs > 15 s)
        await Application.findByIdAndUpdate(app._id, { $set: { checkLockUntil: tightLockUntil } });
      }

      claimedApps.push(app);
    }

    if (claimedApps.length === 0) return;

    // Run all claimed checks in parallel
    await Promise.all(
      claimedApps.map(async (application) => {
        try {
          const result = await runHealthCheck(application);
          await processCheckResult(application, result);
        } catch (err) {
          // An error inside one check must not block others; release the lock
          console.error(`[Scheduler] Uncaught error checking app ${application._id}:`, err.message);
          await Application.findByIdAndUpdate(application._id, {
            $set: { checkLockUntil: null }
          }).catch(() => {});
        }
      })
    );
  } catch (err) {
    console.error('[Scheduler] Tick error:', err.message);
  } finally {
    isTickRunning = false;
  }
}

/**
 * 60-second stale sweep checking for monitoring unavailability or restoration.
 * Uses Application.lastCheckedAt; does NOT perform raw check table scans.
 */
export async function staleSweep() {
  try {
    const slos = await Slo.find({}).lean();
    if (!slos || slos.length === 0) return;

    const now = new Date();
    for (const slo of slos) {
      try {
        const app = await Application.findById(slo.applicationId).lean();
        if (!app) continue;

        const intervalSeconds = app.checkIntervalSeconds || 60;
        const threshold = Math.max(3 * intervalSeconds, 300);
        const lastChecked = app.lastCheckedAt ? new Date(app.lastCheckedAt).getTime() : 0;
        const elapsed = (now.getTime() - lastChecked) / 1000;

        if (app.lastCheckedAt && elapsed > threshold) {
          await evaluateSloAlerts({
            applicationId: app._id,
            application: app,
            slo,
            trigger: 'sweep',
            now
          });
        }
      } catch (err) {
        console.error(`[Scheduler] SLO stale sweep error for SLO ${slo._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Stale sweep error:', err.message);
  }
}

export function start() {
  if (tickInterval) return;
  console.log(`[Scheduler] Starting with tick interval ${env.SCHEDULER_TICK_MS}ms, max concurrency ${env.MAX_CONCURRENT_CHECKS}`);
  tickInterval = setInterval(tick, env.SCHEDULER_TICK_MS);
  staleSweepInterval = setInterval(staleSweep, 60000);
  // Run immediately on startup so we don't wait a full tick interval
  tick().catch((err) => console.error('[Scheduler] Initial tick error:', err.message));
}

export function stop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (staleSweepInterval) {
    clearInterval(staleSweepInterval);
    staleSweepInterval = null;
  }
  console.log('[Scheduler] Stopped');
}
