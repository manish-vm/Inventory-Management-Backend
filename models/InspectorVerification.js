const mongoose = require('mongoose');

const inspectorVerificationSchema = new mongoose.Schema({
  productId: { type: String, default: '', index: true },
  processingStageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProcessingStage',
    default: null
  },
  employeeSubmissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InspectionFormResponse',
    required: true,
    unique: true,
    index: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  inspectorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  employeeAcceptedCount: { type: Number, required: true, min: 0 },
  inspectorAcceptedCount: { type: Number, required: true, min: 0 },
  employeeRejectedCount: { type: Number, default: 0, min: 0 },
  employeeReworkCount: { type: Number, default: 0, min: 0 },
  difference: { type: Number, required: true },
  verificationStatus: {
    type: String,
    enum: ['matched', 'over_count', 'under_count'],
    required: true,
    index: true
  },
  remarks: { type: String, default: '' },
  verifiedAt: { type: Date, default: Date.now, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }
}, { timestamps: true });

inspectorVerificationSchema.index({ inspectorId: 1, verifiedAt: -1 });
inspectorVerificationSchema.index({ productId: 1, verifiedAt: -1 });

module.exports = mongoose.model('InspectorVerification', inspectorVerificationSchema);
