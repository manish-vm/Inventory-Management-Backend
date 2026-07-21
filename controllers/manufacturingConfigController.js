const ManufacturingConfig = require('../models/ManufacturingConfig');
const Product = require('../models/Product');
const { getInspectionClassification } = require('../utils/reportClassification');
const { scopedQuery, tenantFields } = require('../utils/tenantScope');

const getWorkflowType = (stages = []) => `${Math.max(stages.length, 1)}-step`;
const defaultStages = [
  {
    stageNumber: 1,
    stageName: 'Manufacturing',
    stageType: 'manufacturing',
    requiresValidation: false
  }
];

const productContextFromProduct = (product) => {
  const categoryName = product?.category?.name || '';
  const subcategoryName = product?.subcategory?.name || '';

  return {
    productName: product?.productName || product?.description || '',
    categoryName,
    subcategoryName,
    processName: [categoryName, subcategoryName].filter(Boolean).join(' - '),
    productionLine: getInspectionClassification({
      productName: subcategoryName || product?.productName,
      stageName: subcategoryName
    }).productionLine,
    reportType: getInspectionClassification({
      productName: categoryName,
      stageName: categoryName
    }).reportType
  };
};

const normalizeStages = (stages, productContext = {}) => {
  const sourceStages = Array.isArray(stages) && stages.length > 0 ? stages : defaultStages;
  const productName = productContext.productName || '';
  const processName = productContext.processName
    || [productContext.categoryName, productContext.subcategoryName].filter(Boolean).join(' - ');

  return sourceStages.map((stage, index) => {
    const stageName = String(stage.stageName || `Stage ${index + 1}`).trim();
    const classification = getInspectionClassification({
      ...stage,
      productionLine: productContext.productionLine || stage.productionLine,
      reportType: productContext.reportType || stage.reportType,
      productName,
      partDescription: productContext.categoryName,
      stageName,
      processName,
      partName: productName
    });
    return {
      stageNumber: index + 1,
      stageName,
      stageType: index === 0 ? 'manufacturing' : (stage.stageType || 'processing'),
      description: stage.description,
      requiresValidation: Boolean(stage.requiresValidation),
      ...classification,
      reviewForm: stage.reviewForm || { outcomes: [] }
    };
  });
};

const sendSaveError = (res, error) => {
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'field';
    return res.status(400).json({
      message: `Configuration already exists for this ${duplicateField}`
    });
  }

  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors || {})
      .map((item) => item.message)
      .join(', ');
    return res.status(400).json({ message: message || error.message });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${error.path || 'id'}` });
  }

  console.error('Manufacturing config save failed:', error);
  return res.status(500).json({ error: error.message });
};

exports.getAllManufacturingConfigs = async (req, res) => {
  try {
    const { search, workflowType } = req.query;
    let query = scopedQuery(req.user, {});

    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    if (workflowType) query.workflowType = workflowType;

    const configs = await ManufacturingConfig.find(query).sort({ updatedAt: -1 });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getManufacturingConfigById = async (req, res) => {
  try {
    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getManufacturingConfigByCode = async (req, res) => {
  try {
    const product = await Product.findOne(scopedQuery(req.user, { code: req.params.code, isDeleted: false }));
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { productName: product.productName || product.description }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createManufacturingConfig = async (req, res) => {
  try {
    const { productName, stages, finalStages } = req.body;

    if (!productName) {
      return res.status(400).json({ message: 'productName is required' });
    }

    const product = await Product.findOne(scopedQuery(req.user, { productName, isDeleted: false }))
      .populate('category', 'name')
      .populate('subcategory', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found for given productName' });
    }

    const existingConfig = await ManufacturingConfig.findOne(scopedQuery(req.user, { productName }));
    if (existingConfig) {
      return res.status(400).json({ message: 'Configuration already exists for this productName' });
    }

    const productContext = productContextFromProduct(product);
    const normalizedStages = normalizeStages(stages, productContext);
    const normalizedFinalStages = Array.isArray(finalStages)
      ? normalizeStages(finalStages, productContext)
      : [];

    const config = new ManufacturingConfig({
      productName: productName || product.productName || product.description,
      workflowType: getWorkflowType(normalizedStages),
      stages: normalizedStages,
      finalStages: normalizedFinalStages,
      ...tenantFields(req.user)
    });

    await config.save();
    res.status(201).json(config);
  } catch (error) {
    return sendSaveError(res, error);
  }
};

exports.updateManufacturingConfig = async (req, res) => {
  try {
    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    const { productName, workflowType, stages, finalStages, isActive } = req.body;
    let productContext = null;

    if (productName !== undefined && productName !== config.productName) {
      const product = await Product.findOne(scopedQuery(req.user, { productName, isDeleted: false }))
        .populate('category', 'name')
        .populate('subcategory', 'name');
      if (!product) {
        return res.status(404).json({ message: 'Product not found for given productName' });
      }
      productContext = productContextFromProduct(product);

      const existingConfig = await ManufacturingConfig.findOne({
        productName,
        ...scopedQuery(req.user, { _id: { $ne: config._id } })
      });
      if (existingConfig) {
        return res.status(400).json({ message: 'Configuration already exists for this productName' });
      }

      config.productName = productName;
    }

    if (stages) {
      if (!productContext) {
        const product = await Product.findOne(scopedQuery(req.user, { productName: productName || config.productName, isDeleted: false }))
          .populate('category', 'name')
          .populate('subcategory', 'name');
        productContext = product ? productContextFromProduct(product) : { productName: productName || config.productName };
      }
      const normalizedStages = normalizeStages(stages, productContext);
      config.stages = normalizedStages;
      config.workflowType = getWorkflowType(normalizedStages);
    } else if (workflowType) {
      config.workflowType = workflowType;
    }

    if (finalStages) {
      if (!productContext) {
        const product = await Product.findOne(scopedQuery(req.user, { productName: productName || config.productName, isDeleted: false }))
          .populate('category', 'name')
          .populate('subcategory', 'name');
        productContext = product ? productContextFromProduct(product) : { productName: productName || config.productName };
      }
      config.finalStages = normalizeStages(finalStages, productContext);
    }
    if (isActive !== undefined) config.isActive = isActive;

    await config.save();
    res.json(config);
  } catch (error) {
    return sendSaveError(res, error);
  }
};

exports.deleteManufacturingConfig = async (req, res) => {
  try {
    const config = await ManufacturingConfig.findOneAndDelete(scopedQuery(req.user, { _id: req.params.id }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }
    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: get review form definitions (per workflow stage)
// Payload shape is flexible because the UI can evolve.
exports.getReviewForms = async (req, res) => {
  try {
    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    res.json({
      productName: config.productName,
      workflowType: config.workflowType,
      stages: config.stages.map((s) => ({
        stageNumber: s.stageNumber,
        stageName: s.stageName,
        stageType: s.stageType,
        productionLine: s.productionLine || '',
        reportType: s.reportType || '',
        processKey: s.processKey || '',
        processName: s.processName || '',
        partKey: s.partKey || '',
        partName: s.partName || '',
        reviewForm: s.reviewForm || { outcomes: [] }
      })),
      finalStages: (config.finalStages || []).map((s) => ({
        stageNumber: s.stageNumber,
        stageName: s.stageName,
        stageType: s.stageType,
        productionLine: s.productionLine || '',
        reportType: s.reportType || '',
        processKey: s.processKey || '',
        processName: s.processName || '',
        partKey: s.partKey || '',
        partName: s.partName || '',
        reviewForm: s.reviewForm || { outcomes: [] }
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: save review form definitions (per workflow stage)
// Expected body: { stages: [{ stageNumber, reviewForm }] }
exports.saveReviewForms = async (req, res) => {
  try {
    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    const { stages, target = 'stages' } = req.body;
    if (!Array.isArray(stages)) {
      return res.status(400).json({ message: '`stages` array is required' });
    }

    const stageByNumber = new Map(stages.map((s) => [Number(s.stageNumber), s]));

    const stageCollection = target === 'finalStages' ? (config.finalStages || []) : config.stages;
    const updatedStages = stageCollection.map((existingStage) => {
      const incoming = stageByNumber.get(Number(existingStage.stageNumber));
      if (!incoming) return existingStage;

      return {
        ...existingStage.toObject(),
        reviewForm: incoming.reviewForm || { outcomes: [] }
      };
    });

    if (target === 'finalStages') {
      config.finalStages = updatedStages;
    } else {
      config.stages = updatedStages;
    }

    await config.save();

    res.json({ message: 'Review forms saved', config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


exports.validateStageSequence = async (req, res) => {
  try {
    const { qrId, stageNumber } = req.body;

    const QRCode = require('../models/QRCode');
    const qrCode = await QRCode.findOne(scopedQuery(req.user, { _id: qrId }));

    if (!qrCode) {
      return res.status(404).json({ message: 'QR Code not found' });
    }

    // QRCode -> Product (by code) -> ManufacturingConfig (by productName)
    const product = await Product.findOne(scopedQuery(req.user, { code: qrCode.code, isDeleted: false }));
    if (!product) {
      return res.status(404).json({ message: 'Product not found for QR code' });
    }

    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, {
      productName: product.productName || product.description
    }));

    if (!config) {
      return res.status(404).json({ message: 'Configuration not found' });
    }

    const expectedSequence = config.stages.map(s => s.stageNumber).sort((a, b) => a - b);
    const nextExpectedStage = Math.min(...expectedSequence.filter(s => s > qrCode.currentStage));

    if (stageNumber !== nextExpectedStage && nextExpectedStage !== undefined) {
      return res.status(400).json({
        valid: false,
        message: `Stage ${stageNumber} cannot be performed before stage ${nextExpectedStage}`
      });
    }

    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
