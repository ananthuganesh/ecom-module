import dotenv from 'dotenv';
import connectDB from './config/db.js';
import User from './models/userModel.js';
import Product from './models/productModel.js';
import Order from './models/orderModel.js';

dotenv.config();
connectDB();

const users = [
    { name: 'Admin User', email: 'admin@urbanaana.com', password: 'admin123', isAdmin: true },
    { name: 'John Doe', email: 'john@example.com', password: 'user123', isAdmin: false },
    { name: 'Jane Doe', email: 'jane@example.com', password: 'user123', isAdmin: false },
];

// No dummy products — admin products come from DB only (add via Admin panel).
// Use create() so pre('save') hashes passwords; insertMany() skips middleware.

const importData = async () => {
    try {
        await Order.deleteMany();
        await Product.deleteMany();
        await User.deleteMany();

        for (const u of users) {
            await User.create(u);
        }

        console.log('✅ Data Imported Successfully!');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const destroyData = async () => {
    try {
        await Order.deleteMany();
        await Product.deleteMany();
        await User.deleteMany();
        console.log('✅ Data Destroyed!');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

if (process.argv[2] === '-d') {
    destroyData();
} else {
    importData();
}
