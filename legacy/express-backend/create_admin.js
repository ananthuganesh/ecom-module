import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import User from './models/userModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const createAdmin = async () => {
    try {
        await connectDB();

        const email = 'fathimasalam217@gmail.com';
        const password = process.env.ADMIN_PASSWORD || 'urbanaana123';

        const userExists = await User.findOne({ email });

        if (userExists) {
            userExists.isAdmin = true;
            userExists.password = password;
            await userExists.save();
            console.log(`✅ User ${email} updated to Admin.`);
        } else {
            await User.create({
                name: 'Urban Aana Admin',
                email,
                password,
                isAdmin: true
            });
            console.log(`✅ Admin account created for ${email}.`);
        }

        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

createAdmin();
