import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextState } from '../src/services/statusService.js';

const SLOW_MS = 2000;

describe('computeNextState', () => {
  // Helper to create a base app state
  const app = (status, consecutiveFailures = 0, consecutiveSuccesses = 0) => ({
    status,
    consecutiveFailures,
    consecutiveSuccesses
  });

  const success = (responseTimeMs = 200) => ({ success: true, responseTimeMs });
  const slowSuccess = () => ({ success: true, responseTimeMs: 3000 });
  const failure = () => ({ success: false, responseTimeMs: 100 });

  // --- Success cases ---

  test('unknown + first success => up immediately', () => {
    const result = computeNextState(app('unknown'), success(), SLOW_MS);
    assert.equal(result.status, 'up');
    assert.equal(result.consecutiveSuccesses, 1);
    assert.equal(result.consecutiveFailures, 0);
  });

  test('unknown + slow success => degraded immediately', () => {
    const result = computeNextState(app('unknown'), slowSuccess(), SLOW_MS);
    assert.equal(result.status, 'degraded');
    assert.equal(result.consecutiveSuccesses, 1);
  });

  test('up + success => stays up', () => {
    const result = computeNextState(app('up', 0, 3), success(), SLOW_MS);
    assert.equal(result.status, 'up');
    assert.equal(result.consecutiveSuccesses, 4);
  });

  test('degraded + normal success => up', () => {
    const result = computeNextState(app('degraded', 0, 1), success(), SLOW_MS);
    assert.equal(result.status, 'up');
  });

  // --- Failure cases ---

  test('unknown + first failure => status unchanged (still unknown)', () => {
    const result = computeNextState(app('unknown'), failure(), SLOW_MS);
    assert.equal(result.status, 'unknown'); // Not down yet
    assert.equal(result.consecutiveFailures, 1);
    assert.equal(result.consecutiveSuccesses, 0);
  });

  test('unknown + 2 consecutive failures => down', () => {
    const afterFirst = computeNextState(app('unknown'), failure(), SLOW_MS);
    const afterSecond = computeNextState(
      app(afterFirst.status, afterFirst.consecutiveFailures, afterFirst.consecutiveSuccesses),
      failure(),
      SLOW_MS
    );
    assert.equal(afterSecond.status, 'down');
    assert.equal(afterSecond.consecutiveFailures, 2);
  });

  test('up + first failure => status unchanged (still up)', () => {
    const result = computeNextState(app('up', 0, 5), failure(), SLOW_MS);
    assert.equal(result.status, 'up'); // Not down yet
    assert.equal(result.consecutiveFailures, 1);
  });

  test('up + 2 failures => down', () => {
    const afterFirst = computeNextState(app('up'), failure(), SLOW_MS);
    const afterSecond = computeNextState(
      app(afterFirst.status, afterFirst.consecutiveFailures, afterFirst.consecutiveSuccesses),
      failure(),
      SLOW_MS
    );
    assert.equal(afterSecond.status, 'down');
  });

  // --- Recovery from down cases ---

  test('down + 1st success => still down (recovery needs 2)', () => {
    const result = computeNextState(app('down', 3), success(), SLOW_MS);
    assert.equal(result.status, 'down');
    assert.equal(result.consecutiveSuccesses, 1);
    assert.equal(result.consecutiveFailures, 0);
  });

  test('down + 2 consecutive successes => up', () => {
    const afterFirst = computeNextState(app('down', 3), success(), SLOW_MS);
    const afterSecond = computeNextState(
      app(afterFirst.status, afterFirst.consecutiveFailures, afterFirst.consecutiveSuccesses),
      success(),
      SLOW_MS
    );
    assert.equal(afterSecond.status, 'up');
    assert.equal(afterSecond.consecutiveSuccesses, 2);
  });

  test('down + 2 consecutive slow successes => degraded', () => {
    const afterFirst = computeNextState(app('down', 2), slowSuccess(), SLOW_MS);
    const afterSecond = computeNextState(
      app(afterFirst.status, afterFirst.consecutiveFailures, afterFirst.consecutiveSuccesses),
      slowSuccess(),
      SLOW_MS
    );
    assert.equal(afterSecond.status, 'degraded');
  });

  test('failure resets consecutiveSuccesses to 0', () => {
    const result = computeNextState(app('up', 0, 10), failure(), SLOW_MS);
    assert.equal(result.consecutiveSuccesses, 0);
    assert.equal(result.consecutiveFailures, 1);
  });

  test('success resets consecutiveFailures to 0', () => {
    const result = computeNextState(app('up', 1, 0), success(), SLOW_MS);
    assert.equal(result.consecutiveFailures, 0);
    assert.equal(result.consecutiveSuccesses, 1);
  });
});
