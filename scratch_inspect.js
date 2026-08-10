require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Category = require('./models/Category');
const Subcategory = require('./models/Subcategory');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const products = await Product.find({
      $or: [
        { productName: /visor/i },
        { slug: /visor/i }
      ]
    }).populate('category').populate('subcategory');

    console.log(`Found ${products.length} products:`);
    for (const p of products) {
      console.log({
        _id: p._id,
        productName: p.productName,
        code: p.code,
        slug: p.slug,
        category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
        subcategory: p.subcategory ? { name: p.subcategory.name, slug: p.subcategory.slug } : null,
        dealerId: p.dealerId
      });
    }

  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
