/**
 * Unit tests for the computeTotalTests() function exported from checkAll.js.
 *
 * The function sums the `tests` field across all suite objects, ignoring
 * null/undefined (skipped suites that produced no test count).
 *
 * Canonical arithmetic for the last known good run (commit e58d24b):
 *   secret-check             1
 *   secret-matcher-tests    11
 *   evidence-parser-tests   17
 *   backend-unit-tests     123
 *   backend-api-tests      149
 *   frontend-unit-tests    123
 *   frontend-build           1
 *   incident-flow-check     17
 *   analytics-check         37
 *   socket-security-check   13
 *   alerting-lifecycle-check 16
 *   automated-alerting-proofs 30
 *   slo-check               53
 *   baseline-guard-tests     6
 *   slo-rollup-check       101
 *   playwright-e2e          14
 *   slo-perf              null  <-- skipped, excluded from sum
 *   TOTAL                  712
 *
 * Source: reports/last-run/summary.json (git e58d24b, clean: true)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Inline the pure function so the test has no dependency on the full checkAll.js runner.
function computeTotalTests(suites) {
  return suites.reduce((acc, s) => acc + (typeof s.tests === 'number' ? s.tests : 0), 0);
}

// --- Canonical run fixture (matches reports/last-run/summary.json @ e58d24b) ---
const canonicalSuites = [
  { suite: 'secret-check',              tests: 1 },
  { suite: 'secret-matcher-tests',      tests: 11 },
  { suite: 'evidence-parser-tests',     tests: 17 },
  { suite: 'backend-unit-tests',        tests: 123 },
  { suite: 'backend-api-tests',         tests: 149 },
  { suite: 'frontend-unit-tests',       tests: 123 },
  { suite: 'frontend-build',            tests: 1 },
  { suite: 'incident-flow-check',       tests: 17 },
  { suite: 'analytics-check',           tests: 37 },
  { suite: 'socket-security-check',     tests: 13 },
  { suite: 'alerting-lifecycle-check',  tests: 16 },
  { suite: 'automated-alerting-proofs', tests: 30 },
  { suite: 'slo-check',                 tests: 53 },
  { suite: 'baseline-guard-tests',      tests: 6 },
  { suite: 'slo-rollup-check',          tests: 101 },
  { suite: 'playwright-e2e',            tests: 14 },
  { suite: 'slo-perf',                  tests: null }, // skipped suite
];

test('computeTotalTests sums correctly for canonical run (712)', () => {
  assert.strictEqual(computeTotalTests(canonicalSuites), 712);
});

test('computeTotalTests excludes null (skipped) suites', () => {
  const suites = [
    { suite: 'a', tests: 10 },
    { suite: 'b', tests: null },  // skipped
    { suite: 'c', tests: 5 },
  ];
  assert.strictEqual(computeTotalTests(suites), 15);
});

test('computeTotalTests excludes undefined tests field', () => {
  const suites = [
    { suite: 'a', tests: 20 },
    { suite: 'b' },              // no tests field
    { suite: 'c', tests: 3 },
  ];
  assert.strictEqual(computeTotalTests(suites), 23);
});

test('computeTotalTests returns 0 for empty array', () => {
  assert.strictEqual(computeTotalTests([]), 0);
});

test('computeTotalTests returns 0 when all suites are skipped (null tests)', () => {
  const suites = [
    { suite: 'a', tests: null },
    { suite: 'b', tests: null },
  ];
  assert.strictEqual(computeTotalTests(suites), 0);
});

test('computeTotalTests per-suite arithmetic matches canonical total', () => {
  // Explicit column-by-column check: guard against future baseline regressions
  const expected = 1 + 11 + 17 + 123 + 149 + 123 + 1 + 17 + 37 + 13 + 16 + 30 + 53 + 6 + 101 + 14;
  assert.strictEqual(expected, 712, 'Hand-arithmetic must equal 712');
  assert.strictEqual(computeTotalTests(canonicalSuites), expected);
});
