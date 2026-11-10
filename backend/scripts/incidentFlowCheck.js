/**
 * scripts/incidentFlowCheck.js
 *
 * Integration test for the full incident lifecycle against a real MongoDB connection.
 * Creates temporary User + Application documents and deletes them at the end.
 *
 * Run: node scripts/incidentFlowCheck.js
 *
 * Exit code 0 = all assertions passed.
 * Exit code 1 = one or more assertions failed.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Bootstrap env (must happen before model/service imports)
import '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Application } from '../src/models/Application.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { Incident } from '../src/models/Incident.js';
import { processCheckResult } from '../src/services/schedulerService.js';

// ─── Simple test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✔ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✔ PASS: ${label} (${actual})`);
    passed++;
  } else {
    console.error(`  ✘ FAIL: ${label} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

/** Simulate a failed health check result */
const failResult = () => ({
  success: false,
  statusCode: 500,
  responseTimeMs: 200,
  errorType: 'http_error',
  errorMessage: 'HTTP error response'
});

/** Simulate a successful health check result */
const successResult = () => ({
  success: true,
  statusCode: 200,
  responseTimeMs: 150,
  errorType: null,
  errorMessage: null
});

/** Re-fetch the application from DB so counters are fresh */
async function freshApp(id) {
  return Application.findById(id);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await connectDB();

  // Unique suffix so parallel runs don't collide
  const suffix = Date.now();

  // Create a temporary user
  const user = await User.create({
    name: 'Flow Check User',
    email: `flowcheck+${suffix}@test.local`,
    passwordHash: await bcrypt.hash('Test1234!', 12)
  });

  // Create a temporary production application
  const app = await Application.create({
    ownerId: user._id,
    name: `FlowCheck App ${suffix}`,
    url: `https://flowcheck-${suffix}.example.com`,
    environment: 'production',
    checkIntervalSeconds: 30,
    timeoutMs: 5000,
    status: 'unknown',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    checkLockUntil: null,
    nextCheckAt: new Date()
  });

  try {
    // ── Section A: Sequential incident lifecycle ──────────────────────────────
    console.log('\n── Section A: Sequential incident lifecycle ──');

    // A1: fail, fail → exactly 1 active incident, failureCount = 2
    let cur = await freshApp(app._id);
    await processCheckResult(cur, failResult());

    cur = await freshApp(app._id);
    await processCheckResult(cur, failResult());

    let incidents = await Incident.find({ applicationId: app._id, isActive: true });
    assertEqual(incidents.length, 1, 'A1: exactly 1 active incident after 2 failures');
    assertEqual(incidents[0]?.failureCount, 2, 'A1: failureCount = 2');
    assertEqual(incidents[0]?.status, 'open', 'A1: status = open');
    assertEqual(incidents[0]?.severity, 'high', 'A1: severity = high (production)');

    // A2: fail → failureCount grows to 3, still 1 incident
    cur = await freshApp(app._id);
    await processCheckResult(cur, failResult());

    incidents = await Incident.find({ applicationId: app._id, isActive: true });
    assertEqual(incidents.length, 1, 'A2: still exactly 1 active incident after 3rd failure');
    assertEqual(incidents[0]?.failureCount, 3, 'A2: failureCount = 3');

    // A3: success → incident still active (only 1st success)
    cur = await freshApp(app._id);
    await processCheckResult(cur, successResult());

    incidents = await Incident.find({ applicationId: app._id, isActive: true });
    assertEqual(incidents.length, 1, 'A3: incident still active after 1st success');
    assert(incidents[0]?.resolvedAt === null || incidents[0]?.resolvedAt === undefined, 'A3: resolvedAt is null');

    // A4: success → incident resolved (2nd consecutive success)
    cur = await freshApp(app._id);
    await processCheckResult(cur, successResult());

    incidents = await Incident.find({ applicationId: app._id, isActive: true });
    assertEqual(incidents.length, 0, 'A4: no active incidents after 2nd consecutive success');

    const resolved = await Incident.findOne({ applicationId: app._id, isActive: false });
    assert(resolved !== null, 'A4: resolved incident exists in DB');
    assert(resolved?.resolvedAt instanceof Date, 'A4: resolvedAt is a Date');
    assertEqual(resolved?.status, 'resolved', 'A4: status = resolved');

    // A5: fail, fail → a NEW second incident opens (total 2 incidents for the app)
    cur = await freshApp(app._id);
    await processCheckResult(cur, failResult());

    cur = await freshApp(app._id);
    await processCheckResult(cur, failResult());

    const totalIncidents = await Incident.countDocuments({ applicationId: app._id });
    assertEqual(totalIncidents, 2, 'A5: total incidents for app = 2 (one resolved + one new)');

    const newActive = await Incident.findOne({ applicationId: app._id, isActive: true });
    assert(newActive !== null, 'A5: new active incident exists');
    assertEqual(newActive?.failureCount, 2, 'A5: new incident failureCount = 2');

    // ── Section B: Concurrency — 20 parallel open/update calls ───────────────
    console.log('\n── Section B: Concurrency test ──');

    // Create a fresh application for the concurrency test
    const concApp = await Application.create({
      ownerId: user._id,
      name: `Conc App ${suffix}`,
      url: `https://conc-${suffix}.example.com`,
      environment: 'production',
      checkIntervalSeconds: 30,
      timeoutMs: 5000,
      status: 'unknown',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      checkLockUntil: null,
      nextCheckAt: new Date()
    });

    // Warm up to consecutiveFailures=1 so the concurrent calls reach failureCount=2 and attempt to open
    const initialSnapshot = await freshApp(concApp._id);
    await processCheckResult(initialSnapshot, failResult());

    // Run 20 concurrent processCheckResult calls with failure results.
    // Each call independently fetches a snapshot of the app, so they all see
    // consecutiveFailures at various stages. The partial unique index ensures
    // at most ONE incident is created; the rest are converted to updates (failureCount++).
    let errors = 0;
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        try {
          // Each worker gets the current DB state before its call
          const snapshot = await freshApp(concApp._id);
          await processCheckResult(snapshot, failResult());
        } catch (err) {
          errors++;
          console.error(`  Concurrent call ${i} threw:`, err.message);
        }
      })
    );

    assertEqual(errors, 0, 'B: no unhandled errors across 20 concurrent calls');

    const concActiveIncidents = await Incident.find({
      applicationId: concApp._id,
      isActive: true
    });
    assertEqual(concActiveIncidents.length, 1, 'B: exactly 1 active incident after 20 concurrent failures');

    // Clean up concurrency app
    await Incident.deleteMany({ applicationId: concApp._id });
    await HealthCheck.deleteMany({ applicationId: concApp._id });
    await Application.deleteOne({ _id: concApp._id });

  } finally {
    // ── Cleanup: remove all test data ──────────────────────────────────────
    await Incident.deleteMany({ applicationId: app._id });
    await HealthCheck.deleteMany({ applicationId: app._id });
    await Application.deleteOne({ _id: app._id });
    await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Script] Fatal error:', err.message);
  process.exit(1);
});

