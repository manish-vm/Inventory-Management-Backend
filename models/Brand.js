const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

brandSchema.index(
  { dealerId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

brandSchema.pre('save', function (next) {
  if (this.name) this.name = this.name.trim();
  next();
});

module.exports = mongoose.model('Brand', brandSchema);

