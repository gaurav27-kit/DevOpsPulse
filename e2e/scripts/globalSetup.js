import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('[E2E Global Setup] Running database reset...');
  execSync('node ./scripts/resetTestDb.js', { stdio: 'inherit' });
}

