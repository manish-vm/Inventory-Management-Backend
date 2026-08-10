require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('products');

    const indexesBefore = await collection.indexes();
    console.log('Indexes before migration:');
    console.log(JSON.stringify(indexesBefore, null, 2));

    const oldIndexExists = indexesBefore.some(idx => idx.name === 'dealerId_1_slug_1');
    if (oldIndexExists) {
      console.log('Dropping index: dealerId_1_slug_1');
      await collection.dropIndex('dealerId_1_slug_1');
      console.log('Successfully dropped dealerId_1_slug_1');
    } else {
      console.log('Index dealerId_1_slug_1 does not exist, skipping drop.');
    }

    console.log('Syncing indexes...');
    await Product.syncIndexes();
    console.log('Indexes synced successfully.');

    const indexesAfter = await collection.indexes();
    console.log('Indexes after migration:');
    console.log(JSON.stringify(indexesAfter, null, 2));

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

run();
