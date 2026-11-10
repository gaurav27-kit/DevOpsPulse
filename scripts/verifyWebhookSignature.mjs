#!/usr/bin/env node
/**
 * Verifies a DevOpsPulse webhook signature against a raw body.
 *
 * Usage with flags:
 *   node scripts/verifyWebhookSignature.mjs --body-file <path> --timestamp <ts> --signature <sig> --secret <sec>
 *
 * Usage (positional arguments):
 *   node scripts/verifyWebhookSignature.mjs <timestamp> <rawBody> <signatureHeader> <secret>
 *
 * Usage (JSON file):
 *   node scripts/verifyWebhookSignature.mjs --file payload.json
 *
 * The signature header must be in the format: sha256=<hex_hmac>
 * Prints VALID or INVALID (or "SIGNATURE VALID but TIMESTAMP TOO OLD (replay protection)")
 */
import crypto from 'crypto';
import fs from 'fs';

export function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWebhook({ timestamp, rawBody, signature, secret, now = Date.now() }) {
  if (!timestamp || rawBody === undefined || !signature || !secret) {
    return { valid: false, status: 'MISSING_FIELDS', message: 'Missing required parameters' };
  }

  const payload = `${timestamp}.${rawBody}`;
  const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedSignature = `sha256=${expectedHmac}`;
  const receivedSignature = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;

  const sigMatches = constantTimeCompare(expectedSignature, receivedSignature);

  const tsMs = Number(timestamp);
  const ageMs = now - tsMs;
  const isTooOld = Number.isNaN(tsMs) || ageMs > 5 * 60 * 1000 || ageMs < -60_000;

  if (sigMatches && isTooOld) {
    return {
      valid: false,
      sigMatches: true,
      status: 'TIMESTAMP_TOO_OLD',
      message: 'SIGNATURE VALID but TIMESTAMP TOO OLD (replay protection)',
      expectedSignature,
      receivedSignature
    };
  }

  if (sigMatches) {
    return {
      valid: true,
      sigMatches: true,
      status: 'VALID',
      message: 'VALID',
      expectedSignature,
      receivedSignature
    };
  }

  return {
    valid: false,
    sigMatches: false,
    status: 'INVALID',
    message: 'INVALID',
    expectedSignature,
    receivedSignature
  };
}

// CLI Execution check
if (process.argv[1] && process.argv[1].endsWith('verifyWebhookSignature.mjs')) {
  const args = process.argv.slice(2);
  let timestamp, rawBody, signature, secret;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--body-file' && args[i + 1]) {
      rawBody = fs.readFileSync(args[++i], 'utf8');
    } else if (args[i] === '--timestamp' && args[i + 1]) {
      timestamp = args[++i];
    } else if (args[i] === '--signature' && args[i + 1]) {
      signature = args[++i];
    } else if (args[i] === '--secret' && args[i + 1]) {
      secret = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      const parsed = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
      timestamp = parsed.timestamp;
      rawBody = parsed.rawBody;
      signature = parsed.signature;
      secret = parsed.secret;
    }
  }

  // Fallback to positional arguments if flags not provided
  if (!timestamp && args.length >= 4 && !args[0].startsWith('--')) {
    timestamp = args[0];
    rawBody = args[1];
    signature = args[2];
    secret = args[3];
  }

  if (!timestamp || rawBody === undefined || !signature || !secret) {
    console.error('Usage:');
    console.error('  node scripts/verifyWebhookSignature.mjs --body-file <path> --timestamp <ts> --signature <sig> --secret <sec>');
    console.error('  node scripts/verifyWebhookSignature.mjs <timestamp> <rawBody> <signatureHeader> <secret>');
    console.error('  node scripts/verifyWebhookSignature.mjs --file payload.json');
    process.exit(2);
  }

  const result = verifyWebhook({ timestamp, rawBody, signature, secret });
  console.log(result.message);

  if (result.status === 'VALID') {
    process.exit(0);
  } else if (result.status === 'TIMESTAMP_TOO_OLD') {
    process.exit(1);
  } else {
    console.log(`  Expected: ${result.expectedSignature}`);
    console.log(`  Received: ${result.receivedSignature}`);
    process.exit(1);
  }
}
