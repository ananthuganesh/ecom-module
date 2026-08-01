import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const Product = mongoose.model('Product', new mongoose.Schema({
        productName: String,
        images: [String],
        thumbnails: [String],
        variants: [{ images: [String] }]
    }));
    
    const product = await Product.findOne();
    console.log('Product:', product.productName);
    console.log('Images:', product.images);
    console.log('Thumbnails:', product.thumbnails);
    if (product.variants && product.variants[0]) {
        console.log('Variant Images:', product.variants[0].images);
    }
    process.exit();
}

check();
