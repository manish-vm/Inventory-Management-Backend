const mongoose = require('mongoose');

const brandModelSchema = new mongoose.Schema({
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
  name: { type: String, required: true, trim: true, index: true },
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

brandModelSchema.index({ dealerId: 1, brandId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

brandModelSchema.pre('save', function (next) {
  if (this.name) this.name = this.name.trim();
  next();
});

module.exports = mongoose.model('BrandModel', brandModelSchema);

