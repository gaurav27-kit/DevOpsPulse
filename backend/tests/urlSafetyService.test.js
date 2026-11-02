/**
 * Tests for isPrivateOrSpecialIp from urlSafetyService.js
 *
 * Covers IPv4 private ranges, IPv6 special ranges, IPv4-mapped IPv6,
 * and confirms that public IPs are NOT blocked.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateOrSpecialIp } from '../src/services/urlSafetyService.js';

// ── IPv4: must be BLOCKED ─────────────────────────────────────────────────────
describe('isPrivateOrSpecialIp – IPv4 blocked', () => {
  it('blocks loopback 127.0.0.1', () => {
    assert.equal(isPrivateOrSpecialIp('127.0.0.1'), true);
  });

  it('blocks loopback 127.255.255.255', () => {
    assert.equal(isPrivateOrSpecialIp('127.255.255.255'), true);
  });

  it('blocks 0.0.0.0', () => {
    assert.equal(isPrivateOrSpecialIp('0.0.0.0'), true);
  });

  it('blocks RFC-1918 10.x.x.x', () => {
    assert.equal(isPrivateOrSpecialIp('10.1.2.3'), true);
  });

  it('blocks RFC-1918 10.0.0.1', () => {
    assert.equal(isPrivateOrSpecialIp('10.0.0.1'), true);
  });

  it('blocks RFC-1918 172.16.0.1 (start of /12)', () => {
    assert.equal(isPrivateOrSpecialIp('172.16.0.1'), true);
  });

  it('blocks RFC-1918 172.20.0.1 (middle of /12)', () => {
    assert.equal(isPrivateOrSpecialIp('172.20.0.1'), true);
  });

  it('blocks RFC-1918 172.31.255.255 (end of /12)', () => {
    assert.equal(isPrivateOrSpecialIp('172.31.255.255'), true);
  });

  it('blocks RFC-1918 192.168.0.1', () => {
    assert.equal(isPrivateOrSpecialIp('192.168.0.1'), true);
  });

  it('blocks RFC-1918 192.168.255.255', () => {
    assert.equal(isPrivateOrSpecialIp('192.168.255.255'), true);
  });

  it('blocks link-local 169.254.0.1', () => {
    assert.equal(isPrivateOrSpecialIp('169.254.0.1'), true);
  });

  it('blocks cloud metadata 169.254.169.254', () => {
    assert.equal(isPrivateOrSpecialIp('169.254.169.254'), true);
  });

  it('blocks CGNAT 100.64.0.1 (start of /10)', () => {
    assert.equal(isPrivateOrSpecialIp('100.64.0.1'), true);
  });

  it('blocks CGNAT 100.127.255.255 (end of /10)', () => {
    assert.equal(isPrivateOrSpecialIp('100.127.255.255'), true);
  });
});

// ── IPv4: must be ALLOWED ─────────────────────────────────────────────────────
describe('isPrivateOrSpecialIp – IPv4 public (allowed)', () => {
  it('allows Google DNS 8.8.8.8', () => {
    assert.equal(isPrivateOrSpecialIp('8.8.8.8'), false);
  });

  it('allows example.com IP 93.184.216.34', () => {
    assert.equal(isPrivateOrSpecialIp('93.184.216.34'), false);
  });

  it('allows 1.1.1.1 (Cloudflare)', () => {
    assert.equal(isPrivateOrSpecialIp('1.1.1.1'), false);
  });

  it('does NOT block 172.15.x (just outside /12)', () => {
    assert.equal(isPrivateOrSpecialIp('172.15.255.255'), false);
  });

  it('does NOT block 172.32.0.0 (just past /12)', () => {
    assert.equal(isPrivateOrSpecialIp('172.32.0.0'), false);
  });

  it('does NOT block 100.63.255.255 (just before CGNAT range)', () => {
    assert.equal(isPrivateOrSpecialIp('100.63.255.255'), false);
  });

  it('does NOT block 100.128.0.0 (just after CGNAT range)', () => {
    assert.equal(isPrivateOrSpecialIp('100.128.0.0'), false);
  });
});

// ── IPv6: must be BLOCKED ─────────────────────────────────────────────────────
describe('isPrivateOrSpecialIp – IPv6 blocked', () => {
  it('blocks loopback ::1', () => {
    assert.equal(isPrivateOrSpecialIp('::1'), true);
  });

  it('blocks ULA fc00::1', () => {
    assert.equal(isPrivateOrSpecialIp('fc00::1'), true);
  });

  it('blocks ULA fd00::1', () => {
    assert.equal(isPrivateOrSpecialIp('fd00::1'), true);
  });

  it('blocks ULA fc00::/7 variant fc12::', () => {
    assert.equal(isPrivateOrSpecialIp('fc12::'), true);
  });

  it('blocks link-local fe80::1', () => {
    assert.equal(isPrivateOrSpecialIp('fe80::1'), true);
  });

  it('blocks link-local fe80::dead:beef', () => {
    assert.equal(isPrivateOrSpecialIp('fe80::dead:beef'), true);
  });
});

// ── IPv4-mapped IPv6: must be BLOCKED ─────────────────────────────────────────
describe('isPrivateOrSpecialIp – IPv4-mapped IPv6 blocked', () => {
  it('blocks ::ffff:127.0.0.1 (loopback)', () => {
    assert.equal(isPrivateOrSpecialIp('::ffff:127.0.0.1'), true);
  });

  it('blocks ::ffff:192.168.1.1 (private)', () => {
    assert.equal(isPrivateOrSpecialIp('::ffff:192.168.1.1'), true);
  });

  it('blocks ::ffff:10.0.0.1 (private)', () => {
    assert.equal(isPrivateOrSpecialIp('::ffff:10.0.0.1'), true);
  });

  it('blocks ::ffff:169.254.169.254 (metadata)', () => {
    assert.equal(isPrivateOrSpecialIp('::ffff:169.254.169.254'), true);
  });
});

// ── IPv6: must be ALLOWED ─────────────────────────────────────────────────────
describe('isPrivateOrSpecialIp – IPv6 public (allowed)', () => {
  it('allows 2606:2800:220:1:248:1893:25c8:1946 (example.com)', () => {
    assert.equal(isPrivateOrSpecialIp('2606:2800:220:1:248:1893:25c8:1946'), false);
  });

  it('allows 2001:4860:4860::8888 (Google DNS)', () => {
    assert.equal(isPrivateOrSpecialIp('2001:4860:4860::8888'), false);
  });
});

// ── Invalid / garbage input ───────────────────────────────────────────────────
describe('isPrivateOrSpecialIp – invalid input blocked by default', () => {
  it('blocks non-IP string "not-an-ip"', () => {
    assert.equal(isPrivateOrSpecialIp('not-an-ip'), true);
  });

  it('blocks empty string', () => {
    assert.equal(isPrivateOrSpecialIp(''), true);
  });
});
