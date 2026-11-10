import test from 'node:test';
import assert from 'node:assert/strict';
import { scanContent, SECRET_RULES, getFilesToScan } from './checkSecrets.js';

test('checkSecrets matcher unit tests', async (t) => {
  await t.test('detects tracked .env file by name', () => {
    const findings = scanContent('FOO=bar\n', '.env');
    assert.equal(findings.some((f) => f.ruleId === 'TRACKED_ENV_FILE'), true);
  });

  await t.test('allows .env.example file without reporting TRACKED_ENV_FILE', () => {
    const findings = scanContent('FOO=bar\n', '.env.example');
    assert.equal(findings.some((f) => f.ruleId === 'TRACKED_ENV_FILE'), false);
  });

  await t.test('detects standard mongodb:// credentials', () => {
    const fakeContent = 'const uri = "mongodb://admin_user:SuperSecretPassword123@cluster0.abc.mongodb.net/prod";';
    const findings = scanContent(fakeContent, 'src/config.js');
    const match = findings.find((f) => f.ruleId === 'MONGODB_CREDENTIALS');
    assert.ok(match, 'Should match mongodb credentials');
    assert.equal(match.line, 1);
  });

  await t.test('detects mongodb+srv:// credentials', () => {
    const fakeContent = 'export MONGO_URI="mongodb+srv://dbuser:mypassword@db.example.com/mydb"';
    const findings = scanContent(fakeContent, 'deploy.sh');
    const match = findings.find((f) => f.ruleId === 'MONGODB_CREDENTIALS');
    assert.ok(match, 'Should match mongodb+srv credentials');
  });

  await t.test('does not flag clean localhost mongodb without credentials', () => {
    const fakeContent = 'const uri = "mongodb://127.0.0.1:27017/devopspulse_test";';
    const findings = scanContent(fakeContent, 'backend/src/config.js');
    assert.equal(findings.some((f) => f.ruleId === 'MONGODB_CREDENTIALS'), false);
  });

  await t.test('detects JWT_SECRET > 20 chars in regular code files', () => {
    const fakeContent = 'JWT_SECRET=super_secret_jwt_key_that_is_way_longer_than_20_chars\nPORT=5000';
    const findings = scanContent(fakeContent, 'backend/src/secret.js');
    const match = findings.find((f) => f.ruleId === 'JWT_SECRET_LONG');
    assert.ok(match, 'Should flag long JWT_SECRET');
    assert.equal(match.line, 1);
  });

  await t.test('ignores JWT_SECRET in .env.example files', () => {
    const fakeContent = 'JWT_SECRET=replace_with_a_secure_random_secret_at_least_32_chars\nPORT=5000';
    const findings = scanContent(fakeContent, 'backend/.env.example');
    assert.equal(findings.some((f) => f.ruleId === 'JWT_SECRET_LONG'), false);
  });

  await t.test('detects private key blocks', () => {
    const fakeContent = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Y3...',
      '-----END RSA PRIVATE KEY-----'
    ].join('\n');
    const findings = scanContent(fakeContent, 'certs/server.key');
    const match = findings.find((f) => f.ruleId === 'PRIVATE_KEY_BLOCK');
    assert.ok(match, 'Should detect private key block');
    assert.equal(match.line, 1);
  });

  await t.test('clean file produces zero findings', () => {
    const fakeContent = 'const port = process.env.PORT || 5000;\nconsole.log("Hello DevOpsPulse");';
    const findings = scanContent(fakeContent, 'src/index.js');
    assert.equal(findings.length, 0);
  });

  await t.test('getFilesToScan includes tracked and untracked unignored files and excludes ignored files', () => {
    const files = getFilesToScan();
    assert.ok(Array.isArray(files) && files.length > 0, 'files list must not be empty');
    assert.ok(files.includes('package.json'), 'must include tracked package.json');
    assert.ok(!files.some((f) => f.includes('node_modules')), 'must exclude .gitignore matching files like node_modules');
  });
});

