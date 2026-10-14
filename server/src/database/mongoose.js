import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

mongoose.connection.on('connected', () => {
  logger.info('db.connected');
});

mongoose.connection.on('error', (error) => {
  logger.error('db.error', {
    message: error?.message ?? 'Unknown MongoDB connection error',
    stack: error?.stack,
  });
});

mongoose.connection.on('disconnected', () => {
  logger.info('db.disconnected');
});

export const connectToDatabase = async () => {
  await mongoose.connect(env.MONGODB_URI);
};

export const REPLICA_SET_REQUIRED_MESSAGE = [
  'MongoDB at MONGODB_URI is a standalone server, but FinVision needs a replica set (or mongos) because',
  'wallet, top-up, order and reset operations run in transactions.',
  '',
  'Run a local single-node replica set from the repository root:',
  '  docker compose up -d mongo',
  'then set in server/.env:',
  '  MONGODB_URI=mongodb://localhost:27017/finvision?replicaSet=rs0&directConnection=true',
  '',
  'Without Docker: start mongod with --replSet rs0, run mongosh --eval "rs.initiate()" once,',
  'and use the same URI. MongoDB Atlas clusters are replica sets already.',
].join('\n');

export const getMongoTopology = async (connection = mongoose.connection) => {
  const hello = await connection.db.admin().command({ hello: 1 });

  if (hello.msg === 'isdbgrid') {
    return 'mongos';
  }

  return hello.setName ? 'replicaSet' : 'standalone';
};

export const assertTransactionSupport = async (connection = mongoose.connection) => {
  const topology = await getMongoTopology(connection);

  if (topology === 'standalone') {
    const error = new Error(REPLICA_SET_REQUIRED_MESSAGE);
    error.code = 'MONGO_STANDALONE';
    throw error;
  }

  return topology;
};

export const disconnectFromDatabase = async () => {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) {
    return;
  }

  await mongoose.disconnect();
};
