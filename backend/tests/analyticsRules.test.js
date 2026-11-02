/**
 * Unit tests for analyticsRules.js
 *
 * Covers:
 * - resolveRange: 24h, 7d, 30d, and invalid input rejection
 * - computeUptimePercent: 0 total -> null, 7/10 -> 70, 1/3 -> 33.33, 3/3 -> 100, 0/5 -> 0
 * - fillBuckets: gap filling, null values for empty buckets, boundary alignment
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRange,
  computeUptimePercent,
  fillBuckets,
  truncateToBucket
} from '../src/services/analyticsRules.js';

describe('resolveRange', () => {
  const fixedNow = new Date('2026-11-02T12:00:00.000Z');

  it('resolves 24h range with hour bucketUnit', () => {
    const res = resolveRange('24h', fixedNow);
    assert.equal(res.bucketUnit, 'hour');
    assert.equal(res.to.toISOString(), fixedNow.toISOString());
    assert.equal(res.from.toISOString(), '2026-11-01T12:00:00.000Z');
    assert.equal(res.label, 'Last 24 hours');
  });

  it('resolves 7d range with day bucketUnit', () => {
    const res = resolveRange('7d', fixedNow);
    assert.equal(res.bucketUnit, 'day');
    assert.equal(res.to.toISOString(), fixedNow.toISOString());
    assert.equal(res.from.toISOString(), '2026-10-26T12:00:00.000Z');
    assert.equal(res.label, 'Last 7 days');
  });

  it('resolves 30d range with day bucketUnit', () => {
    const res = resolveRange('30d', fixedNow);
    assert.equal(res.bucketUnit, 'day');
    assert.equal(res.to.toISOString(), fixedNow.toISOString());
    assert.equal(res.from.toISOString(), '2026-10-03T12:00:00.000Z');
    assert.equal(res.label, 'Last 30 days');
  });

  it('throws error for invalid range', () => {
    assert.throws(() => resolveRange('1y', fixedNow), /Invalid range "1y"/);
    assert.throws(() => resolveRange('1h', fixedNow), /Invalid range "1h"/);
  });
});

describe('computeUptimePercent', () => {
  it('returns null when totalChecks is 0 (no data)', () => {
    assert.equal(computeUptimePercent(0, 0), null);
  });

  it('computes 7 of 10 checks as 70%', () => {
    assert.equal(computeUptimePercent(7, 10), 70);
  });

  it('computes 1 of 3 checks rounded to 33.33%', () => {
    assert.equal(computeUptimePercent(1, 3), 33.33);
  });

  it('computes 3 of 3 checks as 100%', () => {
    assert.equal(computeUptimePercent(3, 3), 100);
  });

  it('computes 0 of 5 checks as 0% (recorded all failures)', () => {
    assert.equal(computeUptimePercent(0, 5), 0);
  });

  it('computes 2 of 3 checks rounded to 66.67%', () => {
    assert.equal(computeUptimePercent(2, 3), 66.67);
  });
});

describe('truncateToBucket', () => {
  it('truncates date to hour boundary in UTC', () => {
    const d = new Date('2026-11-02T14:35:45.123Z');
    const truncated = truncateToBucket(d, 'hour');
    assert.equal(truncated.toISOString(), '2026-11-02T14:00:00.000Z');
  });

  it('truncates date to day boundary in UTC', () => {
    const d = new Date('2026-11-02T14:35:45.123Z');
    const truncated = truncateToBucket(d, 'day');
    assert.equal(truncated.toISOString(), '2026-11-02T00:00:00.000Z');
  });
});

describe('fillBuckets', () => {
  it('fills missing buckets with null values for gaps', () => {
    const from = new Date('2026-11-02T10:00:00.000Z');
    const to = new Date('2026-11-02T13:00:00.000Z');

    // Only bucket 10:00 and 12:00 have data; 11:00 and 13:00 are empty
    const points = [
      {
        bucketStart: new Date('2026-11-02T10:00:00.000Z'),
        totalChecks: 4,
        successfulChecks: 4,
        uptimePercent: 100,
        avgResponseTimeMs: 120
      },
      {
        bucketStart: new Date('2026-11-02T12:00:00.000Z'),
        totalChecks: 2,
        successfulChecks: 1,
        uptimePercent: 50,
        avgResponseTimeMs: 250
      }
    ];

    const filled = fillBuckets(points, from, to, 'hour');

    // Expected buckets: 10:00, 11:00, 12:00, 13:00
    assert.equal(filled.length, 4);

    // Bucket 10:00: has data
    assert.equal(filled[0].totalChecks, 4);
    assert.equal(filled[0].uptimePercent, 100);

    // Bucket 11:00: gap -> filled with nulls
    assert.equal(filled[1].totalChecks, 0);
    assert.equal(filled[1].uptimePercent, null);
    assert.equal(filled[1].avgResponseTimeMs, null);

    // Bucket 12:00: has data
    assert.equal(filled[2].totalChecks, 2);
    assert.equal(filled[2].uptimePercent, 50);

    // Bucket 13:00: gap -> filled with nulls
    assert.equal(filled[3].totalChecks, 0);
    assert.equal(filled[3].uptimePercent, null);
  });

  it('handles completely empty series between from and to', () => {
    const from = new Date('2026-11-02T10:00:00.000Z');
    const to = new Date('2026-11-02T12:00:00.000Z');
    const filled = fillBuckets([], from, to, 'hour');

    assert.equal(filled.length, 3);
    for (const b of filled) {
      assert.equal(b.totalChecks, 0);
      assert.equal(b.uptimePercent, null);
      assert.equal(b.avgResponseTimeMs, null);
    }
  });

  it('aligns day boundaries correctly for day bucketUnit', () => {
    const from = new Date('2026-11-01T15:30:00.000Z');
    const to = new Date('2026-11-03T08:00:00.000Z');
    const filled = fillBuckets([], from, to, 'day');

    // Buckets: Nov 1 00:00, Nov 2 00:00, Nov 3 00:00
    assert.equal(filled.length, 3);
    assert.equal(filled[0].bucketStart.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(filled[1].bucketStart.toISOString(), '2026-11-02T00:00:00.000Z');
    assert.equal(filled[2].bucketStart.toISOString(), '2026-11-03T00:00:00.000Z');
  });
});
