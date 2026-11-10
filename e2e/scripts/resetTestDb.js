import mongoose from '../../backend/node_modules/mongoose/index.js';

const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/devopspulse_test';

function extractDbName(str) {
  const withoutProtocol = str.replace(/^mongodb(\+srv)?:\/\//, '');
  const pathPart = withoutProtocol.split('?')[0];
  const segments = pathPart.split('/');
  return segments.length > 1 ? segments.pop() : '';
}

const dbName = extractDbName(uri);
if (!dbName.endsWith('_test')) {
  console.error(`[FATAL] Refusing to reset non-test database: "${dbName}"`);
  process.exit(1);
}

async function resetDb() {
  await mongoose.connect(uri);
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
  await mongoose.disconnect();
  console.log('[E2E Setup] Cleaned test database:', dbName);
}

resetDb().catch((err) => {
  console.error('[E2E Setup] Failed to clean test DB:', err);
  process.exit(1);
});

