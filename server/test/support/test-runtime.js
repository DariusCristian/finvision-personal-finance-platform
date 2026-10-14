import http from 'node:http';

import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { frankfurterStubResponse } from './fx-stub.js';

// Captured at import, before any test file replaces fetch with its own stub.
const nativeFetch = globalThis.fetch;

let runtimePromise = null;
let activeConsumers = 0;

const ensureTestEnv = () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = process.env.PORT ?? '5005';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:5173';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-for-the-test-runtime-only';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-for-the-test-runtime-only';
  // Rate limits are off unless a test file enables them before starting the runtime (see rate-limit tests).
  process.env.RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED ?? 'false';
};

const createRuntime = async () => {
  ensureTestEnv();

  // Transactions convert amounts with FX rates: answer Frankfurter with deterministic rates unless the test file
  // installed its own fetch stub. Other requests go to the real fetch (only localhost is used by tests).
  if (globalThis.fetch === nativeFetch) {
    globalThis.fetch = async (input, init) =>
      frankfurterStubResponse(input) ?? nativeFetch(input, init);
  }

  // Transactions need a replica set; a single wiredTiger node is enough.
  const mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = mongoServer.getUri('finvision_test');

  const [
    { app },
    { connectToDatabase, disconnectFromDatabase },
    { ensureSystemCategories },
    { env },
  ] = await Promise.all([
    import('../../src/app.js'),
    import('../../src/database/mongoose.js'),
    import('../../src/models/category.js'),
    import('../../src/config/env.js'),
  ]);

  // env.js reads server/.env once, on first import. If a test file imported it before this runtime set the
  // in-memory URI, the real database URI would be used: refuse to connect rather than touch a real database.
  if (env.MONGODB_URI !== process.env.MONGODB_URI) {
    await mongoServer.stop();
    throw new Error(
      'Refusing to run tests: src/config/env.js was loaded before the test runtime set the in-memory MONGODB_URI. ' +
        'Import src modules that read env dynamically, after getTestRuntime().',
    );
  }

  await connectToDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await ensureSystemCategories();

  // Clear documents instead of dropping the database so unique indexes survive between tests.
  const resetDatabase = async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
    await ensureSystemCategories();
  };

  // Listen on 127.0.0.1 explicitly and hand supertest the running server. Given a bare app, supertest listens on
  // all interfaces but connects to 127.0.0.1, so another local process holding that port on IPv4 can answer instead.
  const server = await new Promise((resolve) => {
    const listeningServer = http
      .createServer(app)
      .listen(0, '127.0.0.1', () => resolve(listeningServer));
  });

  const teardown = async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectFromDatabase();
    await mongoServer.stop();
  };

  return {
    app: server,
    resetDatabase,
    teardown,
  };
};

export const getTestRuntime = async () => {
  if (!runtimePromise) {
    runtimePromise = createRuntime();
  }

  activeConsumers += 1;
  return runtimePromise;
};

export const releaseTestRuntime = async () => {
  if (activeConsumers > 0) {
    activeConsumers -= 1;
  }

  if (!runtimePromise || activeConsumers > 0) {
    return;
  }

  const runtime = await runtimePromise;
  await runtime.teardown();
  runtimePromise = null;
};
