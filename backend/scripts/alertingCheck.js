/**
 * backend/scripts/alertingCheck.js
 *
 * Integration test for the full alerting and notification lifecycle against a real MongoDB connection.
 * Spins up a local mock webhook HTTP server, verifies HMAC-SHA256 signatures,
 * drives processCheckResult through 2 failures (incident opened) and 2 successes (incident resolved),
 * tests cooldown suppression on quick re-open, and thoroughly cleans up all test state.
 *
 * Run: npm run check:alerting (or node scripts/alertingCheck.js in backend/)
 */

import http from 'http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Bootstrap environment from backend config
import '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Application } from '../src/models/Application.js';
import { Incident } from '../src/models/Incident.js';
import { HealthCheck } from '../src/models/HealthCheck.js';
import { NotificationChannel } from '../src/models/NotificationChannel.js';
import { NotificationDelivery } from '../src/models/NotificationDelivery.js';
import { processCheckResult } from '../src/services/schedulerService.js';
import {
  setGlobalHttpSender,
  cleanupInterruptedDeliveries
} from '../src/services/notificationService.js';
import { encrypt, generateSigningSecret, generateWebhookSignature } from '../src/utils/crypto.js';

// ─── Assertion Harness ────────────────────────────────────────────────────────

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

// ─── Main Lifecycle Verification ──────────────────────────────────────────────

async function main() {
  console.log('\n====================================================');
  console.log('       DevOpsPulse Alerting & Webhook Check         ');
  console.log('====================================================\n');

  await connectDB();

  // Clean any interrupted deliveries from previous runs
  await cleanupInterruptedDeliveries();

  const suffix = Date.now();
  const receivedWebhooks = [];

  // 1. Start local mock HTTP webhook server on random available port
  const mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      receivedWebhooks.push({
        event: req.headers['x-devopspulse-event'],
        timestamp: req.headers['x-devopspulse-timestamp'],
        signature: req.headers['x-devopspulse-signature'],
        userAgent: req.headers['user-agent'],
        body: JSON.parse(raw),
        rawBody: raw
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const serverPort = mockServer.address().port;
  const mockReceiverUrl = `http://127.0.0.1:${serverPort}/webhook-collector`;

  // 2. Wire injected HTTP sender to route to local mock webhook server
  setGlobalHttpSender(async ({ secret, event, payloadObject }) => {
    return new Promise((resolve) => {
      const rawBody = JSON.stringify(payloadObject);
      const timestamp = Date.now().toString();
      const signature = generateWebhookSignature(secret, timestamp, rawBody);

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/webhook-collector',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(rawBody),
            'User-Agent': 'DevOpsPulse/1.0',
            'X-DevOpsPulse-Event': event,
            'X-DevOpsPulse-Timestamp': timestamp,
            'X-DevOpsPulse-Signature': signature
          }
        },
        (res) => {
          res.resume();
          resolve({ success: true, statusCode: res.statusCode, errorType: null });
        }
      );

      req.on('error', (err) => {
        resolve({ success: false, statusCode: null, errorType: 'http_error' });
      });

      req.write(rawBody);
      req.end();
    });
  });

  let user = null;
  let app = null;
  let channel = null;
  const signingSecret = generateSigningSecret();

  try {
    // 3. Create test fixtures
    user = await User.create({
      name: 'Alerting Test Owner',
      email: `alert_owner_${suffix}@test.local`,
      passwordHash: await bcrypt.hash('Secret123!', 10)
    });

    app = await Application.create({
      ownerId: user._id,
      name: `Alerting Target App ${suffix}`,
      url: `https://app-${suffix}.example.com`,
      environment: 'production',
      checkIntervalSeconds: 30,
      timeoutMs: 5000,
      status: 'unknown',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      nextCheckAt: new Date()
    });

    channel = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Test Webhook Collector',
      type: 'webhook',
      urlEncrypted: encrypt(mockReceiverUrl),
      secretEncrypted: encrypt(signingSecret),
      events: ['incident_opened', 'incident_resolved'],
      minSeverity: 'low',
      enabled: true
    });

    console.log('>>> Step 1: First failure (consecutiveFailures = 1, status stays unknown)...');
    await processCheckResult(app, {
      success: false,
      statusCode: 500,
      responseTimeMs: 220,
      errorType: 'http_error',
      errorMessage: 'First failure'
    });

    await new Promise((r) => setTimeout(r, 100));
    assertEqual(receivedWebhooks.length, 0, 'No webhook sent on first failure (needs 2 failures)');

    console.log('\n>>> Step 2: Second consecutive failure (incident_opened)...');
    let freshApp = await Application.findById(app._id);
    await processCheckResult(freshApp, {
      success: false,
      statusCode: 500,
      responseTimeMs: 250,
      errorType: 'http_error',
      errorMessage: 'Second consecutive failure'
    });

    // Wait for in-process dispatch queue
    await new Promise((r) => setTimeout(r, 200));

    assertEqual(receivedWebhooks.length, 1, 'Exactly one webhook received for incident_opened');
    const openHook = receivedWebhooks[0];
    assertEqual(openHook?.event, 'incident_opened', 'Webhook event is incident_opened');
    assertEqual(openHook?.body?.application?.name, app.name, 'Payload contains application name');
    assert(openHook?.body?.incident?.id, 'Payload contains incident id');

    // Verify HMAC-SHA256 signature
    const expectedOpenPayload = `${openHook.timestamp}.${openHook.rawBody}`;
    const expectedOpenHmac = crypto
      .createHmac('sha256', signingSecret)
      .update(expectedOpenPayload)
      .digest('hex');
    assertEqual(
      openHook.signature,
      `sha256=${expectedOpenHmac}`,
      'Cryptographic HMAC-SHA256 signature is valid'
    );

    // Verify NotificationDelivery record
    const openDelivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      event: 'incident_opened',
      status: 'sent'
    });
    assert(openDelivery !== null, 'NotificationDelivery record created with status: sent');
    assertEqual(openDelivery?.attempts, 1, 'Delivery recorded 1 attempt');

    console.log('\n>>> Step 3: First recovery success (consecutiveSuccesses = 1, incident stays active)...');
    freshApp = await Application.findById(app._id);
    await processCheckResult(freshApp, {
      success: true,
      statusCode: 200,
      responseTimeMs: 110,
      errorType: null,
      errorMessage: null
    });

    await new Promise((r) => setTimeout(r, 100));
    assertEqual(receivedWebhooks.length, 1, 'No resolved webhook yet (needs 2 consecutive successes)');

    console.log('\n>>> Step 4: Second consecutive success (incident_resolved)...');
    freshApp = await Application.findById(app._id);
    await processCheckResult(freshApp, {
      success: true,
      statusCode: 200,
      responseTimeMs: 105,
      errorType: null,
      errorMessage: null
    });

    await new Promise((r) => setTimeout(r, 200));

    assertEqual(receivedWebhooks.length, 2, 'Exactly 2 webhooks received total (1 opened + 1 resolved)');
    const resolveHook = receivedWebhooks[1];
    assertEqual(resolveHook?.event, 'incident_resolved', 'Second webhook event is incident_resolved');
    assertEqual(resolveHook?.body?.incident?.status, 'resolved', 'Incident status is resolved');

    const resolveDelivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      event: 'incident_resolved',
      status: 'sent'
    });
    assert(resolveDelivery !== null, 'NotificationDelivery record created for incident_resolved with status: sent');

    console.log('\n>>> Step 5: Anti-flapping cooldown test on quick re-open...');
    // Immediately trigger 2 failures again within the 5-minute cooldown window
    freshApp = await Application.findById(app._id);
    await processCheckResult(freshApp, {
      success: false,
      statusCode: 502,
      responseTimeMs: 200,
      errorType: 'http_error',
      errorMessage: 'Flapping failure 1'
    });

    freshApp = await Application.findById(app._id);
    await processCheckResult(freshApp, {
      success: false,
      statusCode: 502,
      responseTimeMs: 210,
      errorType: 'http_error',
      errorMessage: 'Flapping failure 2'
    });

    await new Promise((r) => setTimeout(r, 200));

    // Webhooks count should NOT have increased because cooldown suppressed dispatch
    assertEqual(
      receivedWebhooks.length,
      2,
      'Anti-flapping cooldown prevented duplicate opened webhook during cooldown window'
    );

    const skippedDelivery = await NotificationDelivery.findOne({
      channelId: channel._id,
      event: 'incident_opened',
      status: 'skipped'
    });
    assert(skippedDelivery !== null, 'NotificationDelivery record created with status: skipped');
    assertEqual(skippedDelivery?.skipReason, 'cooldown', 'Skip reason recorded as cooldown');

  } finally {
    // 4. Clean up state and tear down servers
    console.log('\n>>> Cleaning up test resources...');
    setGlobalHttpSender(null);
    mockServer.close();

    if (user) {
      await NotificationDelivery.deleteMany({ ownerId: user._id });
      await NotificationChannel.deleteMany({ ownerId: user._id });
      await Incident.deleteMany({ ownerId: user._id });
      await HealthCheck.deleteMany({ ownerId: user._id });
      await Application.deleteMany({ ownerId: user._id });
      await User.deleteOne({ _id: user._id });
    }

    await mongoose.connection.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.error('\n❌ Alerting check failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All alerting lifecycle checks passed successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Alerting check encountered unhandled error:', err);
  process.exit(1);
});
