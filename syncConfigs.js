require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const ManufacturingConfig = require('./models/ManufacturingConfig');

const MONGODB_URI = process.env.MONGODB_URI;

const defaultStages = [
  {
    stageNumber: 1,
    stageName: 'Manufacturing',
    stageType: 'manufacturing',
    requiresValidation: false
  }
];

async function sync() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const products = await Product.find({ isDeleted: false }).lean();
    console.log(`Found ${products.length} products in DB`);

    const configs = await ManufacturingConfig.find({});
    console.log(`Found ${configs.length} existing manufacturing configs`);

    const existingNames = new Set(configs.map(c => String(c.productName || '').toLowerCase().trim()));

    let createdCount = 0;
    for (const p of products) {
      const cleanName = String(p.productName || '').trim();
      if (!cleanName) continue;

      if (!existingNames.has(cleanName.toLowerCase())) {
        try {
          await ManufacturingConfig.create({
            productName: cleanName,
            workflowType: '1-step',
            stages: defaultStages,
            isActive: true,
            ...(p.dealerId ? { dealerId: p.dealerId } : {})
          });
          console.log(`Created ManufacturingConfig for product: ${cleanName}`);
          createdCount++;
        } catch (err) {
          console.error(`Failed to create config for ${cleanName}:`, err.message);
        }
      }
    }

    console.log(`Sync completed. Created ${createdCount} missing manufacturing configs.`);
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

sync();
