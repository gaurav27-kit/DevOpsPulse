import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Secret patterns to detect.
 * Rules:
 *  1. Any tracked file named '.env' (excluding .env.example)
 *  2. MongoDB URI with credentials (mongodb with embedded user/pass)
 *  3. JWT_SECRET= assignment with value > 20 chars outside .env.example
 *  4. Private key blocks (-----BEGIN ... PRIVATE KEY-----)
 */

export const SECRET_RULES = [
  {
    id: 'MONGODB_CREDENTIALS',
    description: 'MongoDB URI containing embedded credentials',
    pattern: /mongodb(?:\+srv)?:\/\/[^\s/:@]+:[^\s/@]+@/i
  },
  {
    id: 'JWT_SECRET_LONG',
    description: 'JWT_SECRET assignment exceeding 20 characters',
    pattern: /JWT_SECRET\s*=\s*['"]?([^\s'"\r\n]{21,})/i
  },
  {
    id: 'PRIVATE_KEY_BLOCK',
    description: 'Cryptographic private key block',
    pattern: /-----BEGIN\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY-----/i
  }
];

/**
 * Check a single file's content against secret patterns.
 * Returns an array of findings { ruleId, description, line }.
 * Note: Never includes the secret string itself in the result.
 */
export function scanContent(content, filename) {
  const findings = [];
  const isEnvExample = filename.endsWith('.env.example');

  // Check filename constraint: no tracked .env files
  const baseName = path.basename(filename);
  if (baseName === '.env' || (baseName.startsWith('.env.') && !baseName.endsWith('.env.example') && baseName !== '.env.example')) {
    findings.push({
      ruleId: 'TRACKED_ENV_FILE',
      description: 'Tracked environment file (.env) detected',
      line: 1
    });
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNum = index + 1;

    for (const rule of SECRET_RULES) {
      // Allow JWT_SECRET placeholder assignment in .env.example files
      if (rule.id === 'JWT_SECRET_LONG' && isEnvExample) {
        continue;
      }

      if (rule.pattern.test(line)) {
        findings.push({
          ruleId: rule.id,
          description: rule.description,
          line: lineNum
        });
      }
    }
  });

  return findings;
}

/**
 * Retrieves all git-tracked files as well as untracked-but-not-ignored files.
 * This guarantees that new, uncommitted code files are never skipped by the secret scanner.
 */
export function getFilesToScan(repoRoot = process.cwd()) {
  let trackedFilesStr = '';
  let untrackedFilesStr = '';
  try {
    trackedFilesStr = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' });
    untrackedFilesStr = execSync('git ls-files --others --exclude-standard', { cwd: repoRoot, encoding: 'utf8' });
  } catch (err) {
    console.error('[check-secrets] Failed to list git files:', err.message);
    process.exit(1);
  }

  const fileSet = new Set([
    ...trackedFilesStr.split(/\r?\n/).filter(Boolean),
    ...untrackedFilesStr.split(/\r?\n/).filter(Boolean)
  ]);

  return Array.from(fileSet);
}

/**
 * Main scanner function for git tracked and untracked (unignored) files.
 */
export function checkTrackedSecrets(repoRoot = process.cwd()) {
  const files = getFilesToScan(repoRoot);
  let hasViolations = false;
  let totalViolations = 0;

  for (const relativePath of files) {
    const normalizedRelPath = relativePath.replace(/\\/g, '/');
    // Skip scanner's own unit test file containing intentional test vectors
    if (normalizedRelPath === 'scripts/checkSecrets.test.js') continue;

    const fullPath = path.resolve(repoRoot, relativePath);
    if (!fs.existsSync(fullPath)) continue;

    // Skip binary files or git internal submodules
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const findings = scanContent(content, relativePath);
    if (findings.length > 0) {
      hasViolations = true;
      for (const finding of findings) {
        totalViolations++;
        // Output format: strictly never print the secret itself, only file, line, and rule description
        console.error(
          `[SECRET VIOLATION] ${relativePath}:${finding.line} -> ${finding.description} (${finding.ruleId})`
        );
      }
    }
  }

  if (hasViolations) {
    console.error(`\n[FATAL] check:secrets failed: ${totalViolations} potential secret(s) found in tracked/untracked files.`);
    return false;
  }

  console.log(`[check:secrets] Clean: Scanned ${files.length} tracked and unignored files. No secrets or credentials found.`);
  return true;
}

// Direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const isClean = checkTrackedSecrets();
  process.exit(isClean ? 0 : 1);
}

function fileURLToPath(url) {
  return new URL(url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

