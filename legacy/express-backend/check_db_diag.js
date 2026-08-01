import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import Product from './models/productModel.js';

dotenv.config();

async function check() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.log('MONGO_URI is missing from process.env');
      process.exit(1);
    }
    
    await mongoose.connect(uri);
    
    const products = await Product.find({}, 'productId product productName category status');
    console.log('Total products:', products.length);
    
    const uniqueProductClasses = [...new Set(products.map(p => p.product))];
    console.log('Unique "product" values in DB:', uniqueProductClasses);
    
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    console.log('Unique "category" values in DB:', uniqueCategories);

    const necklaces = products.filter(p => p.product && p.product.toLowerCase().includes('neck'));
    console.log('Necklace-related products in DB:', JSON.stringify(necklaces.map(p => ({ id: p.productId, product: p.product, name: p.productName })), null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
