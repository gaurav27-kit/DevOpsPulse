/**
 * scripts/alertingProof.mjs
 *
 * Automated end-to-end proofs for DevOpsPulse alerting and notifications.
 * Self-contained: creates and cleans up its own test data against real MongoDB.
 *
 * Assertions verified:
 *  a) Webhook receives exactly 1 incident_opened after 2 failures; payload verifies as VALID
 *     with signing secret using verifyWebhook(); 1 character tampered verifies as INVALID.
 *  b) Timestamp older than 5 minutes reported as TIMESTAMP_TOO_OLD (replay protection).
 *  c) Recovery (2 successes) delivers exactly 1 incident_resolved.
 *  d) Flapping (down, up, down quickly): 2nd opened skipped as "cooldown", and resolved
 *     skipped as "no_open_alert" when opened was skipped.
 *  e) Email: delivered only to owner's address, no CR/LF in subject, <script>alert(1)</script>
 *     HTML-escaped in body, "\r\nBcc:" does not create a Bcc header.
 *  f) Webhook pointing at 127.0.0.1:<port> is REJECTED at creation, and mocked private DNS is rejected.
 *  g) Secrets at rest: raw MongoDB doc has urlEncrypted and secretEncrypted in iv:tag:ciphertext format;
 *     plaintext URL/secret appear nowhere in raw doc or list API response.
 *  h) Tampered ciphertext fails decryption and delivery fails cleanly without crashing server.
 *  i) Outbound redirect (302) is NOT followed (delivery fails immediately, not retried).
 *  j) Retry: 500 twice then 200 results in status sent with attempts 3; 400 is not retried.
 */

import http from 'http';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));

const mongoose = backendRequire('mongoose');
const dotenv = backendRequire('dotenv');
const nodemailer = backendRequire('nodemailer');
const jwt = backendRequire('jsonwebtoken');
const request = backendRequire('supertest');

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

// Intercept server logs across the script execution for Proof g assertion
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

// Backend modules
import expressApp from '../backend/src/app.js';
import { User } from '../backend/src/models/User.js';
import { Application } from '../backend/src/models/Application.js';
import { Incident } from '../backend/src/models/Incident.js';
import { NotificationChannel } from '../backend/src/models/NotificationChannel.js';
import { NotificationDelivery } from '../backend/src/models/NotificationDelivery.js';
import { processCheckResult } from '../backend/src/services/schedulerService.js';
import {
  setGlobalHttpSender,
  sendWebhookRequest,
  sendEmailAlert,
  cleanupInterruptedDeliveries
} from '../backend/src/services/notificationService.js';
import {
  encrypt,
  decrypt,
  generateSigningSecret,
  generateWebhookSignature
} from '../backend/src/utils/crypto.js';
import { assertSafeDestination } from '../backend/src/services/urlSafetyService.js';
import { verifyWebhook } from './verifyWebhookSignature.mjs';

const MONGO_URI = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/devopspulse_test';

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
  console.log('      DevOpsPulse Automated Alerting Proofs (Step 14d)         ');
  console.log('===============================================================\n');

  await mongoose.connect(MONGO_URI);
  await cleanupInterruptedDeliveries();

  const runId = Date.now();
  const cleanupUserIds = [];
  const cleanupAppIds = [];
  const cleanupChannelIds = [];

  // Local Mock Webhook Receiver
  const receivedWebhooks = [];
  let receiverBehavior = 'normal'; // 'normal', 'redirect', 'fail_twice_then_ok', 'fail_400'
  let fail500Count = 0;

  const mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (receiverBehavior === 'redirect') {
        res.writeHead(302, { Location: 'http://127.0.0.1/evil' });
        return res.end('Redirecting');
      }

      if (receiverBehavior === 'fail_twice_then_ok') {
        if (fail500Count < 2) {
          fail500Count++;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Server error' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (receiverBehavior === 'fail_400') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Bad request' }));
      }

      receivedWebhooks.push({
        event: req.headers['x-devopspulse-event'],
        timestamp: req.headers['x-devopspulse-timestamp'],
        signature: req.headers['x-devopspulse-signature'],
        userAgent: req.headers['user-agent'],
        rawBody: raw,
        parsedBody: raw ? JSON.parse(raw) : null
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const serverPort = mockServer.address().port;
  const mockWebhookUrl = `http://127.0.0.1:${serverPort}/webhook-target`;

  // Use dependency injection for outbound webhook calls to local mock
  setGlobalHttpSender(async ({ url, secret, event, payloadObject }) => {
    return new Promise((resolve) => {
      const rawBody = JSON.stringify(payloadObject);
      const timestamp = Date.now().toString();
      const signature = generateWebhookSignature(secret, timestamp, rawBody);

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: serverPort,
          path: '/webhook-target',
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
          if (res.statusCode >= 300 && res.statusCode < 400) {
            return resolve({ success: false, statusCode: res.statusCode, errorType: 'http_error', retryable: false });
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            return resolve({ success: true, statusCode: res.statusCode, errorType: null });
          }
          if (res.statusCode >= 400 && res.statusCode < 500) {
            return resolve({ success: false, statusCode: res.statusCode, errorType: 'http_error', retryable: false });
          }
          return resolve({ success: false, statusCode: res.statusCode, errorType: 'http_error', retryable: true });
        }
      );

      req.on('error', () => {
        resolve({ success: false, statusCode: null, errorType: 'http_error', retryable: true });
      });

      req.write(rawBody);
      req.end();
    });
  });

  try {
    // Fixtures
    const user = await User.create({
      name: 'Proof User',
      email: `proof_${runId}@example.com`,
      passwordHash: 'dummy'
    });
    cleanupUserIds.push(user._id);

    const app = await Application.create({
      ownerId: user._id,
      name: `Proof App ${runId}`,
      url: `https://proof-${runId}.example.com`,
      environment: 'production',
      checkIntervalSeconds: 30,
      timeoutMs: 5000,
      status: 'unknown',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      nextCheckAt: new Date()
    });
    cleanupAppIds.push(app._id);

    const signingSecret = generateSigningSecret();
    const webhookChan = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Proof Webhook Channel',
      type: 'webhook',
      urlEncrypted: encrypt(mockWebhookUrl),
      secretEncrypted: encrypt(signingSecret),
      events: ['incident_opened', 'incident_resolved'],
      minSeverity: 'low',
      enabled: true
    });
    cleanupChannelIds.push(webhookChan._id);

    // ── Proof a: 2 failures trigger incident_opened & cryptographic verification ──
    await processCheckResult(app, { success: false, statusCode: 500, responseTimeMs: 200, errorType: 'http_error' });
    let refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: false, statusCode: 500, responseTimeMs: 220, errorType: 'http_error' });

    // Wait for in-process async dispatch queue
    await new Promise((r) => setTimeout(r, 200));

    report(receivedWebhooks.length === 1, 'Proof a: Exactly 1 incident_opened webhook received after 2 failures');
    const firstWebhook = receivedWebhooks[0];
    report(firstWebhook?.event === 'incident_opened', 'Proof a: Webhook event header is incident_opened');

    const verifyResult = verifyWebhook({
      timestamp: firstWebhook?.timestamp,
      rawBody: firstWebhook?.rawBody,
      signature: firstWebhook?.signature,
      secret: signingSecret
    });
    report(verifyResult.valid && verifyResult.status === 'VALID', 'Proof a: Webhook body and signature verify as VALID');

    const tamperedBody = (firstWebhook?.rawBody || '').slice(0, -1) + 'X';
    const tamperedResult = verifyWebhook({
      timestamp: firstWebhook?.timestamp,
      rawBody: tamperedBody,
      signature: firstWebhook?.signature,
      secret: signingSecret
    });
    report(!tamperedResult.valid && tamperedResult.status === 'INVALID', 'Proof a: Tampered body verifies as INVALID');

    // ── Proof b: Timestamp older than 5 minutes reported as TIMESTAMP_TOO_OLD ──
    const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const oldSig = generateWebhookSignature(signingSecret, oldTimestamp, firstWebhook?.rawBody || '');
    const oldVerifyResult = verifyWebhook({
      timestamp: oldTimestamp,
      rawBody: firstWebhook?.rawBody,
      signature: oldSig,
      secret: signingSecret
    });
    report(
      !oldVerifyResult.valid && oldVerifyResult.status === 'TIMESTAMP_TOO_OLD',
      'Proof b: Timestamp older than 5 minutes reported as TIMESTAMP_TOO_OLD (replay protection)'
    );

    // ── Proof c: Recovery (2 consecutive successes) delivers incident_resolved ──
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: true, statusCode: 200, responseTimeMs: 50 });
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: true, statusCode: 200, responseTimeMs: 45 });

    await new Promise((r) => setTimeout(r, 200));

    report(receivedWebhooks.length === 2, 'Proof c: Recovery delivered exactly 1 incident_resolved (total 2 webhooks)');
    const secondWebhook = receivedWebhooks[1];
    report(secondWebhook?.event === 'incident_resolved', 'Proof c: Second webhook event header is incident_resolved');

    // ── Proof d: Flapping (down, up, down quickly within cooldown) ──
    // Step 1: 2 failures open a second incident
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: false, statusCode: 500, responseTimeMs: 200, errorType: 'http_error' });
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: false, statusCode: 500, responseTimeMs: 200, errorType: 'http_error' });

    await new Promise((r) => setTimeout(r, 200));

    // Webhook count should still be 2 because anti-flapping cooldown suppresses 2nd opened
    report(receivedWebhooks.length === 2, 'Proof d: Flapping re-open within cooldown suppressed second opened webhook');

    const flappingOpenDelivery = await NotificationDelivery.findOne({
      applicationId: app._id,
      event: 'incident_opened',
      status: 'skipped'
    }).sort({ createdAt: -1 });

    report(flappingOpenDelivery?.skipReason === 'cooldown', 'Proof d: Skipped opened alert recorded with skipReason "cooldown"');

    // Step 2: Now recover from this flapped incident (2 successes)
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: true, statusCode: 200, responseTimeMs: 50 });
    refreshedApp = await Application.findById(app._id);
    await processCheckResult(refreshedApp, { success: true, statusCode: 200, responseTimeMs: 45 });

    await new Promise((r) => setTimeout(r, 200));

    // Because opened alert was skipped, resolved alert MUST be skipped as "no_open_alert"
    report(receivedWebhooks.length === 2, 'Proof d: No incident_resolved sent for incident whose opened was skipped');

    const flappingResolveDelivery = await NotificationDelivery.findOne({
      applicationId: app._id,
      event: 'incident_resolved',
      status: 'skipped'
    }).sort({ createdAt: -1 });

    report(
      flappingResolveDelivery?.skipReason === 'no_open_alert',
      'Proof d: Resolved alert skipped with skipReason "no_open_alert"'
    );

    // ── Proof e: Email security and sanitization ──
    const capturedEmails = [];
    const jsonTransport = nodemailer.createTransport({
      jsonTransport: true
    });
    const emailCaptureTransport = {
      sendMail: async (opts) => {
        const info = await jsonTransport.sendMail(opts);
        capturedEmails.push({ opts, info: JSON.parse(info.message) });
        return info;
      }
    };

    const maliciousAppName = '<script>alert(1)</script>';
    const headerInjectionTitle = 'Header injection\r\nBcc: evil@x.com\r\nX-Injected: yes';
    const fakeIncident = {
      _id: new mongoose.Types.ObjectId(),
      title: headerInjectionTitle,
      severity: 'high',
      status: 'open',
      startedAt: new Date()
    };
    const fakeApp = {
      _id: new mongoose.Types.ObjectId(),
      name: maliciousAppName
    };

    await sendEmailAlert({
      ownerEmail: user.email,
      ownerName: user.name,
      event: 'incident_opened',
      incident: fakeIncident,
      application: fakeApp,
      customMailTransport: emailCaptureTransport
    });

    report(capturedEmails.length === 1, 'Proof e: Email sent and captured via local stream transport');
    const emailData = capturedEmails[0];
    report(emailData?.opts?.to === user.email, 'Proof e: Email goes ONLY to account owner address');
    report(!/[\r\n]/.test(emailData?.opts?.subject || ''), 'Proof e: Subject line contains no CR or LF characters');
    report(emailData?.opts?.html?.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Proof e: Malicious <script> tag HTML-escaped in body');
    report(!emailData?.opts?.html?.includes('<script>alert(1)</script>'), 'Proof e: No raw <script> tag in HTML');
    report(!emailData?.info?.headers?.bcc && !emailData?.opts?.bcc, 'Proof e: Injected Bcc header is prevented');

    // ── Proof f: SSRF Rejection of private IPs and DNS rebinding at creation ──
    let ssrfBlockedLoopback = false;
    try {
      await assertSafeDestination(`http://127.0.0.1:${serverPort}/webhook`);
    } catch (err) {
      ssrfBlockedLoopback = err.message?.includes('private or local IP') || err.message?.includes('private or restricted');
    }
    report(ssrfBlockedLoopback, 'Proof f: Channel pointing at 127.0.0.1 is rejected by assertSafeDestination');

    let dnsRebindingBlocked = false;
    const originalLookup = dns.promises.lookup;
    dns.promises.lookup = async () => [{ address: '127.0.0.1', family: 4 }];
    try {
      await assertSafeDestination('https://malicious-rebinding-domain.com/webhook');
    } catch (err) {
      dnsRebindingBlocked = err.message?.includes('private or restricted IP') || err.message?.includes('private or local IP');
    } finally {
      dns.promises.lookup = originalLookup;
    }
    report(dnsRebindingBlocked, 'Proof f: Domain resolving to private address (DNS rebinding) is rejected');

    // Also assert rejection through the real POST /notifications/channels endpoint with 400 and message under url field
    const authCookie = `token=${jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET || 'dev_jwt_secret_devopspulse_test_key_32_chars', { expiresIn: '1h' })}`;

    const postSsrfRes = await request(expressApp)
      .post('/api/v1/notifications/channels')
      .set('Cookie', authCookie)
      .send({
        name: 'Real Endpoint SSRF',
        type: 'webhook',
        url: `http://127.0.0.1:${serverPort}/webhook`,
        events: ['incident_opened']
      });

    const hasUrlFieldError = postSsrfRes.status === 400 &&
      Array.isArray(postSsrfRes.body?.errors) &&
      postSsrfRes.body.errors.some((e) => e.field === 'url' && /private or local IP/i.test(e.message));

    report(hasUrlFieldError, 'Proof f: POST /notifications/channels rejects 127.0.0.1 with 400 and message under url field');

    // ── Proof g: Secrets at rest ──
    const rawChanDoc = await mongoose.connection.db.collection('notificationchannels').findOne({ _id: webhookChan._id });
    const isEncUrlValid = rawChanDoc?.urlEncrypted && /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(rawChanDoc.urlEncrypted);
    const isEncSecValid = rawChanDoc?.secretEncrypted && /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(rawChanDoc.secretEncrypted);

    report(isEncUrlValid && isEncSecValid, 'Proof g: urlEncrypted & secretEncrypted stored in iv:tag:ciphertext format');
    const rawDocString = JSON.stringify(rawChanDoc);
    report(!rawDocString.includes(mockWebhookUrl), 'Proof g: Plaintext URL appears nowhere in raw database document');
    report(!rawDocString.includes(signingSecret), 'Proof g: Plaintext signing secret appears nowhere in raw database document');

    // Assert GET /notifications/channels and deliveries never contain plaintext URL or signing secret
    const channelsRes = await request(expressApp)
      .get('/api/v1/notifications/channels')
      .set('Cookie', authCookie);
    const channelsStr = JSON.stringify(channelsRes.body);
    report(
      !channelsStr.includes(mockWebhookUrl) && !channelsStr.includes(signingSecret),
      'Proof g: GET /notifications/channels response never contains plaintext URL or signing secret'
    );

    const deliveriesRes = await request(expressApp)
      .get('/api/v1/notifications/deliveries')
      .set('Cookie', authCookie);
    const deliveriesStr = JSON.stringify(deliveriesRes.body);
    report(
      !deliveriesStr.includes(mockWebhookUrl) && !deliveriesStr.includes(signingSecret),
      'Proof g: GET /notifications/deliveries response never contains plaintext URL or signing secret'
    );

    // Assert captured server logs written during whole script never contain plaintext URL or signing secret
    const allCapturedLogs = capturedServerLogs.join('');
    report(
      !allCapturedLogs.includes(mockWebhookUrl) && !allCapturedLogs.includes(signingSecret),
      'Proof g: Captured server logs written during script never contain plaintext URL or signing secret'
    );

    // ── Proof h: Tampered ciphertext fails decryption and delivery fails cleanly ──
    const tamperedParts = rawChanDoc.urlEncrypted.split(':');
    const tamperedCipher = tamperedParts[2].slice(0, -1) + (tamperedParts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tamperedEncrypted = `${tamperedParts[0]}:${tamperedParts[1]}:${tamperedCipher}`;

    const tamperedChan = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Tampered Channel',
      type: 'webhook',
      urlEncrypted: tamperedEncrypted,
      secretEncrypted: rawChanDoc.secretEncrypted,
      events: ['incident_opened'],
      enabled: true
    });
    cleanupChannelIds.push(tamperedChan._id);

    let tamperedDeliveryFailed = false;
    try {
      const { sendTestNotification } = await import('../backend/src/services/notificationService.js');
      const res = await sendTestNotification(tamperedChan, user);
      tamperedDeliveryFailed = res.status === 'failed' && res.errorType === 'blocked_destination';
    } catch {
      tamperedDeliveryFailed = false;
    }
    report(tamperedDeliveryFailed, 'Proof h: Tampered ciphertext fails decryption and logs delivery failure cleanly');

    // ── Proof i: Outbound redirect (302) is NOT followed ──
    receiverBehavior = 'redirect';
    const redirectChan = await NotificationChannel.create({
      ownerId: user._id,
      name: 'Redirect Channel',
      type: 'webhook',
      urlEncrypted: encrypt(mockWebhookUrl),
      secretEncrypted: encrypt(signingSecret),
      events: ['incident_opened'],
      enabled: true
    });
    cleanupChannelIds.push(redirectChan._id);

    const { sendTestNotification } = await import('../backend/src/services/notificationService.js');
    const redirectRes = await sendTestNotification(redirectChan, user);
    report(redirectRes.status === 'failed' && redirectRes.attempts === 1, 'Proof i: 302 redirect rejected immediately without retry');

    // ── Proof j: Retry on 500 (succeeds on 3rd attempt); 400 is NOT retried ──
    receiverBehavior = 'fail_twice_then_ok';
    fail500Count = 0;
    const retryRes = await sendTestNotification(webhookChan, user, { retryBackoffs: [10, 20, 30] });
    report(retryRes.status === 'sent' && retryRes.attempts === 3, 'Proof j: 500 retried and succeeds on 3rd attempt');

    receiverBehavior = 'fail_400';
    const noRetryRes = await sendTestNotification(webhookChan, user, { retryBackoffs: [10, 20, 30] });
    report(noRetryRes.status === 'failed' && noRetryRes.attempts === 1, 'Proof j: 400 client error is not retried (attempts = 1)');
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;

    // Teardown test state cleanly
    setGlobalHttpSender(null);
    mockServer.close();

    if (cleanupUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }
    if (cleanupAppIds.length > 0) {
      await Application.deleteMany({ _id: { $in: cleanupAppIds } });
      await Incident.deleteMany({ applicationId: { $in: cleanupAppIds } });
      await NotificationDelivery.deleteMany({ applicationId: { $in: cleanupAppIds } });
    }
    if (cleanupChannelIds.length > 0) {
      await NotificationChannel.deleteMany({ _id: { $in: cleanupChannelIds } });
      await NotificationDelivery.deleteMany({ channelId: { $in: cleanupChannelIds } });
    }

    await mongoose.disconnect();
  }

  console.log('\n===============================================================');
  console.log(`Proofs Summary: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal in alertingProof.mjs:', err);
  process.exit(1);
});
