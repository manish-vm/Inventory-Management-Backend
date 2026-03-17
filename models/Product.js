const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productCode: { type: String, unique: true }, // Used for Barcode - auto-generated if not provided
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },
  stockQuantity: { type: Number, default: 0 },
  minStockLevel: { type: Number, default: 5 },
  sellingPrice: { type: Number, required: true },
  basePrice: { type: Number, required: true },
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' }, // For multi-tenant architecture
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

// Auto-generate unique productCode (barcode) before saving
// Uses timestamp + random string to ensure uniqueness even after deletion
productSchema.pre('save', async function(next) {
  if (!this.productCode) {
    // Generate unique barcode: PRD- + timestamp + random 6 chars
    let isUnique = false;
    let newCode = '';
    
    while (!isUnique) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
      newCode = `PRD-${timestamp}-${randomChars}`;
      
      // Check if this code exists in any product (including deleted ones)
      const existing = await this.constructor.findOne({ productCode: newCode });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.productCode = newCode;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
