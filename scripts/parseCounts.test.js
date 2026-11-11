import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCounts } from './parseCounts.js';

test('Vitest - passing backend API tests sample', () => {
  const sample = `
 ✓ tests/api/cross-user.test.js (51 tests) 23507ms
 ✓ tests/api/slos.test.js (25 tests) 11956ms
 Test Files  11 passed (11)
      Tests  149 passed (149)
   Start at  22:59:17
   Duration  108.10s
`;
  const result = parseCounts(sample, 'backend-api-tests');
  assert.deepEqual(result, {
    files: 11,
    tests: 149,
    passed: 149,
    failed: 0,
    skipped: 0
  });
});

test('Vitest - passing frontend unit tests sample', () => {
  const sample = `
 ✓ src/components/SeverityBadge.test.jsx (5 tests) 232ms
 ✓ src/components/StatusBadge.test.jsx (4 tests) 221ms
 Test Files  21 passed (21)
      Tests  82 passed (82)
   Start at  23:02:11
   Duration  59.84s
`;
  const result = parseCounts(sample, 'frontend-unit-tests');
  assert.deepEqual(result, {
    files: 21,
    tests: 82,
    passed: 82,
    failed: 0,
    skipped: 0
  });
});

test('Vitest - failing sample with skipped tests', () => {
  const sample = `
 × src/pages/NotificationsPage.test.jsx (4 tests | 1 failed)
 Test Files  1 failed | 1 skipped | 19 passed (21)
      Tests  2 failed | 5 skipped | 75 passed (82)
   Duration  45.10s
`;
  const result = parseCounts(sample, 'frontend-unit-tests');
  assert.deepEqual(result, {
    files: 21,
    tests: 82,
    passed: 75,
    failed: 2,
    skipped: 5
  });
});

test('Node:test - passing backend unit tests sample', () => {
  const sample = `
✔ isPrivateOrSpecialIp – invalid input blocked by default (1.4949ms)
ℹ tests 123
ℹ suites 19
ℹ pass 123
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14597.4132
`;
  const result = parseCounts(sample, 'backend-unit-tests');
  assert.deepEqual(result, {
    files: 19,
    tests: 123,
    passed: 123,
    failed: 0,
    skipped: 0
  });
});

test('Node:test - failing sample with skipped tests', () => {
  const sample = `
✖ some test failed (12.3ms)
ℹ tests 50
ℹ suites 5
ℹ pass 45
ℹ fail 3
ℹ cancelled 0
ℹ skipped 2
ℹ todo 0
`;
  const result = parseCounts(sample, 'backend-unit-tests');
  assert.deepEqual(result, {
    files: 5,
    tests: 50,
    passed: 45,
    failed: 3,
    skipped: 2
  });
});

test('Node:test - secret matcher tests sample', () => {
  const sample = `
✔ clean file produces zero findings (0.3738ms)
✔ checkSecrets matcher unit tests (655.5845ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
`;
  const result = parseCounts(sample, 'secret-matcher-tests');
  assert.deepEqual(result, {
    files: 0,
    tests: 11,
    passed: 11,
    failed: 0,
    skipped: 0
  });
});

test('Playwright - passing E2E sample', () => {
  const sample = `
Running 31 tests using 1 worker
·······························
  31 passed (25.4s)
`;
  const result = parseCounts(sample, 'playwright-e2e');
  assert.deepEqual(result, {
    files: null,
    tests: 31,
    passed: 31,
    failed: 0,
    skipped: 0
  });
});

test('Playwright - failing and skipped sample', () => {
  const sample = `
Running 35 tests using 1 worker
  1 failed
  2 skipped
  32 passed (31.2s)
`;
  const result = parseCounts(sample, 'playwright-e2e');
  assert.deepEqual(result, {
    files: null,
    tests: 35,
    passed: 32,
    failed: 1,
    skipped: 2
  });
});

test('Custom check scripts - incident flow check', () => {
  const sample = `── Results: 17 passed, 0 failed ──`;
  const result = parseCounts(sample, 'incident-flow-check');
  assert.deepEqual(result, {
    files: 1,
    tests: 17,
    passed: 17,
    failed: 0,
    skipped: 0
  });
});

test('Custom check scripts - analytics check', () => {
  const sample = `
  ⏱ Dashboard summary with 130+ health checks took: 15ms
  ✔ PASS: G: All bulk checks counted in health summary
── Results: 37 passed, 0 failed ──
`;
  const result = parseCounts(sample, 'analytics-check');
  assert.deepEqual(result, {
    files: 1,
    tests: 37,
    passed: 37,
    failed: 0,
    skipped: 0
  });
});

test('Custom check scripts - Socket.IO security check', () => {
  const sample = `--- Socket.IO Test Results: 13 passed, 0 failed ---`;
  const result = parseCounts(sample, 'socket-security-check');
  assert.deepEqual(result, {
    files: 1,
    tests: 13,
    passed: 13,
    failed: 0,
    skipped: 0
  });
});

test('Custom check scripts - alerting proofs', () => {
  const sample = `Proofs Summary: 30 passed, 0 failed (Total: 30)`;
  const result = parseCounts(sample, 'automated-alerting-proofs');
  assert.deepEqual(result, {
    files: 1,
    tests: 30,
    passed: 30,
    failed: 0,
    skipped: 0
  });
});

test('Custom check scripts - SLO check summary', () => {
  const sample = `SLO Check Summary: 41 Passed, 0 Failed`;
  const result = parseCounts(sample, 'slo-check');
  assert.deepEqual(result, {
    files: 1,
    tests: 41,
    passed: 41,
    failed: 0,
    skipped: 0
  });
});

test('Secret check - clean scan', () => {
  const sample = `[check:secrets] Clean: Scanned 243 tracked and unignored files. No secrets or credentials found.`;
  const result = parseCounts(sample, 'secret-check');
  assert.deepEqual(result, {
    files: 1,
    tests: 1,
    passed: 1,
    failed: 0,
    skipped: 0
  });
});

test('Vitest - sample with terminal ANSI color escape codes', () => {
  const sample = `
 \u001b[2m Test Files \u001b[22m \u001b[1m\u001b[32m22 passed\u001b[39m\u001b[22m\u001b[90m (22)\u001b[39m
 \u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m86 passed\u001b[39m\u001b[22m\u001b[90m (86)\u001b[39m
 \u001b[2m   Start at \u001b[22m 10:20:00
 \u001b[2m   Duration \u001b[22m 65.40s
`;
  const result = parseCounts(sample, 'frontend-unit-tests');
  assert.deepEqual(result, {
    files: 22,
    tests: 86,
    passed: 86,
    failed: 0,
    skipped: 0
  });
});

test('Frontend build - success', () => {
  const sample = `vite v5.4.19 building for production...\n✓ 134 modules transformed.\ndist/index.html 0.48 kB\n✓ built in 1.45s`;
  const result = parseCounts(sample, 'frontend-build');
  assert.deepEqual(result, {
    files: 1,
    tests: 1,
    passed: 1,
    failed: 0,
    skipped: 0
  });
});

