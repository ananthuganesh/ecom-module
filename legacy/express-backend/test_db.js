import './config/env.js';
import mongoose from 'mongoose';

const testConnection = async () => {
    console.log('--- Database Connection Test ---');
    console.log('URI:', process.env.MONGO_URI.replace(/:([^@]+)@/, ':****@')); // Mask password
    
    try {
        console.log('Connecting...');
        const start = Date.now();
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
        });
        const duration = Date.now() - start;
        console.log(`✅ Connected successfully in ${duration}ms`);
        
        console.log('Testing a simple query...');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`✅ Query successful. Found ${collections.length} collections.`);
        
        console.log('Test PASSED.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test FAILED.');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Cause:', error.cause?.message || 'N/A');
        
        if (error.name === 'MongoServerSelectionError') {
            console.log('\n💡 SUGGESTION: This usually means your IP address is not whitelisted on MongoDB Atlas.');
            console.log('Please go to Atlas -> Network Access and add "0.0.0.0/0" for testing.');
        }
        
        process.exit(1);
    }
};

testConnection();
