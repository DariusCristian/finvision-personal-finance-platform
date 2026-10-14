import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let runtimePromise = null;
let activeConsumers = 0;

const ensureTestEnv = () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = process.env.PORT ?? '5005';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:5173';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret';
};

const createRuntime = async () => {
  ensureTestEnv();

  // Transactions need a replica set; a single wiredTiger node is enough.
  const mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = mongoServer.getUri('finvision_test');

  const [{ app }, { connectToDatabase, disconnectFromDatabase }, { ensureSystemCategories }] =
    await Promise.all([
      import('../../src/app.js'),
      import('../../src/database/mongoose.js'),
      import('../../src/models/category.js'),
    ]);

  await connectToDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await ensureSystemCategories();

  // Clear documents instead of dropping the database so unique indexes survive between tests.
  const resetDatabase = async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
    await ensureSystemCategories();
  };

  const teardown = async () => {
    await disconnectFromDatabase();
    await mongoServer.stop();
  };

  return {
    app,
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
