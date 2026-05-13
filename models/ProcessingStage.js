const mongoose = require('mongoose');

const processingStageSchema = new mongoose.Schema({
  qrId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'QRCode',
    required: true
  },
  partNo: { 
    type: String, 
    required: true
  },
  stageNumber: { 
    type: Number, 
    required: true
  },
  stageName: { 
    type: String, 
    required: true
  },
  inputQuantity: { 
    type: Number, 
    required: true
  },
  outputQuantity: { 
    type: Number, 
    default: 0
  },
  operator: { 
    type: String
  },
  processedAt: { 
    type: Date,
    default: Date.now
  },
  validated: { 
    type: Boolean, 
    default: false
  },
  validatedBy: { 
    type: String
  },
  validationRemarks: { 
    type: String
  },
  status: { 
    type: String, 
    enum: ['pending', 'in_progress', 'completed', 'validated', 'skipped'],
    default: 'pending'
  },
  dealerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Dealer' 
  }
}, { timestamps: true });

processingStageSchema.index({ qrId: 1 });
processingStageSchema.index({ partNo: 1, stageNumber: 1 });

module.exports = mongoose.model('ProcessingStage', processingStageSchema);