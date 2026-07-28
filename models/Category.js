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

categorySchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  const values = update.$set || update;
  if (values.name && !values.slug) values.slug = makeSlug(values.name);
  if (update.$set) update.$set = values;
  this.setUpdate(update);
  next();
});

module.exports = mongoose.model('Category', categorySchema);
