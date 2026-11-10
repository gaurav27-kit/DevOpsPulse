import { spawnSync } from 'child_process';
import path from 'path';

/**
 * Runner that executes the alerting verification script from backend context.
 */
const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'node.exe' : 'node';

const result = spawnSync(cmd, ['scripts/alertingCheck.js'], {
  cwd: path.resolve('backend'),
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env }
});

process.exit(result.status ?? 0);
