import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './backend/models/categoryModel.js';

dotenv.config({ path: './backend/.env' });

async function checkCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const categories = await Category.find({});
        console.log('Categories in DB:');
        categories.forEach(c => {
            console.log(`- ${c.name} (slug: ${c.slug})`);
        });
        
        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkCategories();
