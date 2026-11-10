import { spawnSync } from 'child_process';
import path from 'path';

/**
 * Runner that executes the complete test and verification suite:
 *   1. Secrets scanner (scripts/checkSecrets.js)
 *   2. Secrets scanner unit tests (scripts/checkSecrets.test.js)
 *   3. Backend unit tests (npm test in backend/)
 *   4. Backend API integration tests (npm run test:api in backend/)
 *   5. Frontend component & page tests (npm test in frontend/)
 *   6. Frontend production build (npm run build in frontend/)
 *   7. Incident Flow Check (npm run check:incidents in backend/)
 *   8. Analytics Check (npm run check:analytics in backend/)
 *   9. Socket.IO Security Check (npm run check:sockets in backend/)
 *  10. Alerting Lifecycle Check (node scripts/alertingCheck.js)
 *  11. Automated Alerting Proofs (node scripts/alertingProof.mjs)
 *  12. Playwright E2E Test (npm run test:e2e in e2e/)
 */

const steps = [
  { name: '1. Secret Check', command: 'node', args: ['scripts/checkSecrets.js'], cwd: '.' },
  { name: '2. Secret Matcher Tests', command: 'node', args: ['--test', 'scripts/checkSecrets.test.js'], cwd: '.' },
  { name: '3. Backend Unit Tests', command: 'npm', args: ['test'], cwd: 'backend' },
  { name: '4. Backend API Integration Tests', command: 'npm', args: ['run', 'test:api'], cwd: 'backend' },
  { name: '5. Frontend Unit Tests', command: 'npm', args: ['test', '--', '--run'], cwd: 'frontend' },
  { name: '6. Frontend Production Build', command: 'npm', args: ['run', 'build'], cwd: 'frontend' },
  { name: '7. Incident Flow Check', command: 'npm', args: ['run', 'check:incidents'], cwd: 'backend' },
  { name: '8. Analytics Check', command: 'npm', args: ['run', 'check:analytics'], cwd: 'backend' },
  { name: '9. Socket.IO Security Check', command: 'npm', args: ['run', 'check:sockets'], cwd: 'backend' },
  { name: '10. Alerting Lifecycle Check', command: 'node', args: ['scripts/alertingCheck.js'], cwd: '.' },
  { name: '11. Automated Alerting Proofs', command: 'node', args: ['scripts/alertingProof.mjs'], cwd: '.' },
  { name: '12. Playwright E2E Primary Workflow', command: 'npm', args: ['run', 'test:e2e'], cwd: 'e2e' }
];

console.log('====================================================');
console.log('       DevOpsPulse Master Quality Gate Runner       ');
console.log('====================================================\n');

let allPassed = true;
const isWindows = process.platform === 'win32';

for (const step of steps) {
  console.log(`>>> Running ${step.name}...`);
  const cmd = isWindows && step.command === 'npm' ? 'npm.cmd' : step.command;
  const result = spawnSync(cmd, step.args, {
    cwd: path.resolve(step.cwd),
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env }
  });

  if (result.error) {
    console.error(`\n[ERROR] Step "${step.name}" encountered error:`, result.error);
    allPassed = false;
    break;
  }

  if (result.status !== 0) {
    console.error(`\n[FAIL] Step "${step.name}" failed with exit code ${result.status}.\n`);
    allPassed = false;
    break;
  }
  console.log(`[PASS] ${step.name} completed successfully.\n`);
}

if (!allPassed) {
  console.error('\n❌ Quality gate failed. Please resolve the failing step above.');
  process.exit(1);
} else {
  console.log('\n====================================================');
  console.log('✅ ALL 12 QUALITY GATE SUITES PASSED CLEANLY!');
  console.log('====================================================');
  process.exit(0);
}
