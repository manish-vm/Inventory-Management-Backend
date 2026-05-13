const QRCode = require('../models/QRCode');
const Product = require('../models/Product');

exports.getAllQRCodes = async (req, res) => {
  try {
    const { search, status, partNo } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { qrId: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) query.status = status;
    if (partNo) query.partNo = partNo;

    const qrCodes = await QRCode.find(query)
      .sort({ createdAt: -1 });
    
    res.json(qrCodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQRCodeById = async (req, res) => {
  try {
    const qrCode = await QRCode.findById(req.params.id);
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }
    res.json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQRCodeByQRId = async (req, res) => {
  try {
    const qrCode = await QRCode.findOne({ qrId: req.params.qrId });
    
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }
    res.json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createQRCode = async (req, res) => {
  try {
    const { productName, barcodeNo, quantity } = req.body;

    if (!productName) {
      return res.status(400).json({ message: 'productName is required' });
    }

    const product = await Product.findOne({ productName, isDeleted: false });
    if (!product) {
      return res.status(404).json({ message: 'Product not found for given Product Name' });
    }

    // QRCode schema stores this value in `partNo` field; we repurpose it to store barcode (productCode)
    const qrCode = new QRCode({
      partNo: product.productCode || barcodeNo || productName,
      batchNo: barcodeNo, // keep batchNo field as the barcode value
      quantity: quantity || 0
    });

    await qrCode.save();

    const populated = await QRCode.findById(qrCode._id).populate('partNo', 'productName productCode');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.bulkCreateQRCodes = async (req, res) => {
  try {
    const { productName, barcodeNo, quantity, count } = req.body;

    if (!productName) {
      return res.status(400).json({ message: 'productName is required' });
    }

    const product = await Product.findOne({ productName, isDeleted: false });
    if (!product) {
      return res.status(404).json({ message: 'Product not found for given Product Name' });
    }

    const resolvedBarcode = product.productCode || barcodeNo;

    const qrCodes = [];
    for (let i = 0; i < count; i++) {
      const qrCode = new QRCode({
        partNo: resolvedBarcode || productName,
        batchNo: resolvedBarcode ? `${resolvedBarcode}-${i + 1}` : `${barcodeNo}-${i + 1}`,
        quantity: quantity || 0
      });
      qrCodes.push(qrCode);
    }

    await QRCode.insertMany(qrCodes);
    res.status(201).json({ count: qrCodes.length, message: 'QR Codes generated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateQRCode = async (req, res) => {
  try {
    const qrCode = await QRCode.findById(req.params.id);
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }

    const { quantity, status, stagesCompleted } = req.body;

    if (quantity !== undefined) qrCode.quantity = quantity;
    if (status) qrCode.status = status;
    if (stagesCompleted) qrCode.stagesCompleted = stagesCompleted;

    await qrCode.save();
    res.json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateQRCodeProgress = async (req, res) => {
  try {
    const qrCode = await QRCode.findById(req.params.id);
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }

    const { stageNumber, stageType, quantity, operator } = req.body;

    qrCode.stagesCompleted.push({
      stageNumber,
      // qrCode.stagesCompleted.stageType enum only allows manufacturing/processing/assembly
      // Convert incoming `stageType` (which may be QR status-style enums) to this set.
      stageType:
        stageType === 'in_production' || stageType === 'completed' || stageType === 'void'
          ? 'manufacturing'
          : stageType === 'used_in_assembly'
            ? 'assembly'
            : stageType === 'processing'
              ? 'processing'
              : stageType,
      completedAt: new Date(),
      quantity: quantity || 0,
      operator: operator || 'System',
      validated: false
    });

    qrCode.currentStage = stageNumber;

    // Map UI/operator `stageType` values to QR status enum values.
    // QRCode.status enum: generated, in_production, processing, completed, used_in_assembly, void
    qrCode.status = stageType;
    if (['manufacturing', 'processing', 'assembly'].includes(stageType)) {
      qrCode.status = stageType === 'assembly'
        ? 'used_in_assembly'
        : stageType === 'processing'
          ? 'processing'
          : 'in_production';
    }

    // If caller sends completed explicitly, set completed.
    if (stageType === 'completed') qrCode.status = 'completed';
    if (stageType === 'void') qrCode.status = 'void';

    await qrCode.save();

    res.json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteQRCode = async (req, res) => {
  try {
    const qrCode = await QRCode.findByIdAndDelete(req.params.id);
    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }
    res.json({ message: 'QR Code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQRCodeStats = async (req, res) => {
  try {
    const stats = await QRCode.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      generated: 0,
      in_production: 0,
      processing: 0,
      completed: 0,
      used_in_assembly: 0,
      void: 0
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};