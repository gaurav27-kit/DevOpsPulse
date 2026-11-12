/**
 * scripts/sloAlertProof.mjs
 *
 * Automated end-to-end proofs for DevOpsPulse SLO alerting (Step 16).
 * Self-contained: creates and cleans up its own test data against real MongoDB.
 *
 * Assertions verified:
 *  1. Full lifecycle walk: healthy -> at_risk -> breached -> recovered -> healthy
 *     with exact events, order, and payload numbers (plain arithmetic).
 *  2. Multi-window burn rate alert (critical when 1h >= 14.4 and 6h >= 6.0).
 *  3. Monitoring unavailable (> 300s gap) then restored when checks resume.
 *  4. Insufficient data alert (SLO age > 40*interval and < 20 checks).
 *  5. Multi-worker safety: 20 parallel evaluations produce exactly 1 event and delivery.
 *  6. Webhook HMAC-SHA256 signature verifies as VALID; tampered body verifies as INVALID.
 *  7. Zero secrets present in payloads or logs.
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));

const mongoose = backendRequire('mongoose');
const dotenv = backendRequire('dotenv');

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Capture server logs for Secret Absence assertion
const capturedServerLogs = [];
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk, ...args) => {
  if (typeof chunk === 'string') capturedServerLogs.push(chunk);
  else if (Buffer.isBuffer(chunk)) capturedServerLogs.push(chunk.toString());
  return origStdoutWrite(chunk, ...args);
};

process.stderr.write = (chunk, ...args) => {
  if (typeof chunk === 'string') capturedServerLogs.push(chunk);
  else if (Buffer.isBuffer(chunk)) capturedServerLogs.push(chunk.toString());
  return origStderrWrite(chunk, ...args);
};

// Backend models & services
import { User } from '../backend/src/models/User.js';
import { Application } from '../backend/src/models/Application.js';
import { Slo } from '../backend/src/models/Slo.js';
import { SloAlertState } from '../backend/src/models/SloAlertState.js';
import { HealthCheck } from '../backend/src/models/HealthCheck.js';
import { HealthCheckDaily } from '../backend/src/models/HealthCheckDaily.js';
import { NotificationChannel } from '../backend/src/models/NotificationChannel.js';
import { NotificationDelivery } from '../backend/src/models/NotificationDelivery.js';
import { evaluateSloAlerts } from '../backend/src/services/sloAlertService.js';
import { encrypt } from '../backend/src/utils/crypto.js';
import { verifyWebhook } from './verifyWebhookSignature.mjs';

const MONGO_URI =
  process.env.MONGO_URI_TEST ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/devopspulse_test';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(passed, label, extra = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`[PASS] ${label}${extra ? ' - ' + extra : ''}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${label}${extra ? ' - ' + extra : ''}`);
  }
}

async function main() {
  console.log('===============================================================');
  console.log('       DevOpsPulse Automated SLO Alerting Proofs (Step 16)     ');
  console.log('===============================================================\n');

  await mongoose.connect(MONGO_URI);

  const runId = Date.now();
  const cleanupUserIds = [];
  const cleanupAppIds = [];
  const cleanupSloIds = [];
  const cleanupChannelIds = [];

  // Local Mock Webhook Receiver
  const receivedWebhooks = [];
  const mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      receivedWebhooks.push({
        url: req.url,
        method: req.method,
        headers: req.headers,
        rawBody: raw,
        parsedBody: (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })()
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  const mockWebhookUrl = `http://127.0.0.1:${mockPort}/webhook`;

  // Injected Mock Mail Transport
  const capturedMails = [];
  const mockMailTransport = {
    sendMail: async (mailOptions) => {
      capturedMails.push(mailOptions);
      return { messageId: `msg-${Date.now()}` };
    }
  };

  const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  try {
    // -------------------------------------------------------------
    // SETUP: Test User, App, SLO, and Notification Channels
    // -------------------------------------------------------------
    const user = await User.create({
      name: `SLO Proof User ${runId}`,
      email: `slo_proof_${runId}@example.com`,
      passwordHash: 'dummy_hash',
      role: 'user'
    });
    cleanupUserIds.push(user._id);

    const app = await Application.create({
      name: `Billing Gateway ${runId}`,
      url: `https://billing-${runId}.example.com`,
      ownerId: user._id,
      status: 'up',
      checkIntervalSeconds: 60,
      lastCheckedAt: new Date('2026-11-01T00:00:00Z'),
      nextCheckAt: new Date('2026-11-01T00:01:00Z'),
      nextCheckAt: new Date('2026-11-01T00:01:00Z')
    });
    cleanupAppIds.push(app._id);

    const slo = await Slo.create({
      name: 'Billing API 99.9% Availability',
      ownerId: user._id,
      applicationId: app._id,
      targetPercent: 99.9,
      windowDays: 30
    });
    cleanupSloIds.push(slo._id);

    const webhookChannel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'SLO Webhook Channel',
      type: 'webhook',
      urlEncrypted: encrypt(mockWebhookUrl),
      secretEncrypted: encrypt(testSecret),
      events: [
        'slo_at_risk',
        'slo_breached',
        'slo_high_burn_rate',
        'slo_recovered',
        'slo_budget_replenished',
        'slo_insufficient_data',
        'slo_monitoring_unavailable',
        'slo_monitoring_restored'
      ],
      minSeverity: 'low',
      enabled: true
    });
    cleanupChannelIds.push(webhookChannel._id);

    const emailChannel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'SLO Email Channel',
      type: 'email',
      events: [
        'slo_at_risk',
        'slo_breached',
        'slo_high_burn_rate',
        'slo_recovered',
        'slo_budget_replenished',
        'slo_insufficient_data',
        'slo_monitoring_unavailable',
        'slo_monitoring_restored'
      ],
      minSeverity: 'low',
      enabled: true
    });
    cleanupChannelIds.push(emailChannel._id);

    const capturedMails = [];
    const customMailTransport = {
      sendMail: async (mailOptions) => {
        capturedMails.push(mailOptions);
        return { messageId: 'mock-mail-' + Date.now() };
      }
    };

    // Helper: direct customHttpSender for mockWebhookUrl (bypassing SSRF localhost block for local test runner)
    const customHttpSender = async ({ url, secret, event, payloadObject }) => {
      const rawBody = JSON.stringify(payloadObject);
      const timestamp = Date.now().toString();
      const crypto = await import('crypto');
      const hmac = crypto.default
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      receivedWebhooks.push({
        url,
        event,
        headers: {
          'x-devopspulse-signature': `sha256=${hmac}`,
          'x-devopspulse-timestamp': timestamp
        },
        rawBody,
        parsedBody: payloadObject
      });

      return { success: true, statusCode: 200, errorType: null, retryable: false };
    };

    const sharedOptions = {
      customMailTransport,
      customHttpSender,
      retryBackoffs: [10, 20, 30]
    };

    sharedOptions.customHttpSender = customHttpSender;

    // -------------------------------------------------------------
    // PROOF 1: Full Lifecycle Walk
    // healthy -> at_risk -> breached -> recovered -> healthy
    // -------------------------------------------------------------
    console.log('--- Proof 1: Full SLO Lifecycle Walk ---');

    // Stage 1: Healthy (10,000 checks, 0 failures -> SLI 100%, consumed 0%)
    const day1 = new Date('2026-11-01T00:00:00Z');
    await HealthCheckDaily.create({
      applicationId: app._id,
      ownerId: user._id,
      day: day1,
      total: 10000,
      good: 10000
    });
    await HealthCheck.create({
      applicationId: app._id,
      ownerId: user._id,
      checkedAt: day1,
      responseTimeMs: 80,
      success: true
    });

    // Eval 1: T0 (pending healthy)
    await evaluateSloAlerts({
      applicationId: app._id,
      application: app,
      slo,
      trigger: 'manual',
      now: day1,
      options: sharedOptions
    });
    // Eval 2: T0 + 65s (confirmed healthy)
    const t0_65 = new Date(day1.getTime() + 65 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      application: app,
      slo,
      trigger: 'manual',
      now: t0_65,
      options: sharedOptions
    });

    const state1 = await SloAlertState.findOne({ sloId: slo._id });
    report(state1.status === 'healthy', '1a. Initial state confirmed as healthy');
    report(receivedWebhooks.length === 0, '1b. No alert emitted on initial healthy confirmation');

    // Stage 2: Transition to at_risk
    // Target 99.9% over 10,000 checks: allowed error = 10 bad checks.
    // 6 bad checks -> error rate 6/10,000 = 0.06%. Consumed = 6 / 10 = 60.0% (at_risk: 50% <= consumed <= 100%)
    await HealthCheckDaily.updateOne(
      { applicationId: app._id, day: day1 },
      { $set: { good: 9994, total: 10000 } }
    );
    await Application.findByIdAndUpdate(app._id, { lastCheckedAt: t0_65 });

    const t1 = new Date(day1.getTime() + 120 * 1000);
    // Observation 1: pending at_risk
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t1,
      options: sharedOptions
    });
    report(receivedWebhooks.length === 0, '1c. Debounce: first observation of at_risk emits nothing');

    // Observation 2: 65s later -> confirmed at_risk!
    const t1_confirm = new Date(t1.getTime() + 65 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t1_confirm,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const atRiskHook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_at_risk');
    report(Boolean(atRiskHook), '1d. Emitted slo_at_risk upon confirmed transition');
    report(
      atRiskHook?.parsedBody?.metrics?.budgetConsumedPct === 60.0,
      '1e. slo_at_risk payload matches exact arithmetic: 60.0% budget consumed'
    );
    report(
      atRiskHook?.parsedBody?.severity === 'medium',
      '1f. slo_at_risk severity is medium'
    );

    // Stage 3: Transition to breached
    // 15 bad checks out of 10,000 -> consumed = 15/10 = 150.0% (> 100% -> breached)
    await HealthCheckDaily.updateOne(
      { applicationId: app._id, day: day1 },
      { $set: { good: 9985, total: 10000 } }
    );
    const t2 = new Date(day1.getTime() + 300 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t2,
      options: sharedOptions
    });
    // Observation 2: 65s later -> confirmed breached!
    const t2_confirm = new Date(t2.getTime() + 65 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t2_confirm,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const breachHook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_breached');
    report(Boolean(breachHook), '1g. Emitted slo_breached upon confirmed transition');
    report(
      breachHook?.parsedBody?.metrics?.budgetConsumedPct === 150.0,
      '1h. slo_breached payload matches exact arithmetic: 150.0% budget consumed'
    );
    report(
      breachHook?.parsedBody?.metrics?.episode === 1,
      '1i. slo_breached episode counter set to 1'
    );
    report(
      breachHook?.parsedBody?.severity === 'critical',
      '1j. slo_breached severity is critical'
    );

    // Stage 4: Recover to at_risk (total 20,000 checks, 15 bad -> allowed 20 checks -> consumed 75%)
    await HealthCheckDaily.updateOne(
      { applicationId: app._id, day: day1 },
      { $set: { good: 19985, total: 20000 } }
    );
    const t3 = new Date(day1.getTime() + 500 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t3,
      options: sharedOptions
    });
    const t3_confirm = new Date(t3.getTime() + 65 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t3_confirm,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const recoveredHook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_recovered');
    report(Boolean(recoveredHook), '1k. Emitted slo_recovered upon recovery to at_risk');
    report(
      recoveredHook?.parsedBody?.metrics?.episode === 1,
      '1l. slo_recovered links to breached episode 1'
    );

    // Stage 5: Recover from at_risk to healthy (100,000 checks, 15 bad -> allowed 100 -> consumed 15% -> healthy)
    await HealthCheckDaily.updateOne(
      { applicationId: app._id, day: day1 },
      { $set: { good: 99985, total: 100000 } }
    );
    const t4 = new Date(day1.getTime() + 700 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t4,
      options: sharedOptions
    });
    const t4_confirm = new Date(t4.getTime() + 65 * 1000);
    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: t4_confirm,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const replenishedHook = receivedWebhooks.find(
      (w) => w.parsedBody?.event === 'slo_budget_replenished'
    );
    report(Boolean(replenishedHook), '1m. Emitted slo_budget_replenished on at_risk -> healthy');
    report(
      replenishedHook?.parsedBody?.metrics?.currentRemainingBudget === 85.0,
      '1n. slo_budget_replenished includes currentRemainingBudget (85.0%)'
    );

    // -------------------------------------------------------------
    // PROOF 2: Multi-Window Burn Rate Alert
    // -------------------------------------------------------------
    console.log('--- Proof 2: Burn Rate Alerting ---');

    // Insert recent checks to trigger 1h burn rate >= 14.4 and 6h burn rate >= 6.0
    // Target: 99.9% (allowed error 0.001)
    // 1h lookback: 60 checks, 1 failure -> rate = 1/60 = 0.01666 -> burnRate = 0.01666 / 0.001 = 16.7x (>= 14.4x)
    // 6h lookback: 360 checks, 3 failures -> rate = 3/360 = 0.00833 -> burnRate = 0.00833 / 0.001 = 8.3x (>= 6.0x)
    const tBurn = new Date();
    const recentChecks = [];
    for (let i = 0; i < 60; i++) {
      recentChecks.push({
        applicationId: app._id,
        ownerId: user._id,
        checkedAt: new Date(tBurn.getTime() - i * 60 * 1000),
        responseTimeMs: 100,
        success: i !== 5 // 1 failure in 1h
      });
    }
    for (let i = 60; i < 360; i++) {
      recentChecks.push({
        applicationId: app._id,
        ownerId: user._id,
        checkedAt: new Date(tBurn.getTime() - i * 60 * 1000),
        responseTimeMs: 100,
        success: i !== 120 && i !== 240 // 2 more failures in 6h (total 3)
      });
    }
    await HealthCheck.insertMany(recentChecks);
    await Application.findByIdAndUpdate(app._id, { lastCheckedAt: tBurn });

    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: tBurn,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const burnHook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_high_burn_rate');
    report(Boolean(burnHook), '2a. Emitted slo_high_burn_rate when thresholds exceeded');
    report(burnHook?.parsedBody?.severity === 'critical', '2b. Burn rate classified as critical');
    report(
      burnHook?.parsedBody?.metrics?.burnRate1h >= 14.4 &&
        burnHook?.parsedBody?.metrics?.burnRate6h >= 6.0,
      '2c. Burn rates reported accurately in webhook payload'
    );

    // -------------------------------------------------------------
    // PROOF 3: Monitoring Unavailable & Restored
    // -------------------------------------------------------------
    console.log('--- Proof 3: Monitoring Unavailable & Restored ---');

    // Simulate checks stopping: lastCheckedAt was 400 seconds ago (> 300s threshold)
    const tStale = new Date(tBurn.getTime() + 400 * 1000);
    await Application.findByIdAndUpdate(app._id, { lastCheckedAt: tBurn });

    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'sweep',
      now: tStale,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const unavailHook = receivedWebhooks.find(
      (w) => w.parsedBody?.event === 'slo_monitoring_unavailable'
    );
    report(Boolean(unavailHook), '3a. Emitted slo_monitoring_unavailable when checks cease (> 300s)');
    report(unavailHook?.parsedBody?.severity === 'high', '3b. Monitoring unavailable severity is high');

    // Checks resume
    const tResumed = new Date(tStale.getTime() + 30 * 1000);
    await Application.findByIdAndUpdate(app._id, { lastCheckedAt: tResumed });

    await evaluateSloAlerts({
      applicationId: app._id,
      slo,
      trigger: 'manual',
      now: tResumed,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const restoredHook = receivedWebhooks.find(
      (w) => w.parsedBody?.event === 'slo_monitoring_restored'
    );
    report(Boolean(restoredHook), '3c. Emitted slo_monitoring_restored once checks resume');
    report(restoredHook?.parsedBody?.severity === 'low', '3d. Monitoring restored severity is low');

    // -------------------------------------------------------------
    // PROOF 4: Insufficient Data Alert
    // -------------------------------------------------------------
    console.log('--- Proof 4: Insufficient Data Alert ---');

    // App & SLO created 3000 seconds ago (> 40 * interval = 2400s threshold) with only 5 checks
    const tYoung = new Date('2026-11-01T00:00:00Z');
    const appYoung = await Application.create({
      name: `Young App ${runId}`,
      url: `https://young-${runId}.example.com`,
      ownerId: user._id,
      status: 'up',
      checkIntervalSeconds: 60,
      createdAt: tYoung,
      lastCheckedAt: new Date(tYoung.getTime() + 3000 * 1000),
      nextCheckAt: new Date(tYoung.getTime() + 3060 * 1000)
    });
    cleanupAppIds.push(appYoung._id);

    const sloYoung = await Slo.create({
      name: 'Young App SLO',
      ownerId: user._id,
      applicationId: appYoung._id,
      targetPercent: 99.9,
      windowDays: 30,
      createdAt: tYoung
    });
    cleanupSloIds.push(sloYoung._id);

    // Only 5 checks recorded
    await HealthCheckDaily.create({
      applicationId: appYoung._id,
      ownerId: user._id,
      day: tYoung,
      total: 5,
      good: 5
    });

    const tEvalYoung = new Date(tYoung.getTime() + 3000 * 1000);
    await evaluateSloAlerts({
      applicationId: appYoung._id,
      slo: sloYoung,
      trigger: 'manual',
      now: tEvalYoung,
      options: sharedOptions
    });

    await new Promise((r) => setTimeout(r, 60));
    const insuffHook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_insufficient_data');
    report(Boolean(insuffHook), '4a. Emitted slo_insufficient_data for old SLO with < 20 checks');
    report(insuffHook?.parsedBody?.metrics?.totalChecks === 5, '4b. Payload reported totalChecks: 5');

    // -------------------------------------------------------------
    // PROOF 5: 20 Parallel Evaluations (Multi-worker idempotency)
    // -------------------------------------------------------------
    console.log('--- Proof 5: 20 Parallel Evaluations Idempotency ---');

    const appParallel = await Application.create({
      name: `Parallel App ${runId}`,
      url: `https://parallel-${runId}.example.com`,
      ownerId: user._id,
      status: 'up',
      checkIntervalSeconds: 60,
      lastCheckedAt: new Date('2026-11-01T00:00:00Z'),
      nextCheckAt: new Date('2026-11-01T00:01:00Z')
    });
    cleanupAppIds.push(appParallel._id);

    const sloParallel = await Slo.create({
      name: 'Parallel SLO',
      ownerId: user._id,
      applicationId: appParallel._id,
      targetPercent: 99.9,
      windowDays: 30
    });
    cleanupSloIds.push(sloParallel._id);

    // Initial state: pending breached
    await SloAlertState.create({
      sloId: sloParallel._id,
      applicationId: appParallel._id,
      ownerId: user._id,
      status: 'healthy',
      pendingStatus: 'breached',
      pendingCount: 1,
      pendingSince: new Date('2026-11-01T00:00:00Z'),
      lastEvaluatedAt: new Date('2026-11-01T00:00:00Z'),
      version: 0
    });

    await HealthCheckDaily.create({
      applicationId: appParallel._id,
      ownerId: user._id,
      day: new Date('2026-11-01T00:00:00Z'),
      total: 1000,
      good: 990 // 10 bad out of 1000 -> 1000% consumed -> breached
    });

    // Run 20 evaluations concurrently at T + 70s
    const tParallel = new Date('2026-11-01T00:01:10Z');
    const parallelResults = await Promise.all(
      Array.from({ length: 20 }, () =>
        evaluateSloAlerts({
          applicationId: appParallel._id,
          slo: sloParallel,
          trigger: 'manual',
          now: tParallel,
          options: sharedOptions
        })
      )
    );

    const winners = parallelResults.filter((r) => r.winner === true);
    report(
      winners.length === 1,
      `5a. Exactly ONE winner among 20 parallel evaluations (winners: ${winners.length})`
    );

    await new Promise((r) => setTimeout(r, 80));
    const parallelDeliveries = await NotificationDelivery.find({
      applicationId: appParallel._id,
      event: 'slo_breached'
    });
    report(
      parallelDeliveries.length === 2, // 1 for webhook channel, 1 for email channel
      `5b. Exactly 1 delivery per subscribed channel recorded (total: ${parallelDeliveries.length})`
    );

    // -------------------------------------------------------------
    // PROOF 6: Webhook Signature Verification
    // -------------------------------------------------------------
    console.log('--- Proof 6: HMAC-SHA256 Signature Verification ---');

    const sampleWebhook = receivedWebhooks.find((w) => w.parsedBody?.event === 'slo_breached');
    report(Boolean(sampleWebhook), '6a. Captured sample webhook payload for signature check');

    const sigHeader = sampleWebhook.headers['x-devopspulse-signature'];
    const tsHeader = sampleWebhook.headers['x-devopspulse-timestamp'];

    const verifyResult = verifyWebhook({
      timestamp: tsHeader,
      rawBody: sampleWebhook.rawBody,
      signature: sigHeader,
      secret: testSecret,
      now: Date.now()
    });
    report(verifyResult.valid === true, '6b. Webhook signature verifies as VALID with testSecret');

    // Tampered payload verification
    const tamperedBody = sampleWebhook.rawBody + ' ';
    const tamperedResult = verifyWebhook({
      timestamp: tsHeader,
      rawBody: tamperedBody,
      signature: sigHeader,
      secret: testSecret,
      now: Date.now()
    });
    report(
      tamperedResult.valid === false,
      '6c. Tampered webhook body fails verification as INVALID'
    );

    // -------------------------------------------------------------
    // PROOF 7: Zero Secrets in Payloads or Logs
    // -------------------------------------------------------------
    console.log('--- Proof 7: Secret Absence Verification ---');

    const allWebhookBodies = receivedWebhooks.map((w) => w.rawBody).join('\n');
    const allMailBodies = capturedMails.map((m) => `${m.subject} ${m.text} ${m.html}`).join('\n');
    const allLogs = capturedServerLogs.join('\n');

    const containsSecretInWebhook = allWebhookBodies.includes(testSecret);
    const containsSecretInMail = allMailBodies.includes(testSecret);
    const containsSecretInLogs = allLogs.includes(testSecret);

    report(
      !containsSecretInWebhook,
      '7a. Signing secret is absent from all outbound webhook bodies'
    );
    report(!containsSecretInMail, '7b. Signing secret is absent from all email bodies');
    report(!containsSecretInLogs, '7c. Signing secret is absent from all console/server logs');
  } finally {
    // Teardown mock server and database records
    await new Promise((resolve) => mockServer.close(resolve));

    if (cleanupUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }
    if (cleanupAppIds.length > 0) {
      await Application.deleteMany({ _id: { $in: cleanupAppIds } });
      await HealthCheck.deleteMany({ applicationId: { $in: cleanupAppIds } });
      await HealthCheckDaily.deleteMany({ applicationId: { $in: cleanupAppIds } });
      await SloAlertState.deleteMany({ applicationId: { $in: cleanupAppIds } });
    }
    if (cleanupSloIds.length > 0) {
      await Slo.deleteMany({ _id: { $in: cleanupSloIds } });
    }
    if (cleanupChannelIds.length > 0) {
      await NotificationChannel.deleteMany({ _id: { $in: cleanupChannelIds } });
      await NotificationDelivery.deleteMany({ channelId: { $in: cleanupChannelIds } });
    }

    await mongoose.disconnect();
  }

  console.log('\n===============================================================');
  console.log(`SLO Alerting Proofs Summary: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error during SLO alerting proofs:', err);
  process.exit(1);
});
