import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/categoryModel.js';

dotenv.config({ path: '.env' });

async function seedCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const categories = [
            { name: 'Sunglasses', slug: 'sunglasses', description: 'Premium eyewear for the modern lifestyle.' },
            { name: 'Perfumes', slug: 'perfumes', description: 'Exquisite fragrances and scents.' },
            { name: 'Caps', slug: 'caps', description: 'Stylish headwear and accents.' }
        ];

        for (const cat of categories) {
            const existing = await Category.findOne({ slug: cat.slug });
            if (!existing) {
                await Category.create(cat);
                console.log(`Created category: ${cat.name}`);
            } else {
                console.log(`Category already exists: ${cat.name}`);
            }
        }
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedCategories();
