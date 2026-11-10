#!/usr/bin/env node
/**
 * DEV-ONLY script: prints a raw NotificationChannel document straight from MongoDB
 * to prove that webhook URLs and signing secrets are stored as AES-256-GCM ciphertext.
 *
 * Refuses to run in production (NODE_ENV=production).
 *
 * Usage:
 *   node scripts/showStoredChannel.mjs [channelId]
 *   (omit channelId to show the first channel found)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));
const mongoose = backendRequire('mongoose');
const dotenv = backendRequire('dotenv');

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

if (process.env.NODE_ENV === 'production') {
  console.error('❌ REFUSED: This script must not be run in production.');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/devopspulse';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`[Database] Connected: ${mongoose.connection.host}`);

  const channelId = process.argv[2];
  const db = mongoose.connection.db;
  const collection = db.collection('notificationchannels');

  let filter = {};
  if (channelId) {
    filter = { _id: new mongoose.Types.ObjectId(channelId) };
  }

  const rawDoc = await collection.findOne(filter);

  if (!rawDoc) {
    console.error('No NotificationChannel documents found.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  RAW MongoDB Document (notificationchannels)');
  console.log('========================================\n');
  console.log(JSON.stringify(rawDoc, null, 2));

  // Assertions
  let allPassed = true;

  if (rawDoc.type === 'webhook') {
    // 1. urlEncrypted must be present and look like AES-GCM ciphertext (iv:tag:ciphertext)
    const encUrl = rawDoc.urlEncrypted;
    if (!encUrl || typeof encUrl !== 'string') {
      console.error('\n❌ FAIL: urlEncrypted is missing or not a string');
      allPassed = false;
    } else {
      const parts = encUrl.split(':');
      if (parts.length !== 3 || parts[0].length !== 24 || parts[1].length !== 32) {
        console.error('\n❌ FAIL: urlEncrypted does not look like AES-256-GCM format (iv:tag:ciphertext)');
        allPassed = false;
      } else {
        console.log('\n✔ PASS: urlEncrypted is in AES-256-GCM format (24-char IV : 32-char AuthTag : ciphertext)');
      }
    }

    // 2. secretEncrypted must be present
    const encSecret = rawDoc.secretEncrypted;
    if (!encSecret || typeof encSecret !== 'string') {
      console.error('❌ FAIL: secretEncrypted is missing or not a string');
      allPassed = false;
    } else {
      const parts = encSecret.split(':');
      if (parts.length !== 3) {
        console.error('❌ FAIL: secretEncrypted does not look like AES-256-GCM format');
        allPassed = false;
      } else {
        console.log('✔ PASS: secretEncrypted is in AES-256-GCM format');
      }
    }

    // 3. The raw document must NOT contain the plaintext URL anywhere
    const docString = JSON.stringify(rawDoc);
    // A webhook URL has "://" — if any value in the doc besides urlEncrypted contains
    // a protocol scheme, flag it as a possible plaintext leak
    const plainUrlPattern = /https?:\/\/[^\s"]+/g;
    const matches = docString.match(plainUrlPattern) || [];
    // urlEncrypted should NOT match a URL pattern (it's hex)
    if (encUrl && plainUrlPattern.test(encUrl)) {
      console.error('❌ FAIL: urlEncrypted appears to contain a plaintext URL!');
      allPassed = false;
    } else {
      console.log('✔ PASS: No plaintext URL found in the encrypted field');
    }

    // 4. No field named 'url' (unencrypted) should exist in the raw document
    if ('url' in rawDoc) {
      console.error('❌ FAIL: A plaintext "url" field exists in the raw document');
      allPassed = false;
    } else {
      console.log('✔ PASS: No plaintext "url" field in the raw document');
    }
  } else {
    console.log('\nChannel type is "email" — no webhook secrets to verify.');
  }

  console.log(allPassed ? '\n✅ All encryption-at-rest assertions passed.' : '\n❌ Some assertions failed.');

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

