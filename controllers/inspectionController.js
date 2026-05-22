const InspectionFormResponse = require('../models/InspectionFormResponse');
const InspectionScanLog = require('../models/InspectionScanLog');
const QRCode = require('../models/QRCode');
const StageMovementLog = require('../models/StageMovementLog');
const {
  buildProductPayload,
  ensureProcessingStage,
  getStageByNumber,
  resolveProductContext
} = require('../services/inspectionService');

const todayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const getEmployeeName = (user) => user?.name || user?.username || user?.email || 'Employee';

const normalizeInspectionResult = (value) => String(value || '').trim().toUpperCase();
const normalizeMovementType = (value) => String(value || 'NONE').trim().toUpperCase();
const summarizeResponses = (responses = []) =>
  responses
    .filter((item) => item?.answer !== undefined && item?.answer !== null && item?.answer !== '')
    .map((item) => `${item.question || item.questionId}: ${Array.isArray(item.answer) ? item.answer.join(', ') : item.answer}`)
    .join('; ');
const stageLabel = (stageNumber, stage) => stage?.stageName || `Stage ${stageNumber}`;

const validateEmployeeStageAccess = ({ employee, currentStage, stages = [] }) => {
  if (employee?.role !== 'employee') {
    return {
      allowed: true,
      response: {
        status: 'success',
        action: 'OPEN_DETAILS_PAGE',
        message: `Access granted. Loading product details for stage ${stageLabel(currentStage?.stageNumber, currentStage)}.`
      }
    };
  }

  const assignedStage = Number(employee.manufacturingLevel || 1);
  const productStage = Number(currentStage?.stageNumber || 1);
  const assignedStageDefinition = stages.find((stage) => Number(stage.stageNumber) === assignedStage);
  const assignedStageName = stageLabel(assignedStage, assignedStageDefinition);
  const productStageName = stageLabel(productStage, currentStage);

  if (assignedStage === productStage) {
    return {
      allowed: true,
      response: {
        status: 'success',
        action: 'OPEN_DETAILS_PAGE',
        message: `Access granted. Loading product details for stage ${productStageName}.`
      }
    };
  }

  return {
    allowed: false,
    response: {
      status: 'error',
      action: 'SHOW_ALERT',
      message: `Access Denied. The product is still in ${productStageName} and cannot be processed at your current stage (${assignedStageName}).`
    }
  };
};

exports.scanQRCode = async (req, res) => {
  try {
    const { qrId } = req.body;
    if (!qrId) return res.status(400).json({ message: 'qrId is required' });

    const qrCode = await QRCode.findOne({ qrId });
    if (!qrCode) return res.status(404).json({ message: 'QR code not found' });

    const payload = await buildProductPayload(qrCode);
    const access = validateEmployeeStageAccess({ employee: req.user, currentStage: payload.currentStage, stages: payload.stages });

    if (!access.allowed) {
      return res.status(403).json(access.response);
    }

    await InspectionScanLog.create({
      qrCode: qrCode._id,
      qrId: qrCode.qrId,
      itemId: qrCode.qrId,
      employee: req.user._id,
      employeeName: getEmployeeName(req.user),
      productName: payload.productInfo.productName,
      partNo: qrCode.partNo,
      partDescription: payload.productInfo.partDescription,
      stageNumber: payload.currentStage.stageNumber,
      stageName: payload.currentStage.stageName,
      status: 'SCANNED',
      actionTaken: 'SCAN',
      location: payload.currentStage.stageName
    });

    res.json({
      ...access.response,
      ...payload
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductForEmployee = async (req, res) => {
  try {
    const { partNo } = req.params;
    const qrCode = await QRCode.findOne({
      $or: [
        { qrId: partNo },
        { partNo },
        { batchNo: partNo }
      ]
    }).sort({ updatedAt: -1 });

    if (!qrCode) return res.status(404).json({ message: 'Product item not found' });

    const payload = await buildProductPayload(qrCode);
    const access = validateEmployeeStageAccess({ employee: req.user, currentStage: payload.currentStage, stages: payload.stages });

    if (!access.allowed) {
      return res.status(403).json(access.response);
    }

    await InspectionScanLog.create({
      qrCode: qrCode._id,
      qrId: qrCode.qrId,
      employee: req.user._id,
      employeeName: getEmployeeName(req.user),
      productName: payload.productInfo.productName,
      partNo: qrCode.partNo,
      batchNo: qrCode.batchNo,
      itemId: qrCode.qrId,
      partDescription: payload.productInfo.partDescription,
      stageNumber: payload.currentStage.stageNumber,
      stageName: payload.currentStage.stageName,
      status: 'SCANNED',
      actionTaken: 'LOOKUP',
      location: payload.currentStage.stageName
    });

    res.json({
      ...access.response,
      product: {
        ...payload.productInfo,
        batchNo: qrCode.batchNo || '',
        itemId: qrCode.qrId,
        totalIdealItems: await QRCode.countDocuments({ partNo: qrCode.partNo }),
        createdDate: qrCode.createdAt,
        nextStage: payload.stages.find((stage) => Number(stage.stageNumber) === Number(payload.currentStage.stageNumber) + 1)?.stageName || 'Final Stage'
      },
      stage: payload.currentStage,
      stages: payload.stages,
      forms: payload.forms,
      itemState: payload.itemState,
      history: await InspectionFormResponse.find({ qrId: qrCode.qrId }).sort({ submittedAt: -1 }).limit(10),
      qrCode: payload.qrCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.submitInspection = async (req, res) => {
  try {
    const {
      qrId,
      inspectionResult: rawInspectionResult,
      movementType: rawMovementType = 'NONE',
      responses = [],
      remarks = '',
      formId,
      formName
    } = req.body;
    const inspectionResult = normalizeInspectionResult(rawInspectionResult);
    const movementType = normalizeMovementType(rawMovementType);

    if (!qrId) return res.status(400).json({ message: 'qrId is required' });
    if (!['ACCEPTED', 'REJECTED', 'REWORK'].includes(inspectionResult)) {
      return res.status(400).json({ message: 'Inspection result is required' });
    }
    if (!['NONE', 'FORWARD', 'BACKWARD'].includes(movementType)) {
      return res.status(400).json({ message: 'Invalid movement type' });
    }
    if (movementType === 'BACKWARD' && !String(remarks).trim()) {
      return res.status(400).json({ message: 'Remarks are required for backward movement' });
    }

    const qrCode = await QRCode.findOne({ qrId });
    if (!qrCode) return res.status(404).json({ message: 'QR code not found' });

    const { product, stages } = await resolveProductContext(qrCode.partNo);
    const currentStageNumber = qrCode.currentStage > 0 ? qrCode.currentStage : stages[0]?.stageNumber || 1;
    const currentStage = getStageByNumber(stages, currentStageNumber);
    const currentIndex = stages.findIndex((stage) => Number(stage.stageNumber) === Number(currentStage.stageNumber));
    const access = validateEmployeeStageAccess({ employee: req.user, currentStage, stages });

    if (!access.allowed) {
      return res.status(403).json(access.response);
    }

    let toStage = currentStage;
    let effectiveMovementType = movementType;

    if (inspectionResult === 'ACCEPTED' && movementType === 'NONE' && currentIndex < stages.length - 1) {
      effectiveMovementType = 'FORWARD';
    }

    if (effectiveMovementType === 'FORWARD') {
      if (currentIndex >= stages.length - 1) {
        return res.status(400).json({ message: 'Product is already at the final stage' });
      }
      toStage = stages[currentIndex + 1];
    }
    if (effectiveMovementType === 'BACKWARD') {
      if (currentIndex <= 0) {
        return res.status(400).json({ message: 'Product is already at the first stage' });
      }
      toStage = stages[currentIndex - 1];
    }

    const processingStage = await ensureProcessingStage({
      qrCode,
      stage: currentStage,
      operatorName: getEmployeeName(req.user)
    });

    processingStage.reviewStatus = inspectionResult.toLowerCase();
    const responseSummary = summarizeResponses(responses);
    const itemRemarks = String(remarks || '').trim();

    processingStage.reviewAnswers = responses.reduce((acc, item) => {
      acc[item.questionId || item.question] = item.answer;
      return acc;
    }, {});
    processingStage.rejectionReason = ['REJECTED', 'REWORK'].includes(inspectionResult) ? itemRemarks || responseSummary : '';
    processingStage.validatedBy = getEmployeeName(req.user);
    processingStage.operator = getEmployeeName(req.user);
    processingStage.status = inspectionResult === 'ACCEPTED' ? 'validated' : 'completed';
    await processingStage.save();

    if (effectiveMovementType === 'FORWARD' || effectiveMovementType === 'BACKWARD') {
      await StageMovementLog.create({
        qrCode: qrCode._id,
        qrId: qrCode.qrId,
        itemId: qrCode.qrId,
        partNo: qrCode.partNo,
        batchNo: qrCode.batchNo || '',
        productName: product?.productName || qrCode.partNo,
        employee: req.user._id,
        employeeName: getEmployeeName(req.user),
        fromStageNumber: currentStage.stageNumber,
        fromStageName: currentStage.stageName,
        toStageNumber: toStage.stageNumber,
        toStageName: toStage.stageName,
        movementType: effectiveMovementType,
        remarks: itemRemarks
      });

      qrCode.currentStage = toStage.stageNumber;
      qrCode.status = 'processing';

      if (effectiveMovementType === 'FORWARD') {
        await ensureProcessingStage({
          qrCode,
          stage: toStage,
          operatorName: getEmployeeName(req.user)
        });
      }
    }

    if (inspectionResult === 'ACCEPTED' && currentIndex >= stages.length - 1) {
      qrCode.status = 'completed';
    } else if (effectiveMovementType === 'FORWARD') {
      qrCode.status = 'processing';
    } else {
      qrCode.status = inspectionResult.toLowerCase();
    }
    await qrCode.save();

    const responseDoc = await InspectionFormResponse.create({
      qrCode: qrCode._id,
      qrId: qrCode.qrId,
      itemId: qrCode.qrId,
      employee: req.user._id,
      employeeName: getEmployeeName(req.user),
      productName: product?.productName || qrCode.partNo,
      partNo: qrCode.partNo,
      batchNo: qrCode.batchNo || '',
      partDescription: product?.description || product?.productName || '',
      stageNumber: currentStage.stageNumber,
      stageName: currentStage.stageName,
      formId: formId || `stage-${currentStage.stageNumber}`,
      formName: formName || `${currentStage.stageName} Inspection`,
      inspectionResult,
      responses,
      remarks: itemRemarks,
      movement: {
        type: effectiveMovementType,
        fromStageNumber: currentStage.stageNumber,
        fromStageName: currentStage.stageName,
        toStageNumber: toStage.stageNumber,
        toStageName: toStage.stageName
      }
    });

    await InspectionScanLog.create({
      qrCode: qrCode._id,
      qrId: qrCode.qrId,
      itemId: qrCode.qrId,
      employee: req.user._id,
      employeeName: getEmployeeName(req.user),
      productName: product?.productName || qrCode.partNo,
      partNo: qrCode.partNo,
      partDescription: product?.description || product?.productName || '',
      stageNumber: currentStage.stageNumber,
      stageName: currentStage.stageName,
      status: inspectionResult,
      actionTaken: effectiveMovementType === 'NONE' ? inspectionResult : `${inspectionResult}_${effectiveMovementType}`,
      remarks: itemRemarks,
      location: toStage.stageName
    });

    res.status(201).json({ message: 'Inspection submitted', response: responseDoc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.submitEmployeeInspectionResponse = async (req, res) => {
  req.body = {
    qrId: req.body.itemId || req.body.qrId,
    inspectionResult: req.body.selectedStatus,
    movementType: req.body.movementType || 'NONE',
    remarks: req.body.remarks || '',
    responses: req.body.formResponses || [],
    formId: req.body.formId,
    formName: req.body.formName
  };
  return exports.submitInspection(req, res);
};

exports.getProductHistoryByItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const qrCode = await QRCode.findOne({ $or: [{ qrId: itemId }, { partNo: itemId }, { batchNo: itemId }] });
    if (!qrCode) return res.status(404).json({ message: 'Product item not found' });
    req.params.id = qrCode.qrId;
    return exports.getTraceability(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const { start, end } = todayRange();
    const employee = req.user._id;

    const [scans, responses, movements, recentActivity] = await Promise.all([
      InspectionScanLog.countDocuments({ employee, createdAt: { $gte: start, $lt: end } }),
      InspectionFormResponse.find({ employee, submittedAt: { $gte: start, $lt: end } }),
      StageMovementLog.find({ employee, movedAt: { $gte: start, $lt: end } }),
      InspectionScanLog.find({ employee }).sort({ createdAt: -1 }).limit(10)
    ]);

    res.json({
      today: {
        totalScans: scans,
        accepted: responses.filter((item) => item.inspectionResult === 'ACCEPTED').length,
        rejected: responses.filter((item) => item.inspectionResult === 'REJECTED').length,
        rework: responses.filter((item) => item.inspectionResult === 'REWORK').length,
        productsProcessedToday: responses.length,
        pendingReviews: Math.max(scans - responses.length, 0),
        forwardedToNextStage: movements.filter((item) => item.movementType === 'FORWARD').length,
        sentBackToPreviousStage: movements.filter((item) => item.movementType === 'BACKWARD').length
      },
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getScanLogs = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const match = search
      ? {
          $or: [
            { partNo: { $regex: search, $options: 'i' } },
            { productName: { $regex: search, $options: 'i' } },
            { partDescription: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    const grouped = await InspectionScanLog.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: '$partNo',
          partNo: { $first: '$partNo' },
          partDescription: { $first: '$partDescription' },
          currentStage: { $first: '$stageName' },
          lastAction: { $first: '$actionTaken' },
          lastUpdated: { $first: '$updatedAt' }
        }
      },
      { $sort: { lastUpdated: -1 } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) }
    ]);

    const rows = await Promise.all(grouped.map(async (row) => {
      const [totalIdealProductCount, acceptedCount, rejectedCount, reworkCount] = await Promise.all([
        QRCode.countDocuments({ partNo: row.partNo }),
        InspectionFormResponse.countDocuments({ partNo: row.partNo, inspectionResult: 'ACCEPTED' }),
        InspectionFormResponse.countDocuments({ partNo: row.partNo, inspectionResult: 'REJECTED' }),
        InspectionFormResponse.countDocuments({ partNo: row.partNo, inspectionResult: 'REWORK' })
      ]);
      return {
        ...row,
        totalIdealProductCount,
        acceptedCount,
        rejectedCount,
        reworkCount,
        pendingCount: Math.max(totalIdealProductCount - acceptedCount - rejectedCount - reworkCount, 0)
      };
    }));

    res.json({ rows, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTraceability = async (req, res) => {
  try {
    const id = req.params.id;
    const qrCode = await QRCode.findOne({ $or: [{ _id: id.match(/^[a-f\d]{24}$/i) ? id : undefined }, { qrId: id }, { partNo: id }] });
    const partNo = qrCode?.partNo || id;

    const [productContext, scanLogs, responses, movements, qrCodes] = await Promise.all([
      resolveProductContext(partNo),
      InspectionScanLog.find({ partNo }).sort({ createdAt: 1 }),
      InspectionFormResponse.find({ partNo }).sort({ submittedAt: 1 }),
      StageMovementLog.find({ partNo }).sort({ movedAt: 1 }),
      QRCode.find({ partNo }).sort({ createdAt: 1 })
    ]);

    res.json({
      product: productContext.product,
      stages: productContext.stages,
      qrCodes,
      scanLogs,
      responses,
      movements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAdminResponses = async (req, res) => {
  try {
    const { search = '', result = '', stage = '' } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { partNo: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } }
      ];
    }
    if (result) query.inspectionResult = result;
    if (stage) query.stageNumber = Number(stage);

    const responses = await InspectionFormResponse.find(query).sort({ submittedAt: -1 }).limit(200).lean();
    const enrichedResponses = await Promise.all(responses.map(async (response) => {
      const qrCode = response.qrCode
        ? await QRCode.findById(response.qrCode).lean()
        : await QRCode.findOne({ qrId: response.qrId }).lean();

      if (!qrCode) {
        return {
          ...response,
          currentStageNumber: response.stageNumber,
          currentStageName: response.stageName
        };
      }

      const { stages } = await resolveProductContext(qrCode.partNo);
      const finalStageNumber = Number(stages[stages.length - 1]?.stageNumber || 1);
      const currentStageNumber = Number(qrCode.currentStage || stages[0]?.stageNumber || 1);
      const currentStage = getStageByNumber(stages, currentStageNumber);
      const isCompleted = qrCode.status === 'completed' || (qrCode.status === 'accepted' && currentStageNumber >= finalStageNumber);

      return {
        ...response,
        currentStageNumber,
        currentStageName: isCompleted ? 'Completed' : stageLabel(currentStageNumber, currentStage),
        itemStatus: qrCode.status || 'generated'
      };
    }));
    const totalResponses = await InspectionFormResponse.countDocuments(query);
    const analyticsRows = await InspectionFormResponse.aggregate([
      { $match: query },
      { $group: { _id: '$inspectionResult', count: { $sum: 1 } } }
    ]);

    const analytics = {
      totalResponses,
      acceptedResponses: 0,
      rejectedResponses: 0,
      reworkResponses: 0
    };
    analyticsRows.forEach((row) => {
      if (row._id === 'ACCEPTED') analytics.acceptedResponses = row.count;
      if (row._id === 'REJECTED') analytics.rejectedResponses = row.count;
      if (row._id === 'REWORK') analytics.reworkResponses = row.count;
    });

    res.json({ responses: enrichedResponses, analytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getResponseById = async (req, res) => {
  try {
    const response = await InspectionFormResponse.findById(req.params.id);
    if (!response) return res.status(404).json({ message: 'Response not found' });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
