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

    const options = { serverSelectionTimeoutMS: 8000 };
    let conn;
    try {
      conn = await mongoose.connect(mongoUri, options);
    } catch (err) {
      // Some Windows routers hand out an IPv6 link-local DNS (fe80::1) that Node cannot query,
      // so the mongodb+srv lookup fails with querySrv ECONNREFUSED. Retry once with public DNS.
      if (!/querySrv|ENOTFOUND|ECONNREFUSED/.test(err.message || '') || !mongoUri.startsWith('mongodb+srv')) throw err;
      console.warn('⚠️ DNS lookup for MongoDB failed; retrying with public DNS (1.1.1.1, 8.8.8.8)...');
      require('dns').setServers(['1.1.1.1', '8.8.8.8']);
      conn = await mongoose.connect(mongoUri, options);
    }
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
