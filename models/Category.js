const mongoose = require('mongoose');

const makeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, sparse: true, trim: true, lowercase: true },
  description: { type: String },
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

categorySchema.index(
  { dealerId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
categorySchema.index({ dealerId: 1, slug: 1 }, { unique: true, sparse: true });

categorySchema.pre('save', function(next) {
  if (!this.slug) this.slug = makeSlug(this.name);
  next();
});

// Derive the slug from the effective update in a way that handles plain
// `{ name }`, `{ $set: { name } }`, and `{ $setOnInsert: { name } }` updates.
// The `$setOnInsert` path is used by bulk upload (findOneAndUpdate + upsert),
// which would otherwise bypass the pre('save') hook and store a null slug.
categorySchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  const setOnInsert = update.$setOnInsert || {};

  // Plain (non-operator) update: { name, description, ... }
  if (!update.$set && !update.$setOnInsert && update.name) {
    if (!update.slug) update.slug = makeSlug(update.name);
    this.setUpdate(update);
    return next();
  }

  // Ensure a slug is always present when creating via $setOnInsert.
  if (setOnInsert.name && !setOnInsert.slug && !set.slug) {
    update.$setOnInsert = { ...setOnInsert, slug: makeSlug(setOnInsert.name) };
  }

  // If a name is being set but no slug is provided, derive it.
  if (set.name && !set.slug) {
    update.$set = { ...set, slug: makeSlug(set.name) };
  }

  this.setUpdate(update);
  next();
});

module.exports = mongoose.model('Category', categorySchema);
