const ProcessingStage = require('../models/ProcessingStage');
const QRCode = require('../models/QRCode');

exports.getAllProcessingStages = async (req, res) => {
  try {
    const { search, partNo, stageNumber, status } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { stageName: { $regex: search, $options: 'i' } }
      ];
    }

    if (partNo) query.partNo = partNo;
    if (stageNumber) query.stageNumber = parseInt(stageNumber);
    if (status) query.status = status;

    const stages = await ProcessingStage.find(query)
      .populate('qrId', 'qrId partNo')
      .sort({ createdAt: -1 });
    
    res.json(stages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProcessingStageById = async (req, res) => {
  try {
    const stage = await ProcessingStage.findById(req.params.id)
      .populate('qrId', 'qrId partNo');
    
    if (!stage) {
      return res.status(404).json({ message: 'Processing stage not found' });
    }
    res.json(stage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createProcessingStage = async (req, res) => {
  try {
    const { qrId, partNo, stageNumber, stageName, inputQuantity, operator } = req.body;

    const existingStage = await ProcessingStage.findOne({ qrId, stageNumber });
    if (existingStage) {
      return res.status(400).json({ message: 'Processing stage already exists for this QR code' });
    }

    const stage = new ProcessingStage({
      qrId,
      partNo,
      stageNumber,
      stageName,
      inputQuantity,
      operator,
      status: 'pending'
    });

    await stage.save();

    await QRCode.findByIdAndUpdate(qrId, {
      status: 'processing'
    });

    const populated = await ProcessingStage.findById(stage._id).populate('qrId', 'qrId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProcessingStage = async (req, res) => {
  try {
    const stage = await ProcessingStage.findById(req.params.id);
    if (!stage) {
      return res.status(404).json({ message: 'Processing stage not found' });
    }

    const { outputQuantity, operator, validated, validatedBy, validationRemarks, status } = req.body;

    if (outputQuantity !== undefined) stage.outputQuantity = outputQuantity;
    if (operator !== undefined) stage.operator = operator;
    if (validated !== undefined) stage.validated = validated;
    if (validatedBy !== undefined) stage.validatedBy = validatedBy;
    if (validationRemarks !== undefined) stage.validationRemarks = validationRemarks;
    if (status) stage.status = status;

    if (stage.outputQuantity > 0 && !stage.processedAt) {
      stage.processedAt = new Date();
    }

    await stage.save();
    res.json(stage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.completeProcessingStage = async (req, res) => {
  try {
    const stage = await ProcessingStage.findById(req.params.id);
    if (!stage) {
      return res.status(404).json({ message: 'Processing stage not found' });
    }

    stage.status = 'completed';
    stage.processedAt = new Date();

    await stage.save();

    await QRCode.findByIdAndUpdate(stage.qrId, {
      status: 'completed',
      currentStage: stage.stageNumber
    });

    res.json(stage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.validateProcessingStage = async (req, res) => {
  try {
    const stage = await ProcessingStage.findById(req.params.id);
    if (!stage) {
      return res.status(404).json({ message: 'Processing stage not found' });
    }

    const { validated, validatedBy, remarks } = req.body;

    stage.validated = validated;
    stage.validatedBy = validatedBy;
    stage.validationRemarks = remarks;

    if (validated) {
      stage.status = 'validated';
    }

    await stage.save();
    res.json(stage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStageStats = async (req, res) => {
  try {
    const stats = await ProcessingStage.aggregate([
      {
        $group: {
          _id: '$stageNumber',
          totalInput: { $sum: '$inputQuantity' },
          totalOutput: { $sum: '$outputQuantity' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};