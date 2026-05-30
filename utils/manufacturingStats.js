const ProcessingStage = require('../models/ProcessingStage');
const Product = require('../models/Product');
const ProductStage = require('../models/ProductStage');
const { syncStageOneInputQuantity } = require('./processingStageInventory');

const normalizePartNo = (partNo) => String(partNo || '').trim();
const parseStageNumber = (stageNumber) => {
  const exact = Number(stageNumber);
  if (Number.isFinite(exact) && exact > 0) return exact;

  const suffixMatch = String(stageNumber || '').match(/-(\d+)$/);
  const suffix = suffixMatch ? Number(suffixMatch[1]) : NaN;
  return Number.isFinite(suffix) && suffix > 0 ? suffix : null;
};

const getProductIdealInventory = async (partNo) => {
  const normalizedPartNo = normalizePartNo(partNo);
  const upperPartNo = normalizedPartNo.toUpperCase();

  const product = await Product.findOne({
    $or: [
      { partNo: normalizedPartNo },
      { partNo: upperPartNo },
      { productCode: normalizedPartNo },
      { productCode: upperPartNo },
      { productName: normalizedPartNo }
    ]
  }).lean();

  const idealCount = Number(product?.numberOfItems || product?.stockQuantity || 0);
  return {
    product,
    idealCount: Number.isFinite(idealCount) && idealCount > 0 ? idealCount : 0
  };
};

/**
 * Manufacturing stats source of truth
 * Use ONLY ProcessingStage quantities. Product creation syncs Product.numberOfItems
 * into stage 1 inputQuantity, so analytics never depend on QR generation.
 */
const getManufacturingStatsByPartNo = async ({ partNo, stageNumber }) => {
  const normalizedPartNo = normalizePartNo(partNo);

  if (!normalizedPartNo) {
    return {
      partNo: '',
      stageNumber: stageNumber ? Number(stageNumber) : null,
      totalItems: 0,
      accepted: 0,
      rejected: 0,
      rework: 0,
      pending: 0
    };
  }

  const stageNum =
    stageNumber !== undefined && stageNumber !== null && stageNumber !== ''
      ? parseStageNumber(stageNumber)
      : null;

  // Stage mode
  if (stageNum) {
    const [productStageRow = {}] = await ProductStage.aggregate([
      {
        $match: {
          partNo: normalizedPartNo,
          stageNumber: stageNum
        }
      },
      {
        $group: {
          _id: '$stageNumber',
          totalInput: { $sum: '$availableQuantity' },
          accepted: { $sum: '$acceptedCount' },
          rejected: { $sum: '$rejectedCount' },
          rework: { $sum: '$reworkCount' }
        }
      }
    ]);

    if (productStageRow.totalInput !== undefined) {
      const totalItems = Number(productStageRow.totalInput || 0);
      const accepted = Number(productStageRow.accepted || 0);
      const rejected = Number(productStageRow.rejected || 0);
      const rework = Number(productStageRow.rework || 0);

      return {
        partNo: normalizedPartNo,
        stageNumber: stageNum,
        totalItems,
        inputQuantity: totalItems,
        accepted,
        rejected,
        rework,
        pending: Math.max(totalItems - (accepted + rejected + rework), 0)
      };
    }

    const [row = {}] = await ProcessingStage.aggregate([
      {
        $match: {
          partNo: normalizedPartNo,
          stageNumber: stageNum,
          $or: [{ qrId: { $exists: false } }, { qrId: null }]
        }
      },
      {
        $group: {
          _id: '$stageNumber',
          totalInput: { $sum: '$inputQuantity' },
          accepted: { $sum: '$acceptedQuantity' },
          rejected: { $sum: '$rejectedQuantity' },
          rework: { $sum: '$reworkQuantity' }
        }
      }
    ]);

    const totalInput = Number(row.totalInput || 0);
    let idealProductCount = 0;

    if (stageNum === 1 && totalInput === 0) {
      const { product, idealCount } = await getProductIdealInventory(normalizedPartNo);
      idealProductCount = idealCount;

      if (product && idealCount > 0) {
        await syncStageOneInputQuantity(product);
      }
    }

    const totalItems = totalInput || idealProductCount;
    const accepted = Number(row.accepted || 0);
    const rejected = Number(row.rejected || 0);
    const rework = Number(row.rework || 0);

    return {
      partNo: normalizedPartNo,
      stageNumber: stageNum,
      totalItems,
      inputQuantity: totalItems,
      accepted,
      rejected,
      rework,
      pending: Math.max(totalItems - (accepted + rejected + rework), 0)
    };
  }


  // Overall mode
  // NOTE: Manufacturing analytics should not depend on QRCode collection counts.
  // We aggregate ONLY from ProcessingStage.inputQuantity/counters.
  const [totals] = await ProcessingStage.aggregate([
    {
      $match: { partNo: normalizedPartNo }
    },
    {
      $group: {
        _id: null,
        totalInput: { $sum: '$inputQuantity' },
        accepted: { $sum: '$acceptedQuantity' },
        rejected: { $sum: '$rejectedQuantity' },
        rework: { $sum: '$reworkQuantity' }
      }
    }
  ]);

  const row = totals || {};
  const totalItems = Number(row.totalInput || 0);
  const accepted = Number(row.accepted || 0);
  const rejected = Number(row.rejected || 0);
  const rework = Number(row.rework || 0);
  const pending = Math.max(totalItems - (accepted + rejected + rework), 0);

  return {
    partNo: normalizedPartNo,
    stageNumber: null,
    totalItems,
    inputQuantity: totalItems,
    accepted,
    rejected,
    rework,
    pending
  };
};

module.exports = {
  getManufacturingStatsByPartNo
};
