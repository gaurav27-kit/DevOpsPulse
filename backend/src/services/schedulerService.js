import { Application } from '../models/Application.js';
import { HealthCheck } from '../models/HealthCheck.js';
import { runHealthCheck } from './healthCheckService.js';
import { computeNextState } from './statusService.js';
import { env } from '../config/env.js';

let tickInterval = null;
let isTickRunning = false;

/**
 * Saves the HealthCheck record, computes next status, and atomically updates
 * the Application. If the app was deleted or its URL changed while the check
 * was in flight, the findOneAndUpdate returns null and we quietly discard the result.
 */
async function processCheckResult(application, result) {
  const now = new Date();
  const checkedAt = now;

  // a) Insert HealthCheck document
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

  // b) Compute next state (pure function, no DB access)
  const nextState = computeNextState(application, result, env.SLOW_RESPONSE_MS);

  // c) Atomically update the application
  // Filter by { _id, url } so a URL change during the check causes a no-op (prevents stale writes)
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

  await Application.findOneAndUpdate(
    { _id: application._id, url: application.url },
    { $set: updatePayload }
  );
  // If no document matches (_id changed or url changed), result is quietly discarded
}

/**
 * Executes one scheduler tick:
 * 1. Atomically claims up to MAX_CONCURRENT_CHECKS due applications using a distributed lock.
 * 2. Runs their health checks in parallel (bounded by MAX_CONCURRENT_CHECKS).
 * 3. Saves results and releases locks.
 */
async function tick() {
  if (isTickRunning) return; // Prevent overlapping ticks on same process
  isTickRunning = true;

  try {
    const now = new Date();
    const claimedApps = [];

    // Claim apps one at a time up to the concurrency limit
    for (let i = 0; i < env.MAX_CONCURRENT_CHECKS; i++) {
      // Use a 30-second default lock duration; will be corrected in processCheckResult
      const lockUntil = new Date(now.getTime() + 30000);
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
            checkLockUntil: lockUntil
          }
        },
        { new: true, sort: { nextCheckAt: 1 } }
      );

      if (!app) break;
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
          // Exception inside one check must not block others; release the lock
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

export function start() {
  if (tickInterval) return;
  console.log(`[Scheduler] Starting with tick interval ${env.SCHEDULER_TICK_MS}ms, max concurrency ${env.MAX_CONCURRENT_CHECKS}`);
  tickInterval = setInterval(tick, env.SCHEDULER_TICK_MS);
  // Run immediately on startup to not wait one full tick
  tick().catch((err) => console.error('[Scheduler] Initial tick error:', err.message));
}

export function stop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('[Scheduler] Stopped');
  }
}

// Export processCheckResult for manual check endpoint reuse
export { processCheckResult };
