import fs from 'fs';
import path from 'path';
import { spawnSync, execSync } from 'child_process';
import { parseCounts } from './parseCounts.js';
import { evaluateBaseline } from './baselineGuard.js';

/**
 * DevOpsPulse Master Quality Gate Runner
 *
 * Runs all quality gate suites, logs raw output to reports/last-run/<suite>.log,
 * and records structured run metrics into reports/last-run/summary.json.
 *
 * Usage:
 *   node scripts/checkAll.js                    (runs all suites including Playwright)
 *   node scripts/checkAll.js --no-playwright    (skips Playwright; for fast CI or environments without browser)
 *   node scripts/checkAll.js --update-baseline  (updates reports/baseline.json from current run)
 */

const isWindows = process.platform === 'win32';
const rootDir = process.cwd();
const reportsDir = path.resolve(rootDir, 'reports/last-run');
const baselineFile = path.resolve(rootDir, 'reports/baseline.json');

// Parse flags
const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const runPerf = args.includes('--perf') || process.env.RUN_PERF === 'true';
const skipPlaywright =
  args.includes('--no-playwright') ||
  args.includes('--skip-playwright') ||
  process.env.SKIP_PLAYWRIGHT === 'true' ||
  process.env.NO_PLAYWRIGHT === 'true';

// Ensure reports directory exists and is clean
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
} else {
  for (const file of fs.readdirSync(reportsDir)) {
    try {
      fs.unlinkSync(path.join(reportsDir, file));
    } catch {}
  }
}

// Get git metadata
let gitCommit = 'unknown';
let gitClean = false;
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  gitClean = statusOutput.length === 0;
} catch {
  // Not a git repository or git command missing
}

const steps = [
  {
    name: '1. Secret Check',
    slug: 'secret-check',
    command: 'node',
    args: ['scripts/checkSecrets.js'],
    cwd: '.'
  },
  {
    name: '2. Secret Matcher Tests',
    slug: 'secret-matcher-tests',
    command: 'node',
    args: ['--test', 'scripts/checkSecrets.test.js'],
    cwd: '.'
  },
  {
    name: '3. Evidence Parser Tests',
    slug: 'evidence-parser-tests',
    command: 'node',
    args: ['--test', 'scripts/parseCounts.test.js'],
    cwd: '.'
  },
  {
    name: '4. Backend Unit Tests',
    slug: 'backend-unit-tests',
    command: 'npm',
    args: ['test'],
    cwd: 'backend'
  },
  {
    name: '5. Backend API Integration Tests',
    slug: 'backend-api-tests',
    command: 'npm',
    args: ['run', 'test:api'],
    cwd: 'backend'
  },
  {
    name: '6. Frontend Unit Tests',
    slug: 'frontend-unit-tests',
    command: 'npm',
    args: ['test', '--', '--run'],
    cwd: 'frontend'
  },
  {
    name: '7. Frontend Production Build',
    slug: 'frontend-build',
    command: 'npm',
    args: ['run', 'build'],
    cwd: 'frontend'
  },
  {
    name: '8. Incident Flow Check',
    slug: 'incident-flow-check',
    command: 'npm',
    args: ['run', 'check:incidents'],
    cwd: 'backend'
  },
  {
    name: '9. Analytics Check',
    slug: 'analytics-check',
    command: 'npm',
    args: ['run', 'check:analytics'],
    cwd: 'backend'
  },
  {
    name: '10. Socket.IO Security Check',
    slug: 'socket-security-check',
    command: 'npm',
    args: ['run', 'check:sockets'],
    cwd: 'backend'
  },
  {
    name: '11. Alerting Lifecycle Check',
    slug: 'alerting-lifecycle-check',
    command: 'node',
    args: ['scripts/alertingCheck.js'],
    cwd: '.'
  },
  {
    name: '12. Automated Alerting Proofs',
    slug: 'automated-alerting-proofs',
    command: 'node',
    args: ['scripts/alertingProof.mjs'],
    cwd: '.'
  },
  {
    name: '13. SLO Lifecycle & Performance Check',
    slug: 'slo-check',
    command: 'npm',
    args: ['run', 'check:slo'],
    cwd: 'backend'
  },
  {
    name: '14. Baseline Guard Tests',
    slug: 'baseline-guard-tests',
    command: 'node',
    args: ['--test', 'scripts/baselineGuard.test.js'],
    cwd: '.'
  },
  {
    name: '15. SLO Rollup & Performance Proof',
    slug: 'slo-rollup-check',
    command: 'node',
    args: ['scripts/sloRollupCheck.js'],
    cwd: '.'
  },
  {
    name: '16. Automated SLO Alerting Proofs',
    slug: 'slo-alert-proof',
    command: 'node',
    args: ['scripts/sloAlertProof.mjs'],
    cwd: '.'
  },
  {
    name: '17. Playwright E2E Primary Workflow',
    slug: 'playwright-e2e',
    command: 'npm',
    args: ['run', 'test:e2e'],
    cwd: 'e2e',
    optional: skipPlaywright
  },
  {
    name: '18. SLO Volume Performance Benchmarks (864k checks)',
    slug: 'slo-perf',
    command: 'node',
    args: ['scripts/sloPerf.js'],
    cwd: '.',
    optional: !runPerf
  }
];

console.log('====================================================');
console.log('       DevOpsPulse Master Quality Gate Runner       ');
console.log('====================================================');
console.log(`Git Commit: ${gitCommit}`);
console.log(`Working Tree Clean: ${gitClean}`);
console.log(`Reports Directory: ${reportsDir}`);
if (skipPlaywright) {
  console.log('Mode: Headless (--no-playwright active, skipping Playwright E2E)');
}
if (updateBaseline) {
  console.log('Mode: Baseline update requested (--update-baseline active)');
}
console.log('====================================================\n');

const suiteSummaries = [];
let allPassed = true;
const overallStartTime = Date.now();

for (const step of steps) {
  if (step.optional) {
    console.log(`>>> Skipping ${step.name} (--no-playwright requested)...\n`);
    suiteSummaries.push({
      name: step.name,
      suite: step.slug,
      command: `${step.command} ${step.args.join(' ')}`,
      cwd: step.cwd,
      status: 'skipped',
      exitCode: 0,
      files: null,
      tests: null,
      passed: null,
      failed: null,
      skipped: null,
      startTime: new Date().toISOString(),
      durationMs: 0,
      logFile: null
    });
    continue;
  }

  console.log(`>>> Running ${step.name}...`);
  const stepStartTime = Date.now();
  const cmd = isWindows && step.command === 'npm' ? 'npm.cmd' : step.command;

  const result = spawnSync(cmd, step.args, {
    cwd: path.resolve(rootDir, step.cwd),
    stdio: 'pipe',
    shell: isWindows,
    env: { ...process.env },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });

  const durationMs = Date.now() - stepStartTime;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const fullOutput = stdout + (stderr ? (stdout ? '\n' : '') + stderr : '');

  // Forward output to terminal in real-time
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  // Write complete raw log
  const logFileName = `${step.slug}.log`;
  const logFilePath = path.join(reportsDir, logFileName);
  fs.writeFileSync(logFilePath, fullOutput, 'utf8');

  const counts = parseCounts(fullOutput, step.slug);
  const exitCode = result.status ?? (result.error ? 1 : 0);

  suiteSummaries.push({
    name: step.name,
    suite: step.slug,
    command: `${step.command} ${step.args.join(' ')}`,
    cwd: step.cwd,
    status: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    files: counts.files,
    tests: counts.tests,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    startTime: new Date(stepStartTime).toISOString(),
    durationMs,
    logFile: `reports/last-run/${logFileName}`
  });

  if (result.error) {
    console.error(`\n[ERROR] Step "${step.name}" encountered error:`, result.error);
    allPassed = false;
    break;
  }

  if (exitCode !== 0) {
    console.error(`\n[FAIL] Step "${step.name}" failed with exit code ${exitCode}.\n`);
    allPassed = false;
    break;
  }

  console.log(`[PASS] ${step.name} completed successfully (${(durationMs / 1000).toFixed(2)}s).\n`);
}

// Regression guard against baseline.json
let baselineData = {};
if (fs.existsSync(baselineFile)) {
  try {
    baselineData = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  } catch (err) {
    console.warn(`[WARN] Could not parse baseline file at ${baselineFile}:`, err.message);
  }
}

if (Object.keys(baselineData).length > 0 || updateBaseline) {
  console.log('\n--- Checking Test Count Regressions Against Baseline ---');
  const guardResult = evaluateBaseline(suiteSummaries, baselineData, { updateBaseline });
  if (!guardResult.passed) {
    for (const failMsg of guardResult.failures) {
      console.error(`❌ [REGRESSION FAILURE] ${failMsg}`);
    }
    allPassed = false;
  } else {
    for (const suite of suiteSummaries) {
      if (suite.status === 'skipped') continue;
      const base = baselineData[suite.suite];
      if (base && typeof base.tests === 'number') {
        console.log(`✔ [BASELINE PASS] ${suite.name}: ${suite.tests} tests (baseline: ${base.tests})`);
      }
    }
  }

  if (updateBaseline && allPassed && guardResult.updatedBaseline) {
    fs.writeFileSync(baselineFile, JSON.stringify(guardResult.updatedBaseline, null, 2), 'utf8');
    console.log(`\n✅ Baseline updated successfully at: ${baselineFile}`);
  }
}

const overallDurationMs = Date.now() - overallStartTime;
const summaryPath = path.join(reportsDir, 'summary.json');

/**
 * computeTotalTests(suites) — sums the `tests` field across all suites,
 * skipping null/undefined (i.e. skipped suites that produced no test count).
 * This is the canonical total for the run; it must match the per-suite arithmetic.
 * @param {Array} suites
 * @returns {number}
 */
function computeTotalTests(suites) {
  return suites.reduce((acc, s) => acc + (typeof s.tests === 'number' ? s.tests : 0), 0);
}

const totalTests = computeTotalTests(suiteSummaries);

const finalSummary = {
  timestamp: new Date().toISOString(),
  git: {
    commit: gitCommit,
    clean: gitClean
  },
  overall: {
    passed: allPassed,
    durationMs: overallDurationMs,
    totalSuites: steps.length,
    executedSuites: suiteSummaries.filter((s) => s.status !== 'skipped').length,
    passedSuites: suiteSummaries.filter((s) => s.status === 'passed').length,
    failedSuites: suiteSummaries.filter((s) => s.status === 'failed').length,
    skippedSuites: suiteSummaries.filter((s) => s.status === 'skipped').length,
    totalTests
  },
  suites: suiteSummaries
};

fs.writeFileSync(summaryPath, JSON.stringify(finalSummary, null, 2), 'utf8');

if (!allPassed) {
  console.error('\n❌ Quality gate failed. Summary written to:', summaryPath);
  process.exit(1);
} else {
  console.log('\n====================================================');
  console.log('✅ ALL QUALITY GATE SUITES PASSED CLEANLY!');
  console.log(`   Total tests across all suites: ${totalTests}`);
  console.log(`Summary written to: ${summaryPath}`);
  console.log('====================================================');
  process.exit(0);
}
