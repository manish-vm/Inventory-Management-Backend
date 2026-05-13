const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productCode: { type: String, unique: true }, // Used for Barcode - auto-generated if not provided

  // Only the fields required by your product concept
  brandName: { type: String },
  model: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },

  // Keep pricing & stock in DB (used by Billing/POS). These are auto-defaulted
  // when not provided by the UI.
  stockQuantity: { type: Number, default: 0 },
  minStockLevel: { type: Number, default: 5 },
  sellingPrice: { type: Number, default: 0 },
  basePrice: { type: Number, default: 0 },

  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dealer' }, // For multi-tenant architecture
  isActive: { type: Boolean, default: true },
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

