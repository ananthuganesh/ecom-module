import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import connectDB from './config/db.js';

dotenv.config();
connectDB();

const generateSlugs = async () => {
    try {
        console.log('Fetching all products...');
        const products = await Product.find({});
        console.log(`Found ${products.length} products. Generating slugs...`);

        for (const product of products) {
            // Clear existing slug to trigger regeneration with new logic
            product.slug = undefined;
            await product.save();
            console.log(`Updated: ${product.productName} -> ${product.slug}`);
        }

        console.log('Slug generation complete!');
        process.exit();
    } catch (error) {
        console.error('Error generating slugs:', error.message);
        process.exit(1);
    }
};

generateSlugs();
