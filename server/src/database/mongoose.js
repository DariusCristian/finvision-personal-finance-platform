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

export const disconnectFromDatabase = async () => {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) {
    return;
  }

  await mongoose.disconnect();
};
