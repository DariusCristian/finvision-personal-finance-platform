import mongoose from 'mongoose';

import { env } from '../config/env.js';

mongoose.connection.on('connected', () => {
  console.info('[db] MongoDB connected');
});

mongoose.connection.on('error', (error) => {
  console.error('[db] MongoDB connection error', error);
});

mongoose.connection.on('disconnected', () => {
  console.info('[db] MongoDB disconnected');
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
