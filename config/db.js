const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = (process.env.MONGODB_URI || '').trim().replace(/^["']|["']$/g, '');
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables.');
    }

    if (mongoUri.includes('<password>') || mongoUri.includes('<db_password>')) {
      throw new Error('MONGODB_URI still contains the placeholder "<password>". Replace it with your actual database user password.');
    }

    // Safe sanitized display of connection target
    const sanitizedUri = mongoUri.replace(/:([^:@]+)@/, ':****@');
    console.log(`🔌 Attempting MongoDB connection to: ${sanitizedUri}`);

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('💡 Tip: Verify your MongoDB Atlas username and password in Render Environment Variables.');
      console.error('💡 Ensure the database user exists in MongoDB Atlas -> Security -> Database Access.');
    }
    process.exit(1);
  }
};

module.exports = connectDB;
