const mongoose = require('mongoose');
require('dotenv').config();

const DefectDetail = require('./models/DefectDetail');
const helmetDefectDetails = require('./seedData/helmetDefectDetails');

const MONGODB_URI = process.env.MONGODB_URI;

const seedHelmetDefectDetails = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const operations = helmetDefectDetails.map((name) => ({
    updateOne: {
      filter: { type: 'both', name },
      update: { $set: { type: 'both', name, isActive: true } },
      upsert: true,
    },
  }));

  const result = operations.length
    ? await DefectDetail.bulkWrite(operations, { ordered: false })
    : { upsertedCount: 0, modifiedCount: 0 };

  console.log(`Helmet defect details seed complete.`);
  console.log(`Total source defects: ${helmetDefectDetails.length}`);
  console.log(`Inserted: ${result.upsertedCount || 0}`);
  console.log(`Updated: ${result.modifiedCount || 0}`);
};

seedHelmetDefectDetails()
  .catch((error) => {
    console.error('Failed to seed helmet defect details:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
