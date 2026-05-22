const ProcessingStage = require('../models/ProcessingStage');
const QRCode = require('../models/QRCode');

const normalizePartNo = (partNo) => String(partNo || '').trim();
const parseStageNumber = (stageNumber) => {
  const exact = Number(stageNumber);
  if (Number.isFinite(exact) && exact > 0) return exact;

  const suffixMatch = String(stageNumber || '').match(/-(\d+)$/);
  const suffix = suffixMatch ? Number(suffixMatch[1]) : NaN;
  return Number.isFinite(suffix) && suffix > 0 ? suffix : null;
};

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

  const stageNum = stageNumber !== undefined && stageNumber !== null && stageNumber !== '' ? parseStageNumber(stageNumber) : null;

  // Stage-wise statistics must be based on items currently *in* that stage.
  // `submitInspection()` advances `QRCode.currentStage` when a product is forwarded.
  // Therefore, stage totals must be derived from QRCode.currentStage.
  //
  // For stage-specific accepted/rejected/rework counts, we read ProcessingStage reviewStatus
  // but only for the same items whose current stage is that stage.

  const qrcodesInStageFilter = stageNum
    ? {
        partNo: normalizedPartNo,
        currentStage: stageNum === 1 ? { $in: [0, 1] } : stageNum
      }
    : { partNo: normalizedPartNo };

  const qrcodesInStageTotal = await QRCode.countDocuments(qrcodesInStageFilter);

  // Note: We rely on QRCode.currentStage as the single source of truth for where an item is currently located.


  if (!stageNum) {
    // If no stageNumber is provided, keep a sensible overall aggregation.
    // (Original code mixes strategies; here we use current-stage source of truth.)
    const decidedRows = await ProcessingStage.aggregate([
      {
        $match: {
          partNo: normalizedPartNo
        }
      },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$qrId',
          latestReviewStatus: { $first: '$reviewStatus' }
        }
      },
      {
        $match: {
          latestReviewStatus: { $in: ['accepted', 'rejected', 'rework'] }
        }
      },
      {
        $group: {
          _id: '$latestReviewStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const counts = decidedRows.reduce(
      (acc, row) => {
        if (row._id === 'accepted') acc.accepted = row.count;
        if (row._id === 'rejected') acc.rejected = row.count;
        if (row._id === 'rework') acc.rework = row.count;
        return acc;
      },
      { accepted: 0, rejected: 0, rework: 0 }
    );

    const decided = counts.accepted + counts.rejected + counts.rework;
    return {
      partNo: normalizedPartNo,
      stageNumber: null,
      totalItems: qrcodesInStageTotal,
      accepted: counts.accepted,
      rejected: counts.rejected,
      rework: counts.rework,
      pending: Math.max(qrcodesInStageTotal - decided, 0)
    };
  }

  // Stage-specific counts: items currently in stageNum
  const stageDecidedRows = await ProcessingStage.aggregate([
    {
      $match: {
        partNo: normalizedPartNo,
        stageNumber: stageNum
      }
    },
    { $sort: { updatedAt: -1, createdAt: -1 } },
    {
      // For each qrId at this stage, pick the latest reviewStatus
      $group: {
        _id: '$qrId',
        latestReviewStatus: { $first: '$reviewStatus' }
      }
    },
    // Keep only items whose QRCode.currentStage is exactly this stage.
    // `QRCode` model name is 'QRCode', collection name is typically 'qrcodes'.
    {
      $lookup: {
        from: 'qrcodes',
        localField: '_id',
        foreignField: '_id',
        as: 'qr'
      }
    },
    { $unwind: '$qr' },
    {
      $match: {
        'qr.partNo': normalizedPartNo,
        'qr.currentStage': stageNum === 1 ? { $in: [0, 1] } : stageNum
      }
    },

    {
      $match: {
        latestReviewStatus: { $in: ['accepted', 'rejected', 'rework'] }
      }
    },
    {
      $group: {
        _id: '$latestReviewStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  const counts = stageDecidedRows.reduce(
    (acc, row) => {
      if (row._id === 'accepted') acc.accepted = row.count;
      if (row._id === 'rejected') acc.rejected = row.count;
      if (row._id === 'rework') acc.rework = row.count;
      return acc;
    },
    { accepted: 0, rejected: 0, rework: 0 }
  );

  const decided = counts.accepted + counts.rejected + counts.rework;
  const pending = Math.max(qrcodesInStageTotal - decided, 0);

  return {
    partNo: normalizedPartNo,
    stageNumber: stageNum,
    totalItems: qrcodesInStageTotal,
    accepted: counts.accepted,
    rejected: counts.rejected,
    rework: counts.rework,
    pending
  };
};


module.exports = {
  getManufacturingStatsByPartNo
};
