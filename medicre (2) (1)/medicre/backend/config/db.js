const mongoose = require('mongoose');

const RETRY_MS = 10000;
const TARGET_DB = 'hospital';
let retryTimer = null;
let connecting = false;

const connectDB = async () => {
  if (connecting) return;
  connecting = true;

  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not set in backend/.env');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      dbName: TARGET_DB
    });
    console.log(`MongoDB Atlas Connected Successfully! Using database: ${mongoose.connection.name}`);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  } catch (error) {
    console.error('MongoDB Connection Failed:', error.message);
    console.error(`Retrying MongoDB connection in ${RETRY_MS / 1000}s...`);
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectDB();
      }, RETRY_MS);
    }
  } finally {
    connecting = false;
  }
};

mongoose.connection.on('disconnected', () => {
  if (!retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectDB();
    }, RETRY_MS);
  }
});

module.exports = connectDB;
