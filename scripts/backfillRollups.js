import { spawnSync } from 'child_process';
import path from 'path';

const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'node.exe' : 'node';

const result = spawnSync(cmd, ['scripts/backfillRollups.js', ...process.argv.slice(2)], {
  cwd: path.resolve('backend'),
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env }
});

process.exit(result.status ?? 0);
