require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function clearDatabase() {
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--confirm');
  if (dryRun === confirmed) {
    throw new Error('Choose exactly one mode: --dry-run or --confirm');
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI or MONGODB_URI is required');

  await mongoose.connect(mongoUri);

  try {
    const superAdminCount = await User.countDocuments({ role: 'superadmin' });
    if (superAdminCount === 0) {
      throw new Error('No superadmin account exists; refusing to clear the database');
    }

    const db = mongoose.connection.db;
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .filter(({ name }) => !name.startsWith('system.'));
    const results = [];

    for (const { name } of collections) {
      const collection = db.collection(name);
      const isUsersCollection = name === User.collection.name;
      const filter = isUsersCollection ? { role: { $ne: 'superadmin' } } : {};

      if (dryRun) {
        results.push({
          collection: name,
          deleted: 0,
          wouldDelete: await collection.countDocuments(filter)
        });
      } else {
        const result = await collection.deleteMany(filter);
        results.push({
          collection: name,
          deleted: result.deletedCount || 0,
          wouldDelete: undefined
        });
      }
    }

    const totalDeleted = results.reduce((total, row) => total + row.deleted, 0);
    const totalWouldDelete = results.reduce((total, row) => total + (row.wouldDelete || 0), 0);
    console.table(results);
    if (dryRun) {
      console.log(`Dry run completed. ${totalWouldDelete} documents would be deleted. ${superAdminCount} superadmin account(s) would be preserved.`);
    } else {
      console.log(`Database reset completed. Deleted ${totalDeleted} documents. ${superAdminCount} superadmin account(s) were preserved.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

clearDatabase().catch((error) => {
  console.error('Database reset failed:', error);
  process.exitCode = 1;
});
