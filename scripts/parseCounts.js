/**
 * scripts/parseCounts.js
 *
 * Extracts structured execution counts from test runners, build steps, and check scripts:
 *   { files, tests, passed, failed, skipped }
 */

export function parseCounts(output, slug = '') {
  let files = null;
  let tests = null;
  let passed = null;
  let failed = null;
  let skipped = 0;

  if (!output || typeof output !== 'string') {
    return { files: null, tests: null, passed: null, failed: null, skipped: 0 };
  }

  // Strip ANSI escape codes (color/formatting sequences) from terminal output
  const clean = output.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

  // 1. Vitest (frontend-unit-tests, backend-api-tests, etc.)
  // Format:
  //  Test Files  11 passed (11)
  //       Tests  149 passed (149)
  // Or with failures/skips:
  //  Test Files  1 failed | 1 skipped | 9 passed (11)
  //       Tests  2 failed | 3 skipped | 144 passed (149)
  if (clean.includes('Test Files') || slug.includes('frontend-unit') || slug.includes('backend-api')) {
    const testFilesLine = clean.match(/Test Files\s+([^\r\n]+)/);
    const testsLine = clean.match(/(?:^|\n)\s*Tests\s+([^\r\n]+)/);

    if (testFilesLine) {
      const line = testFilesLine[1];
      const filesPassed = line.match(/(\d+)\s+passed/);
      const filesFailed = line.match(/(\d+)\s+failed/);
      const filesSkipped = line.match(/(\d+)\s+skipped/);
      const filesTotal = line.match(/\((\d+)\)/);

      const fPass = filesPassed ? parseInt(filesPassed[1], 10) : 0;
      const fFail = filesFailed ? parseInt(filesFailed[1], 10) : 0;
      const fSkip = filesSkipped ? parseInt(filesSkipped[1], 10) : 0;
      files = filesTotal ? parseInt(filesTotal[1], 10) : fPass + fFail + fSkip;
    }

    if (testsLine) {
      const line = testsLine[1];
      const tPassed = line.match(/(\d+)\s+passed/);
      const tFailed = line.match(/(\d+)\s+failed/);
      const tSkipped = line.match(/(\d+)\s+skipped/);
      const tTotal = line.match(/\((\d+)\)/);

      passed = tPassed ? parseInt(tPassed[1], 10) : 0;
      failed = tFailed ? parseInt(tFailed[1], 10) : 0;
      skipped = tSkipped ? parseInt(tSkipped[1], 10) : 0;
      tests = tTotal ? parseInt(tTotal[1], 10) : passed + failed + skipped;
      return { files, tests, passed, failed, skipped };
    }
  }

  // 2. Node test runner (backend-unit-tests, secret-matcher-tests, etc.)
  // Format:
  // ℹ tests 123
  // ℹ suites 19
  // ℹ pass 123
  // ℹ fail 0
  // ℹ skipped 0
  const nodeTestsMatch = clean.match(/(?:^|\n)\s*(?:[ℹ✔✘\s]+)?tests\s+(\d+)/i);
  const nodePassMatch = clean.match(/(?:^|\n)\s*(?:[ℹ✔✘\s]+)?pass\s+(\d+)/i);
  const nodeFailMatch = clean.match(/(?:^|\n)\s*(?:[ℹ✔✘\s]+)?fail\s+(\d+)/i);
  const nodeSkipMatch = clean.match(/(?:^|\n)\s*(?:[ℹ✔✘\s]+)?skipped\s+(\d+)/i);
  const nodeSuitesMatch = clean.match(/(?:^|\n)\s*(?:[ℹ✔✘\s]+)?suites\s+(\d+)/i);

  if (nodePassMatch || nodeFailMatch || nodeTestsMatch) {
    passed = nodePassMatch ? parseInt(nodePassMatch[1], 10) : 0;
    failed = nodeFailMatch ? parseInt(nodeFailMatch[1], 10) : 0;
    skipped = nodeSkipMatch ? parseInt(nodeSkipMatch[1], 10) : 0;
    tests = nodeTestsMatch ? parseInt(nodeTestsMatch[1], 10) : passed + failed + skipped;
    files = nodeSuitesMatch ? parseInt(nodeSuitesMatch[1], 10) : (files ?? null);
    return { files, tests, passed, failed, skipped };
  }

  // 3. Playwright E2E
  // Format:
  // "  31 passed (25.4s)"
  // "  2 failed, 1 skipped, 28 passed"
  // "  1 failed, 30 passed"
  if (slug === 'playwright-e2e' || clean.includes('passed (') || clean.includes('passed (')) {
    const pwPass = clean.match(/(\d+)\s+passed/i);
    const pwFail = clean.match(/(\d+)\s+failed/i);
    const pwSkip = clean.match(/(\d+)\s+(?:skipped|flaky|did not run)/i);

    if (pwPass || pwFail) {
      passed = pwPass ? parseInt(pwPass[1], 10) : 0;
      failed = pwFail ? parseInt(pwFail[1], 10) : 0;
      skipped = pwSkip ? parseInt(pwSkip[1], 10) : 0;
      tests = passed + failed + skipped;
      files = null;
      return { files, tests, passed, failed, skipped };
    }
  }

  // 4. Custom check scripts
  // "── Results: 17 passed, 0 failed ──"
  // "Proofs Summary: 30 passed, 0 failed (Total: 30)"
  // "--- Socket.IO Test Results: 13 passed, 0 failed ---"
  // "SLO Check Summary: 41 Passed, 0 Failed"
  const scriptMatch =
    clean.match(/(?:Results|Summary|Test Results)[:\s]+(\d+)\s+passed,\s*(\d+)\s+failed/i) ||
    clean.match(/Summary[:\s]+(\d+)\s+Passed,\s*(\d+)\s+Failed/i) ||
    clean.match(/(\d+)\s+passed,\s*(\d+)\s+failed/i);
  if (scriptMatch) {
    passed = parseInt(scriptMatch[1], 10);
    failed = parseInt(scriptMatch[2], 10);
    skipped = 0;
    tests = passed + failed;
    files = 1;
    return { files, tests, passed, failed, skipped };
  }

  // 5. Secret scanner
  if (slug === 'secret-check' || clean.includes('Clean: Scanned')) {
    if (clean.includes('No secrets or credentials found')) {
      return { files: 1, tests: 1, passed: 1, failed: 0, skipped: 0 };
    }
  }

  // 6. Frontend build
  if (slug === 'frontend-build' || clean.includes('built in')) {
    if (clean.includes('built in')) {
      return { files: 1, tests: 1, passed: 1, failed: 0, skipped: 0 };
    }
  }

  return { files, tests, passed, failed, skipped };
}

