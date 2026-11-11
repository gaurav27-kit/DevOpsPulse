/**
 * scripts/sloPerf.js
 *
 * Root forwarder for backend/scripts/sloPerf.js.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.resolve(rootDir, 'backend');

const child = spawn(process.execPath, ['scripts/sloPerf.js', ...process.argv.slice(2)], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
