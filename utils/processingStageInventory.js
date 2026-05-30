const ManufacturingConfig = require('../models/ManufacturingConfig');
const ProcessingStage = require('../models/ProcessingStage');

const normalizePartNo = (partNo) => String(partNo || '').trim().toUpperCase();

const getFirstStageForProduct = async (product) => {
  const config = await ManufacturingConfig.findOne({ productName: product.productName });
  const stages = [...(config?.stages || [])].sort((a, b) => Number(a.stageNumber) - Number(b.stageNumber));

  return stages[0] || {
    stageNumber: 1,
    stageName: 'Manufacturing'
  };
};

const syncStageOneInputQuantity = async (product) => {
  const partNo = normalizePartNo(product?.partNo || product?.productCode);
  const inputQuantity = Number(product?.numberOfItems || 0);

  if (!partNo || !Number.isFinite(inputQuantity) || inputQuantity <= 0) {
    return null;
  }

  const firstStage = await getFirstStageForProduct(product);

  return ProcessingStage.findOneAndUpdate(
    {
      partNo,
      stageNumber: Number(firstStage.stageNumber || 1),
      qrId: { $exists: false }
    },
    {
      $set: {
        partNo,
        stageNumber: Number(firstStage.stageNumber || 1),
        stageName: firstStage.stageName || 'Manufacturing',
        inputQuantity,
        status: 'pending',
        operator: 'system'
      },
      $setOnInsert: {
        acceptedQuantity: 0,
        rejectedQuantity: 0,
        reworkQuantity: 0,
        outputQuantity: 0
      }
    },
    { new: true, upsert: true }
  );
};

module.exports = {
  syncStageOneInputQuantity
};
