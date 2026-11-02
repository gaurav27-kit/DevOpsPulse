import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Establish connection to MongoDB using Mongoose.
 * Exits process with failure code if connection cannot be established.
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);
    console.log(`[Database] MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

