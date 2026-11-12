import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  encrypt,
  decrypt,
  generateWebhookSignature,
  stripCrlf,
  escapeHtml,
  maskWebhookUrl,
  generateSigningSecret
} from '../src/utils/crypto.js';

describe('Crypto & Sanitization Utilities', () => {
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('performs AES-256-GCM encryption and decryption round-trip successfully', () => {
    const message = 'https://webhook.example.com/services/T00000000/B00000000/mock_webhook_secret_payload';
    const encrypted = encrypt(message, testKeyHex);

    assert.notEqual(encrypted, message);
    assert.match(encrypted, /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

    const decrypted = decrypt(encrypted, testKeyHex);
    assert.equal(decrypted, message);
  });

  it('detects tampering and throws when ciphertext or auth tag is modified', () => {
    const message = 'super_secret_webhook_url';
    const encrypted = encrypt(message, testKeyHex);
    const parts = encrypted.split(':');

    // Tamper with ciphertext by flipping last hex digit
    const tamperedCipher = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tamperedBundle = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    assert.throws(() => {
      decrypt(tamperedBundle, testKeyHex);
    }, /Unsupported state or unable to authenticate data|bad decrypt/i);

    // Tamper with auth tag
    const tamperedTag = (parts[1][0] === 'f' ? '0' : 'f') + parts[1].slice(1);
    const tamperedTagBundle = `${parts[0]}:${tamperedTag}:${parts[2]}`;
    assert.throws(() => {
      decrypt(tamperedTagBundle, testKeyHex);
    }, /Unsupported state or unable to authenticate data|bad decrypt/i);
  });

  it('fails decryption when provided a different 32-byte key', () => {
    const otherKeyHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const encrypted = encrypt('private_payload', testKeyHex);

    assert.throws(() => {
      decrypt(encrypted, otherKeyHex);
    }, /Unsupported state or unable to authenticate data|bad decrypt/i);
  });

  it('generates HMAC-SHA256 signature matching a known test vector', () => {
    const secret = 'my_webhook_secret_key';
    const timestamp = '1700000000';
    const rawBody = JSON.stringify({ event: 'incident_opened', test: true });

    const expectedPayload = `${timestamp}.${rawBody}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');
    const signature = generateWebhookSignature(secret, timestamp, rawBody);

    assert.equal(signature, `sha256=${expectedHmac}`);
  });

  it('strips CR and LF characters to prevent header injection', () => {
    const maliciousSubject = 'Normal Subject\r\nBcc: victim@example.com\r\nX-Injected: true\nSecond line';
    const cleanSubject = stripCrlf(maliciousSubject);

    assert.equal(cleanSubject, 'Normal Subject Bcc: victim@example.com X-Injected: true Second line');
    assert.equal(cleanSubject.includes('\r'), false);
    assert.equal(cleanSubject.includes('\n'), false);
  });

  it('escapes HTML special characters to prevent XSS in email templates', () => {
    const unsafeText = '<script>alert("xss & harm")</script> \'quoted\'';
    const escaped = escapeHtml(unsafeText);

    assert.equal(escaped, '&lt;script&gt;alert(&quot;xss &amp; harm&quot;)&lt;/script&gt; &#39;quoted&#39;');
    assert.equal(escaped.includes('<'), false);
    assert.equal(escaped.includes('>'), false);
  });

  it('masks webhook URLs displaying only host and masked path', () => {
    const sampleUrl = 'https://webhook.example.com/services/T123/B456/789xyzToken';
    const masked = maskWebhookUrl(sampleUrl);

    assert.equal(masked.startsWith('https://webhook.example.com/'), true);
    assert.equal(masked.includes('789xyzToken'), false);
    assert.equal(masked.endsWith('***'), true);

    const genericUrl = 'https://example.com/alerts/webhook?token=secret123';
    const maskedGeneric = maskWebhookUrl(genericUrl);
    assert.equal(maskedGeneric.includes('token=secret123'), false);
    assert.equal(maskedGeneric.endsWith('***'), true);
  });

  it('generates random 32-byte hex signing secrets', () => {
    const secret1 = generateSigningSecret();
    const secret2 = generateSigningSecret();

    assert.match(secret1, /^[0-9a-f]{64}$/);
    assert.match(secret2, /^[0-9a-f]{64}$/);
    assert.notEqual(secret1, secret2);
  });
});

