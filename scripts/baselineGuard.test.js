import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBaseline } from './baselineGuard.js';

test('baseline guard - count drop below baseline produces failure', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 95, status: 'passed' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: false });
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /dropped below baseline/);
});

test('baseline guard - equal test count passes cleanly', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 100, status: 'passed' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: false });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
});

test('baseline guard - higher test count passes cleanly', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 125, status: 'passed' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: false });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
});

test('baseline guard - suite missing from the run fails', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 },
    'e2e-tests': { name: 'E2E Tests', tests: 20 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 100, status: 'passed' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: false });
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /missing from current run/);
});

test('baseline guard - --update-baseline accepts lower count and creates updated baseline', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 85, files: 10, passed: 85, failed: 0, skipped: 0, status: 'passed' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: true });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.updatedBaseline, {
    'unit-tests': {
      name: 'Unit Tests',
      files: 10,
      tests: 85,
      passed: 85,
      failed: 0,
      skipped: 0
    }
  });
});

test('baseline guard - skipped optional suites are not flagged as regressions', () => {
  const fakeBaseline = {
    'unit-tests': { name: 'Unit Tests', tests: 100 },
    'e2e-tests': { name: 'E2E Tests', tests: 20 }
  };
  const fakeSummaries = [
    { suite: 'unit-tests', name: 'Unit Tests', tests: 105, status: 'passed' },
    { suite: 'e2e-tests', name: 'E2E Tests', tests: null, status: 'skipped' }
  ];

  const result = evaluateBaseline(fakeSummaries, fakeBaseline, { updateBaseline: false });
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
});

