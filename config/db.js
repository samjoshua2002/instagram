const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
