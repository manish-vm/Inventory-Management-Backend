const mongoose = require('mongoose');

const productItemSchema = new mongoose.Schema(
  {
    // The root product definition (inventory source)
    rootProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },

    // Root product part number, e.g. MTR001
    rootPartNo: {
      type: String,
      required: true,
      index: true
    },

    // Item-level part number, e.g. MTR001001
    partNo: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // 1..N
    itemNumber: {
      type: Number,
      required: true,
      index: true
    },

    // Derived: which item belongs to which manufacturing stage transitions
    // (kept minimal for now; ProcessingStage will be refactored to use these fields)
    dealerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dealer'
    }
  },
  { timestamps: true }
);

productItemSchema.index({ rootPartNo: 1, itemNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProductItem', productItemSchema);

