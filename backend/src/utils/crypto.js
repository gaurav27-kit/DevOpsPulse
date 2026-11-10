import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * Validates and returns a 32-byte buffer key from a hex string.
 */
export function getEncryptionKey(overrideKeyHex) {
  const keyHex = overrideKeyHex || env.NOTIFICATION_ENCRYPTION_KEY;
  if (!keyHex || typeof keyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a string using AES-256-GCM.
 * Returns formatted string: `${ivHex}:${authTagHex}:${ciphertextHex}`
 */
export function encrypt(plaintext, overrideKeyHex) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('Plaintext to encrypt must be a string.');
  }

  const key = getEncryptionKey(overrideKeyHex);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a formatted string `${ivHex}:${authTagHex}:${ciphertextHex}` using AES-256-GCM.
 * Throws if corrupted, tampered, or bad key.
 */
export function decrypt(encryptedBundle, overrideKeyHex) {
  if (!encryptedBundle || typeof encryptedBundle !== 'string') {
    throw new TypeError('Encrypted bundle must be a string in format iv:tag:ciphertext.');
  }

  const parts = encryptedBundle.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted bundle. Expected format: iv:tag:ciphertext.');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  if (ivHex.length !== 24 || tagHex.length !== 32) {
    throw new Error('Invalid IV or auth tag length for AES-256-GCM.');
  }

  const key = getEncryptionKey(overrideKeyHex);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generates HMAC-SHA256 signature for webhook verification.
 * Header value: "sha256=" + hex
 */
export function generateWebhookSignature(secret, timestamp, rawBody) {
  const payload = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hmac}`;
}

/**
 * Strips CR (\r) and LF (\n) characters to prevent email header / subject injection.
 */
export function stripCrlf(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Escapes HTML characters (&, <, >, ", ') to prevent XSS in HTML notification templates.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Masks a webhook URL so secrets/tokens in the path/query are never returned in list responses.
 * Retains protocol and hostname, but masks the path (e.g. https://example.com/***).
 */
export function maskWebhookUrl(fullUrl) {
  if (!fullUrl || typeof fullUrl !== 'string') return '';
  try {
    const parsed = new URL(fullUrl);
    if (!parsed.pathname || parsed.pathname === '/') {
      return `${parsed.protocol}//${parsed.host}/***`;
    }
    const visiblePrefix = parsed.pathname.slice(0, Math.min(5, parsed.pathname.length));
    return `${parsed.protocol}//${parsed.host}${visiblePrefix}***`;
  } catch {
    return '***';
  }
}

/**
 * Generates a random 32-byte hex string (64 characters) suitable for webhook signing secrets.
 */
export function generateSigningSecret() {
  return crypto.randomBytes(32).toString('hex');
}

