import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import Setting from './models/settingModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const checkSettings = async () => {
    try {
        await connectDB();
        const settings = await Setting.findOne({ key: 'razorpay_settings' });
        
        if (settings) {
            console.log('--- Razorpay Settings in DB ---');
            console.log('isConnected:', settings.value?.isConnected);
            console.log('keyId:', settings.value?.keyId);
            console.log('environment:', settings.value?.environment);
            
            if (settings.value?.keyId && settings.value.keyId.startsWith('rzp_test_')) {
                console.log('⚠️ DB contains TEST keys. These are overriding your LIVE keys in .env!');
                
                // Option: Disconnect DB settings so it falls back to .env
                settings.value.isConnected = false;
                await settings.save();
                console.log('✅ Disconnected DB settings. The system will now use .env keys.');
            } else {
                console.log('DB settings seem correct or are not in test mode.');
            }
        } else {
            console.log('No Razorpay settings found in DB. Falling back to .env.');
        }
        
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

checkSettings();
