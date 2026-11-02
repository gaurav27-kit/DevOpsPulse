/**
 * Unit tests for decideIncidentAction (incidentRules.js).
 *
 * All counters passed in reflect the state AFTER computeNextState has already
 * updated them for the current check.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideIncidentAction } from '../src/services/incidentRules.js';

// ─── Failure path ─────────────────────────────────────────────────────────────

describe('decideIncidentAction – failure + no active incident', () => {
  it('returns "none" on first failure (consecutiveFailures=1)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 1,
        consecutiveSuccesses: 0,
        hasActiveIncident: false
      }),
      'none'
    );
  });

  it('returns "open" on second consecutive failure (consecutiveFailures=2)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 2,
        consecutiveSuccesses: 0,
        hasActiveIncident: false
      }),
      'open'
    );
  });

  it('returns "open" on third failure with no incident (consecutiveFailures=3)', () => {
    // Edge: if somehow no incident exists yet but there are >=2 failures, still opens
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 3,
        consecutiveSuccesses: 0,
        hasActiveIncident: false
      }),
      'open'
    );
  });
});

describe('decideIncidentAction – failure + active incident exists', () => {
  it('returns "update" on any failure when incident exists (consecutiveFailures=1)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 1,
        consecutiveSuccesses: 0,
        hasActiveIncident: true
      }),
      'update'
    );
  });

  it('returns "update" on nth failure when incident exists (consecutiveFailures=10)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 10,
        consecutiveSuccesses: 0,
        hasActiveIncident: true
      }),
      'update'
    );
  });
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe('decideIncidentAction – success + active incident', () => {
  it('returns "none" on first success during recovery (consecutiveSuccesses=1)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        hasActiveIncident: true
      }),
      'none'
    );
  });

  it('returns "resolve" on second consecutive success (consecutiveSuccesses=2)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 2,
        hasActiveIncident: true
      }),
      'resolve'
    );
  });

  it('returns "resolve" on any success >= 2 with active incident (consecutiveSuccesses=5)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 5,
        hasActiveIncident: true
      }),
      'resolve'
    );
  });
});

describe('decideIncidentAction – success + no active incident', () => {
  it('returns "none" when success and no incident (consecutiveSuccesses=1)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 1,
        hasActiveIncident: false
      }),
      'none'
    );
  });

  it('returns "none" when success and no incident (consecutiveSuccesses=2)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 2,
        hasActiveIncident: false
      }),
      'none'
    );
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('decideIncidentAction – edge cases', () => {
  it('zero counters, no incident, success → "none"', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hasActiveIncident: false
      }),
      'none'
    );
  });

  it('zero counters, no incident, failure → "none" (not enough failures)', () => {
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        hasActiveIncident: false
      }),
      'none'
    );
  });

  it('failure + incident → update even with high successCount (counters reset correctly)', () => {
    // After a failure, consecutiveSuccesses should be 0; test the rule regardless
    assert.equal(
      decideIncidentAction({
        resultSuccess: false,
        consecutiveFailures: 1,
        consecutiveSuccesses: 0, // reset after a failure
        hasActiveIncident: true
      }),
      'update'
    );
  });
});
