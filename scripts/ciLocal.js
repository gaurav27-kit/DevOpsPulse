/**
 * scripts/ciLocal.js
 *
 * Pre-push local CI gate (R5):
 * Executes a clean-room verification in a fresh clone of the local HEAD in a temporary folder.
 * Uses exact same environment variables, dependency installations (npm ci), and commands
 * as defined in .github/workflows/ci.yml.
 *
 * Writes logs to reports/ci-local/<step>.log.
 * Exits 0 ONLY when all CI steps pass cleanly.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync, execSync } from 'child_process';

const rootDir = process.cwd();
const ciReportsDir = path.resolve(rootDir, 'reports/ci-local');

if (!fs.existsSync(ciReportsDir)) {
  fs.mkdirSync(ciReportsDir, { recursive: true });
}

console.log('========================================================');
console.log('       DevOpsPulse Local CI Pre-Push Verification       ');
console.log('========================================================');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devopspulse-ci-local-'));
console.log(`Working Tree: ${rootDir}`);
console.log(`Clean Clone Target: ${tempDir}`);
console.log(`Logs Directory: ${ciReportsDir}\n`);

let overallSuccess = true;

try {
  // 1. Fresh clone of local HEAD
  console.log('>>> [1/5] Cloning current local HEAD into clean workspace...');
  execSync(`git clone . "${tempDir}"`, { stdio: 'inherit' });
  const gitCommit = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf8' }).trim();
  console.log(`Cloned HEAD commit: ${gitCommit}\n`);

  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  const nodeCmd = isWindows ? 'node.exe' : 'node';

  function runCiStep(name, logFile, cmd, args, cwd, env = {}) {
    console.log(`>>> Running: ${name}...`);
    const logFilePath = path.join(ciReportsDir, logFile);
    const start = Date.now();

    const mergedEnv = {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      ...env
    };

    const res = spawnSync(cmd, args, {
      cwd: path.resolve(tempDir, cwd),
      stdio: 'pipe',
      shell: isWindows,
      env: mergedEnv,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    const output = stdout + (stderr ? '\n' + stderr : '');

    fs.writeFileSync(logFilePath, output, 'utf8');

    if (res.status === 0) {
      console.log(`✔ [PASS] ${name} (${duration}s)\n`);
      return true;
    } else {
      console.error(`✘ [FAIL] ${name} (exit code ${res.status}, ${duration}s)`);
      if (stderr) console.error(stderr.slice(0, 1000));
      else if (stdout) console.error(stdout.slice(-1000));
      console.log(`Full log written to: ${logFilePath}\n`);
      return false;
    }
  }

  // --- JOB 1: Secrets Scan ---
  console.log('================ Job 1: Secrets & Credential Scan ================');
  if (!runCiStep('Secret Scanner', 'secrets-scan.log', nodeCmd, ['scripts/checkSecrets.js'], '.')) {
    overallSuccess = false;
  }
  if (!runCiStep('Secret Scanner Tests', 'secrets-tests.log', nodeCmd, ['--test', 'scripts/checkSecrets.test.js'], '.')) {
    overallSuccess = false;
  }

  // --- JOB 2: Backend API & Unit Tests ---
  console.log('================ Job 2: Backend API & Unit Tests ================');
  if (!runCiStep('Backend npm ci', 'backend-npm-ci.log', npmCmd, ['ci'], 'backend')) {
    overallSuccess = false;
  }
  if (
    !runCiStep(
      'Backend Unit Tests',
      'backend-unit-tests.log',
      npmCmd,
      ['test'],
      'backend',
      { JWT_SECRET: 'ci_test_jwt_secret_must_be_at_least_32_characters_long' }
    )
  ) {
    overallSuccess = false;
  }
  if (
    !runCiStep(
      'Backend API Integration Tests',
      'backend-api-tests.log',
      npmCmd,
      ['run', 'test:api'],
      'backend',
      {
        MONGO_URI_TEST: 'mongodb://127.0.0.1:27017/devopspulse_test',
        JWT_SECRET: 'ci_test_jwt_secret_must_be_at_least_32_characters_long',
        SCHEDULER_ENABLED: 'false',
        CLIENT_ORIGIN: 'http://localhost:5173'
      }
    )
  ) {
    overallSuccess = false;
  }

  // --- JOB 3: Frontend Component Tests & Build ---
  console.log('================ Job 3: Frontend Component Tests & Build ================');
  if (!runCiStep('Frontend npm ci', 'frontend-npm-ci.log', npmCmd, ['ci'], 'frontend')) {
    overallSuccess = false;
  }
  if (!runCiStep('Frontend Unit Tests', 'frontend-unit-tests.log', npmCmd, ['test'], 'frontend')) {
    overallSuccess = false;
  }
  if (!runCiStep('Frontend Production Build', 'frontend-build.log', npmCmd, ['run', 'build'], 'frontend')) {
    overallSuccess = false;
  }

  // --- JOB 4: Master Quality Gate Suite ---
  console.log('================ Job 4: Master Quality Gate Suite ================');
  if (!runCiStep('Root npm ci', 'root-npm-ci.log', npmCmd, ['ci'], '.')) {
    overallSuccess = false;
  }
  if (
    !runCiStep(
      'Quality Gate (--no-playwright)',
      'quality-gate.log',
      nodeCmd,
      ['scripts/checkAll.js', '--no-playwright'],
      '.',
      {
        MONGO_URI: 'mongodb://127.0.0.1:27017/devopspulse',
        MONGO_URI_TEST: 'mongodb://127.0.0.1:27017/devopspulse_test',
        JWT_SECRET: 'ci_test_jwt_secret_must_be_at_least_32_characters_long',
        SCHEDULER_ENABLED: 'false',
        CLIENT_ORIGIN: 'http://localhost:5173'
      }
    )
  ) {
    overallSuccess = false;
  }

} finally {
  console.log('>>> Cleaning up temporary clone directory...');
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Cleanup complete.');
  } catch (err) {
    console.warn('Notice: temp directory cleanup warning:', err.message);
  }
}

console.log('\n========================================================');
if (overallSuccess) {
  console.log('✅ PRE-PUSH LOCAL CI GATE PASSED: Clean clone is 100% green!');
  console.log(`Logs available at: ${ciReportsDir}`);
  console.log('========================================================\n');
  process.exit(0);
} else {
  console.error('❌ PRE-PUSH LOCAL CI GATE FAILED: Review logs in reports/ci-local/');
  console.log('========================================================\n');
  process.exit(1);
}
