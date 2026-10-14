import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { getTestRuntime, releaseTestRuntime } from '../support/test-runtime.js';

const SERVER_ENTRY = fileURLToPath(new URL('../../src/index.js', import.meta.url));

// Loaded after the test runtime sets the in-memory MONGODB_URI (src/config/env.js reads server/.env on first import).
let assertTransactionSupport;
let getMongoTopology;
let standaloneServer;
let standaloneConnection;
let replicaSetUri;

const getFreePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// Starts the real server entry point as a child process. It runs from the OS temp directory so dotenv cannot load
// server/.env: only the variables passed here are used, and the database is always an in-memory one.
const startServerProcess = async (mongoUri, { stopWhen } = {}) => {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: os.tmpdir(),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: String(await getFreePort()),
      MONGODB_URI: mongoUri,
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-0123456789',
    },
  });

  let output = '';
  const collect = (chunk) => {
    output += chunk;
    if (stopWhen && output.includes(stopWhen)) {
      child.kill('SIGTERM');
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { exitCode, output };
};

before(async () => {
  await getTestRuntime();
  ({ assertTransactionSupport, getMongoTopology } = await import('../../src/database/mongoose.js'));
  // The test runtime exports its in-memory replica set URI.
  replicaSetUri = process.env.MONGODB_URI;
  standaloneServer = await MongoMemoryServer.create();
  standaloneConnection = await mongoose.createConnection(standaloneServer.getUri('finvision_topology')).asPromise();
});

after(async () => {
  await standaloneConnection?.close();
  await standaloneServer?.stop();
  await releaseTestRuntime();
});

test('getMongoTopology reports a replica set for the test runtime and standalone for a plain mongod', async () => {
  assert.equal(await getMongoTopology(), 'replicaSet');
  assert.equal(await getMongoTopology(standaloneConnection), 'standalone');
});

test('assertTransactionSupport rejects a standalone server with setup instructions', async () => {
  await assert.rejects(assertTransactionSupport(standaloneConnection), (error) => {
    assert.equal(error.code, 'MONGO_STANDALONE');
    assert.match(error.message, /docker compose up -d mongo/);
    assert.match(error.message, /replicaSet=rs0/);
    return true;
  });
});

test('the server exits at startup with a clear error on a standalone MongoDB', async () => {
  const { exitCode, output } = await startServerProcess(standaloneServer.getUri('finvision_topology'));

  assert.equal(exitCode, 1);
  assert.match(output, /needs a replica set/);
  assert.match(output, /docker compose up -d mongo/);
});

test('the server starts normally on a replica set', async () => {
  assert.match(replicaSetUri, /^mongodb:\/\/127\.0\.0\.1/);

  const { output } = await startServerProcess(replicaSetUri, { stopWhen: '"server.started"' });

  assert.match(output, /"db.topology".*"topology":"replicaSet"/);
  assert.match(output, /"server.started"/);
});
