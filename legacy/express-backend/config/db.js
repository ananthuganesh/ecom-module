import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        mongoose.connection.on('error', (err) => {
            console.error(`[MongoDB] Connection Error: ${err.message}`);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('[MongoDB] Disconnected from database. Attempting to reconnect...');
        });

        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 20000,
            connectTimeoutMS: 20000,
            socketTimeoutMS: 45000,
        });
        console.log(`[MongoDB] Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[MongoDB] Initial Connection Error: ${error.message}`);
        // Don't exit process here, let Mongoose try to reconnect
    }
};

export default connectDB;
