/**
 * scripts/baselineGuard.js
 *
 * Regression guard logic comparing current test execution counts against
 * the committed baseline in reports/baseline.json.
 */

/**
 * Evaluates whether test counts meet or exceed the committed baseline.
 *
 * @param {Array<object>} suiteSummaries - Summary objects of executed suites
 * @param {object} baselineData - Baseline data mapped by suite slug
 * @param {object} [options]
 * @param {boolean} [options.updateBaseline=false] - Whether to accept lower counts and build new baseline
 * @returns {{ passed: boolean, failures: string[], updatedBaseline: object | null }}
 */
export function evaluateBaseline(suiteSummaries, baselineData, { updateBaseline = false } = {}) {
  const failures = [];
  const summariesMap = new Map();

  for (const s of suiteSummaries || []) {
    if (s && s.suite) {
      summariesMap.set(s.suite, s);
    }
  }

  // When updating baseline, accept current counts for all non-skipped suites,
  // and preserve baseline counts for skipped optional suites
  if (updateBaseline) {
    const newBaseline = {};
    for (const [slug, base] of Object.entries(baselineData || {})) {
      const summary = summariesMap.get(slug);
      if (summary && summary.status === 'skipped') {
        newBaseline[slug] = base;
      }
    }

    for (const suite of suiteSummaries || []) {
      if (suite.status === 'skipped') continue;
      newBaseline[suite.suite] = {
        name: suite.name,
        files: suite.files,
        tests: suite.tests,
        passed: suite.passed,
        failed: suite.failed,
        skipped: suite.skipped
      };
    }
    return {
      passed: true,
      failures: [],
      updatedBaseline: newBaseline
    };
  }

  // 1. A suite missing from the run fails
  for (const [slug, base] of Object.entries(baselineData || {})) {
    if (!summariesMap.has(slug)) {
      failures.push(
        `Suite "${base.name || slug}" (${slug}) is present in baseline but missing from current run!`
      );
    }
  }

  // 2. Count comparisons for executed suites
  for (const suite of suiteSummaries || []) {
    if (suite.status === 'skipped') continue;
    const base = baselineData?.[suite.suite];
    if (base && typeof base.tests === 'number') {
      if (suite.tests !== null && suite.tests < base.tests) {
        failures.push(
          `Suite "${suite.name}" (${suite.suite}) test count dropped below baseline! Current tests: ${suite.tests}, baseline: ${base.tests}.`
        );
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    updatedBaseline: null
  };
}

