const mongoose = require('mongoose');

const defectDetailSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['reject', 'rework', 'both'],
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  productionLine: { type: String, default: '', index: true },
  reportType: { type: String, default: '', index: true },
  processKey: { type: String, default: '' },
  processName: { type: String, default: '' },
  partKey: { type: String, default: '' },
  partName: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer', default: null },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

defectDetailSchema.index({ dealerId: 1, type: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
defectDetailSchema.index({ dealerId: 1, productionLine: 1, reportType: 1, processKey: 1, partKey: 1, sortOrder: 1 });

module.exports = mongoose.model('DefectDetail', defectDetailSchema);
