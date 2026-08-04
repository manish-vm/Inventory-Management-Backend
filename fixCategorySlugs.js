// One-time data repair script.
// Fixes existing Category / Subcategory documents that have a `null` slug
// (which violates the unique sparse index on { dealerId, slug }).
//
// Strategy:
//   1. For every document where slug is null / missing / empty, derive a slug
//      from its name (Category) or `category-name` (Subcategory).
//   2. If two documents end up with the same slug + dealerId, append a short
//      unique suffix to the later one so the unique index is never violated.
//   3. Report counts. Supports --dry-run to preview without writing.
//
// Usage:
//   node fixCategorySlugs.js            # apply fixes
//   node fixCategorySlugs.js --dry-run  # preview only
require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

const Category = require('./models/Category');
const Subcategory = require('./models/Subcategory');

const makeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const isMissing = (value) =>
  value === null || value === undefined || String(value).trim() === '';

// Ensure every doc in `docs` has a unique slug per dealerId by appending a
// short deterministic suffix when a collision is detected.
const ensureUniqueSlugs = (docs) => {
  const seen = new Map(); // key: `${dealerId}::${slug}` -> count
  return docs.map((doc) => {
    const dealerKey = String(doc.dealerId || '');
    let slug = doc.slug;
    let key = `${dealerKey}::${slug}`;
    let count = seen.get(key) || 0;
    if (count > 0) {
      const suffix = `${slug}-${count + 1}`;
      doc.slug = suffix;
      seen.set(`${dealerKey}::${suffix}`, 1);
      seen.set(key, count + 1);
    } else {
      seen.set(key, 1);
    }
    return doc;
  });
};

async function fixSlugs() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI or MONGODB_URI is required');

  await mongoose.connect(mongoUri);
  const dryRun = process.argv.includes('--dry-run');

  const report = { categories: { fixed: 0, skipped: 0, collisions: 0 }, subcategories: { fixed: 0, skipped: 0, collisions: 0 } };

  // ---- Categories ----
  const categories = await Category.find({}).lean();
  const categoryDocs = categories.map((doc) => {
    const fixed = { ...doc };
    if (isMissing(fixed.slug)) {
      fixed.slug = makeSlug(fixed.name);
      report.categories.fixed += 1;
    } else {
      report.categories.skipped += 1;
    }
    return fixed;
  });
  const categoriesBefore = JSON.stringify(categoryDocs.map((d) => d.slug));
  ensureUniqueSlugs(categoryDocs);
  categoryDocs.forEach((doc, index) => {
    if (doc.slug !== categories[index].slug) {
      report.categories.collisions += 1;
    }
  });
  const categoriesAfter = JSON.stringify(categoryDocs.map((d) => d.slug));

  // ---- Subcategories ----
  const subcategories = await Subcategory.find({}).lean();
  const subcategoryDocs = subcategories.map((doc) => {
    const fixed = { ...doc };
    if (isMissing(fixed.slug)) {
      fixed.slug = makeSlug(`${fixed.category || ''}-${fixed.name}`);
      report.subcategories.fixed += 1;
    } else {
      report.subcategories.skipped += 1;
    }
    return fixed;
  });
  const subcategoriesBefore = JSON.stringify(subcategoryDocs.map((d) => d.slug));
  ensureUniqueSlugs(subcategoryDocs);
  subcategoryDocs.forEach((doc, index) => {
    if (doc.slug !== subcategories[index].slug) {
      report.subcategories.collisions += 1;
    }
  });
  const subcategoriesAfter = JSON.stringify(subcategoryDocs.map((d) => d.slug));

  console.log('Category slug summary:', report.categories);
  console.log('Subcategory slug summary:', report.subcategories);

  if (dryRun) {
    console.log('Dry run — no changes written.');
    console.log('Category slugs changed:', categoriesBefore !== categoriesAfter);
    console.log('Subcategory slugs changed:', subcategoriesBefore !== subcategoriesAfter);
    await mongoose.connection.close();
    return;
  }

  // Write in batches to avoid duplicate-key errors mid-flight.
  const bulkWriteDocs = async (model, docs) => {
    const ops = docs
      .filter((doc) => !isMissing(doc.slug))
      .map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { slug: doc.slug } }
        }
      }));
    if (ops.length) {
      await model.bulkWrite(ops, { ordered: false });
    }
  };

  await bulkWriteDocs(Category, categoryDocs);
  await bulkWriteDocs(Subcategory, subcategoryDocs);

  console.log('Category slugs fixed.');
  console.log('Subcategory slugs fixed.');
  await mongoose.connection.close();
}

fixSlugs().catch(async (error) => {
  console.error('Fix failed:', error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
