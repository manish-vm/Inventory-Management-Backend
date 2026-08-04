const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Invoice = require('../models/Invoice');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const BrandModel = require('../models/BrandModel');
const { syncStageOneInputQuantity } = require('../utils/processingStageInventory');
const QRCode = require('../models/QRCode');
const DefectDetail = require('../models/DefectDetail');
const ManufacturingConfig = require('../models/ManufacturingConfig');
const StageReviewConfig = require('../models/StageReviewConfig');
const StageReviewSubmission = require('../models/StageReviewSubmission');
const InspectionFormResponse = require('../models/InspectionFormResponse');
const InspectionScanLog = require('../models/InspectionScanLog');
const InspectorVerification = require('../models/InspectorVerification');
const ProductionLog = require('../models/ProductionLog');
const ProcessingStage = require('../models/ProcessingStage');
const ProductStage = require('../models/ProductStage');
const StageMovementLog = require('../models/StageMovementLog');
const ProductItem = require('../models/ProductItem');
const Assembly = require('../models/Assembly');
const User = require('../models/User');
const {
  scopedQuery,
  tenantFields,
  inferredProductQuery,
  inferredInvoiceQuery
} = require('../utils/tenantScope');

// @desc    Get all products (with optional search/filter)
// @route   GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const { search, category, subcategory, lowStock } = req.query;
    let query = await inferredProductQuery(req.user, { isDeleted: false }, { User, Invoice }); // Only show non-deleted products

    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.category = category;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (lowStock === 'true') {
      query.$expr = { $lte: ['$stockQuantity', '$minStockLevel'] };
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .sort({ updatedAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne(await inferredProductQuery(req.user, { _id: req.params.id, isDeleted: false }, { User, Invoice }))
      .populate('category', 'name')
      .populate('subcategory', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get product by barcode/code
// @route   GET /api/products/code/:code
exports.getProductByCode = async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    const product = await Product.findOne(await inferredProductQuery(req.user, { code, isDeleted: false }, { User, Invoice }))
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper: resolve brand/model IDs to strings
const resolveBrandModelStrings = async ({ brandId, modelId, brandName, model, user }) => {
  // If IDs provided, prefer them
  if (brandId && modelId) {
    const brand = await Brand.findOne(scopedQuery(user, { _id: brandId }));
    const m = await BrandModel.findOne(scopedQuery(user, { _id: modelId }));

    if (!brand) throw new Error('Brand not found');
    if (!m) throw new Error('Model not found');
    if (m.brandId?.toString() !== brand._id.toString()) {
      throw new Error('Model does not belong to the selected brand');
    }

    return {
      brandName: brand.name,
      model: m.name
    };
  }

  // Backward compatibility: allow strings if IDs not provided
  return {
    brandName: brandName ?? null,
    model: model ?? null
  };
};

const splitList = (value) =>
  Array.from(new Map(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => [item.toLowerCase(), item])).values());

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const stableKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'item';
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const productNameQuery = (value) => ({
  productName: { $regex: `^${escapeRegex(String(value || '').trim())}$`, $options: 'i' },
  isDeleted: false
});

const generateCode = async () => {
  let code = '';
  let exists = true;
  while (exists) {
    code = `PRT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    exists = await Product.exists({ code });
  }
  return code;
};

const ensureBrandAndModel = async ({ brandName, model, user }) => {
  const brandNames = splitList(brandName);
  const modelNames = splitList(model);
  const cleanBrand = brandNames[0];
  const cleanModel = modelNames[0];

  if (!cleanBrand) return { brandName: brandName || null, model: model || null };

  const brands = [];
  for (const name of brandNames) {
    const brand = await Brand.findOneAndUpdate(
      scopedQuery(user, { name }),
      { $setOnInsert: { name, isActive: true, ...tenantFields(user) } },
      { new: true, upsert: true }
    );
    brands.push(brand);
  }

  if (modelNames.length) {
    for (const [index, modelName] of modelNames.entries()) {
      const brand = brands[index] || brands[0];
      await BrandModel.findOneAndUpdate(
        scopedQuery(user, { brandId: brand._id, name: modelName }),
        { $setOnInsert: { brandId: brand._id, name: modelName, isActive: true, ...tenantFields(user) } },
        { new: true, upsert: true }
      );
    }
  }

  return {
    brandName: brandNames.join(', '),
    model: modelNames.join(', ') || null
  };
};

const ensureDefects = async (type, names, user) => {
  for (const name of splitList(names)) {
    const cleanName = String(name || '').trim();
    await DefectDetail.findOneAndUpdate(
      scopedQuery(user, { type, name: cleanName }),
      { $setOnInsert: { type, name: cleanName, isActive: true, ...tenantFields(user) } },
      { new: true, upsert: true }
    ).collation({ locale: 'en', strength: 2 });
  }
};

const makeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const ensureCategoryAndSubcategory = async ({ categoryName, subcategoryName, user }) => {
  const cleanCategory = String(categoryName || '').trim();
  const cleanSubcategory = String(subcategoryName || '').trim();

  if (!cleanCategory) return { category: undefined, subcategory: undefined };

  const category = await Category.findOneAndUpdate(
    scopedQuery(user, { name: cleanCategory }),
    { $setOnInsert: { name: cleanCategory, slug: makeSlug(cleanCategory), isActive: true, ...tenantFields(user) } },
    { new: true, upsert: true }
  );

  if (!cleanSubcategory) return { category: category._id, subcategory: undefined };

  const subcategory = await Subcategory.findOneAndUpdate(
    scopedQuery(user, { name: cleanSubcategory, category: category._id }),
    { $setOnInsert: { name: cleanSubcategory, slug: makeSlug(`${category._id}-${cleanSubcategory}`), category: category._id, isActive: true, ...tenantFields(user) } },
    { new: true, upsert: true }
  );

  return { category: category._id, subcategory: subcategory._id };
};

const validateCategorySelection = async ({ category, subcategory, user }) => {
  if (category) {
    const categoryExists = await Category.exists(scopedQuery(user, { _id: category }));
    if (!categoryExists) throw new Error('Category not found');
  }

  if (subcategory) {
    const subcategoryExists = await Subcategory.exists(scopedQuery(user, {
      _id: subcategory,
      ...(category ? { category } : {})
    }));
    if (!subcategoryExists) throw new Error('Subcategory not found');
  }
};

const toBoolean = (value) =>
  ['true', 'yes', '1', 'y', 'with qr', 'withqr'].includes(String(value ?? '').trim().toLowerCase());

const responseTypeFromOptionType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['multichoice', 'multi choice', 'multiplechoice', 'multiple choice', 'checkbox'].includes(normalized)) return 'checkbox';
  if (['dropdown', 'select'].includes(normalized)) return 'dropdown';
  if (['radio', 'singlechoice', 'single choice'].includes(normalized)) return 'radio';
  return 'text';
};

const buildReviewQuestions = ({ type, questionText, optionType, options }) => {
  const optionLabels = splitList(options);
  const cleanQuestionText = String(questionText || '').trim();
  if (!cleanQuestionText && !optionType && !optionLabels.length) return [];
  const questionKey = stableKey(`${type}-${cleanQuestionText || optionLabels.join('-') || optionType}`);

  return [{
    questionId: `${type}-${questionKey}`,
    questionText: cleanQuestionText || `${type === 'rejection' ? 'Rejected' : 'Rework'} option`,
    responseType: responseTypeFromOptionType(optionType),
    required: optionLabels.length > 0,
    options: optionLabels.map((label, index) => ({
      optionId: `${type}-${questionKey}-option-${stableKey(label) || index + 1}`,
      label,
      value: label,
      subQuestions: []
    }))
  }];
};

const stageNameFromNumber = (stageNumber) => `Stage ${stageNumber}`;

const acceptedRouteForStage = (stage, stageNumbers) => {
  const rawValue = String(stage.accepted || '').trim();
  const explicitNumber = Number(rawValue);
  if (Number.isFinite(explicitNumber) && stageNumbers.includes(explicitNumber)) return String(explicitNumber);

  const stageNameMatch = rawValue.match(/stage\s*(\d+)/i);
  if (stageNameMatch) {
    const stageNumber = Number(stageNameMatch[1]);
    if (stageNumbers.includes(stageNumber)) return String(stageNumber);
  }

  const nextStage = stageNumbers.find((stageNumber) => stageNumber > stage.stageNumber);
  return nextStage ? String(nextStage) : '';
};

const syncWorkflowTemplate = async ({ product, productName, code, workflowStages = [], finalStages = [], user = null }) => {
  const normalizedStages = (workflowStages || [])
    .map((stage, index) => ({
      stageNumber: Number(stage.stageNumber || index + 1),
      stageName: String(stage.stageName || '').trim() || `Stage ${stage.stageNumber || index + 1}`,
      enabled: stage.enabled,
      accepted: stage.accepted,
      rejectionQuestion: stage.rejectionQuestion,
      rejectionOptionType: stage.rejectionOptionType,
      rejectionOptions: stage.rejectionOptions,
      reworkQuestion: stage.reworkQuestion,
      reworkOptionType: stage.reworkOptionType,
      reworkOptions: stage.reworkOptions
    }))
    .filter((stage) => {
      const hasContent = [stage.accepted, stage.rejectionQuestion, stage.rejectionOptions, stage.reworkQuestion, stage.reworkOptions]
        .some((v) => String(v || '').trim());
      const enabledValue = String(stage.enabled ?? '').trim().toLowerCase();
      return stage.stageNumber && (hasContent || !['no', 'false', '0', 'n'].includes(enabledValue));
    });

  const normalizedFinalStages = (finalStages || [])
    .map((stage, index) => ({
      stageNumber: Number(stage.stageNumber || index + 1),
      stageName: String(stage.stageName || '').trim() || `Final Stage ${index + 1}`,
      okCount: stage.okCount,
      notOkQuestion: stage.notOkQuestion,
      notOkOptionType: stage.notOkOptionType,
      notOkOptions: stage.notOkOptions
    }))
    .filter((stage) =>
      [stage.stageName, stage.okCount, stage.notOkQuestion, stage.notOkOptions]
        .some((v) => String(v || '').trim())
    );

  if (!normalizedStages.length && !normalizedFinalStages.length) return null;

  const stageNumbers = normalizedStages.map((stage) => stage.stageNumber).sort((a, b) => a - b);
  let manufacturingStages = normalizedStages.map((stage, index) => {
    const rejectionQuestions = buildReviewQuestions({
      type: 'rejection',
      questionText: stage.rejectionQuestion,
      optionType: stage.rejectionOptionType,
      options: stage.rejectionOptions
    });
    const reworkQuestions = buildReviewQuestions({
      type: 'rework',
      questionText: stage.reworkQuestion,
      optionType: stage.reworkOptionType,
      options: stage.reworkOptions
    });

    return {
      stageNumber: stage.stageNumber,
      stageName: stage.stageName || stageNameFromNumber(stage.stageNumber),
      stageType: index === 0 ? 'manufacturing' : 'processing',
      requiresValidation: false,
      reviewForm: {
        questions: [],
        rejectionForm: {
          formId: `stage-${stage.stageNumber}-rejection-admin`,
          formName: `${stage.stageName || stageNameFromNumber(stage.stageNumber)} Rejection Analysis Form`,
          questions: rejectionQuestions
        },
        reworkForm: {
          formId: `stage-${stage.stageNumber}-rework-admin`,
          formName: `${stage.stageName || stageNameFromNumber(stage.stageNumber)} Rework Analysis Form`,
          questions: reworkQuestions
        },
        outcomes: [
          { status: 'accepted', routeStage: acceptedRouteForStage(stage, stageNumbers) },
          { status: 'rejected', optionType: stage.rejectionOptionType || '', options: splitList(stage.rejectionOptions) },
          { status: 'rework', optionType: stage.reworkOptionType || '', options: splitList(stage.reworkOptions) }
        ]
      }
    };
  });

  // Ensure there is at least one regular stage if only finalStages were provided
  if (!manufacturingStages.length) {
    manufacturingStages = [{
      stageNumber: 1,
      stageName: 'Manufacturing',
      stageType: 'manufacturing',
      requiresValidation: false,
      reviewForm: {
        questions: [],
        outcomes: [{ status: 'accepted', routeStage: '' }]
      }
    }];
  }

  // Build final stage config objects (OK is actual count, Not OK has questionnaire)
  const lastRegularStageNum = stageNumbers.length ? stageNumbers[stageNumbers.length - 1] : 1;
  const builtFinalStages = normalizedFinalStages.map((stage, index) => {
    const notOkQuestions = buildReviewQuestions({
      type: 'rejection',
      questionText: stage.notOkQuestion,
      optionType: stage.notOkOptionType,
      options: stage.notOkOptions
    });
    const assignedStageNumber = lastRegularStageNum + index + 1;
    return {
      stageNumber: assignedStageNumber,
      stageName: stage.stageName || `Final Stage ${index + 1}`,
      stageType: 'processing',
      requiresValidation: false,
      reviewForm: {
        questions: [],
        okForm: {
          formId: `final-stage-${assignedStageNumber}-ok-admin`,
          formName: `${stage.stageName || `Final Stage ${index + 1}`} OK Analysis Form`,
          questions: []
        },
        rejectionForm: {
          formId: `final-stage-${assignedStageNumber}-notok-admin`,
          formName: `${stage.stageName || `Final Stage ${index + 1}`} Not OK Analysis Form`,
          questions: notOkQuestions
        },
        outcomes: [
          { status: 'accepted' },
          { status: 'rejected', optionType: stage.notOkOptionType || '', options: splitList(stage.notOkOptions) }
        ]
      }
    };
  });

  const existingConfig = await ManufacturingConfig.findOne(scopedQuery(user, {
    productName: { $regex: `^${escapeRegex(productName)}$`, $options: 'i' }
  }));
  const workflowType = `${manufacturingStages.length}-step`;
  let workflowCreated = false;
  let configDoc;

  if (existingConfig) {
    existingConfig.productName = productName;
    existingConfig.workflowType = workflowType;
    existingConfig.stages = manufacturingStages;
    if (builtFinalStages.length) existingConfig.finalStages = builtFinalStages;
    existingConfig.isActive = true;
    if (user?.dealerId) existingConfig.dealerId = user.dealerId;
    configDoc = await existingConfig.save();
  } else {
    workflowCreated = true;
    configDoc = await ManufacturingConfig.create({
      productName,
      workflowType,
      stages: manufacturingStages,
      finalStages: builtFinalStages,
      isActive: true,
      ...tenantFields(user)
    });
  }

  for (const stage of normalizedStages) {
    const rejectionQuestions = buildReviewQuestions({
      type: 'rejection',
      questionText: stage.rejectionQuestion,
      optionType: stage.rejectionOptionType,
      options: stage.rejectionOptions
    });
    const reworkQuestions = buildReviewQuestions({
      type: 'rework',
      questionText: stage.reworkQuestion,
      optionType: stage.reworkOptionType,
      options: stage.reworkOptions
    });

    const updateData = {
      productId: product?._id || null,
      configId: configDoc._id,
      stageNumber: stage.stageNumber,
      stageName: stage.stageName || stageNameFromNumber(stage.stageNumber),
      configurationMode: 'stages',
      acceptedRouteStage: acceptedRouteForStage(stage, stageNumbers),
      reworkRouteStage: '',
      rejectionQuestionnaireEnabled: rejectionQuestions.length > 0,
      rejectionQuestions,
      reworkQuestionnaireEnabled: reworkQuestions.length > 0,
      reworkQuestions
    };

    // Use the manufacturing config id in stageId so identical stage names on
    // different products never resolve to the same questionnaire.
    await StageReviewConfig.findOneAndUpdate(
      scopedQuery(user, { productId: product?._id || null, stageId: `${configDoc._id}-stages-${stage.stageNumber}` }),
      { stageId: `${configDoc._id}-stages-${stage.stageNumber}`, ...updateData, ...tenantFields(user) },
      { new: true, upsert: true }
    );

    await ensureDefects('reject', stage.rejectionOptions, user);
    await ensureDefects('rework', stage.reworkOptions, user);
  }

  // Sync StageReviewConfig for each final stage (Not OK = rejection questionnaire)
  for (const [index, stage] of normalizedFinalStages.entries()) {
    const assignedStageNumber = lastRegularStageNum + index + 1;
    const notOkQuestions = buildReviewQuestions({
      type: 'rejection',
      questionText: stage.notOkQuestion,
      optionType: stage.notOkOptionType,
      options: stage.notOkOptions
    });

    const updateData = {
      productId: product?._id || null,
      configId: configDoc._id,
      stageNumber: assignedStageNumber,
      stageName: stage.stageName || `Final Stage ${index + 1}`,
      configurationMode: 'finalStages',
      rejectionQuestionnaireEnabled: notOkQuestions.length > 0,
      rejectionQuestions: notOkQuestions,
      reworkQuestionnaireEnabled: false,
      reworkQuestions: []
    };

    await StageReviewConfig.findOneAndUpdate(
      scopedQuery(user, { productId: product?._id || null, stageId: `${configDoc._id}-finalStages-${assignedStageNumber}` }),
      { stageId: `${configDoc._id}-finalStages-${assignedStageNumber}`, ...updateData, ...tenantFields(user) },
      { new: true, upsert: true }
    );

    await ensureDefects('reject', stage.notOkOptions, user);
  }

  return { created: workflowCreated };
};

const createProductQRCode = async (product) => {
  if (!product?.withQRCode) return null;
  const code = product.code || product.productName;
  return QRCode.create({
    code,
    batchNo: code,
    quantity: Number(product.numberOfItems || 0),
    currentStage: 1,
    status: 'generated'
  });
};

// @desc    Create new product (Admin only)
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const {
      productName,
      code,
      rootCode,
      withQRCode,
      createQRCode,
      brandId,
      modelId,
      brandName,
      model,
      category,
      subcategory,
      stockQuantity,
      numberOfItems,
      minStockLevel,
      basePrice,
      sellingPrice
    } = req.body;

    if (!productName) {
      return res.status(400).json({ message: 'productName is required' });
    }

    const existingProductName = await Product.findOne(scopedQuery(req.user, productNameQuery(productName)));
    if (existingProductName) {
      return res.status(200).json(existingProductName);
    }

    const requestedCode = normalizeCode(code || rootCode);
    await validateCategorySelection({ category, subcategory, user: req.user });

    // Ensure uniqueness even after deletion
    if (requestedCode) {
      const existingProduct = await Product.findOne({
        ...scopedQuery(req.user, { code: requestedCode })
      });
      if (existingProduct) {
        return res.status(400).json({ message: 'Code already exists' });
      }
    }

    const resolved = brandId && modelId
      ? await resolveBrandModelStrings({ brandId, modelId, brandName, model, user: req.user })
      : await ensureBrandAndModel({ brandName, model, user: req.user });
    const resolvedCode = requestedCode || await generateCode();

    const product = new Product({
      productName,
      code: resolvedCode,
      category,
      subcategory,
      numberOfItems: Number(numberOfItems || stockQuantity || 0),
      stockQuantity: stockQuantity || numberOfItems || 0,
      minStockLevel: minStockLevel || 5,
      basePrice,
      sellingPrice,
      brandName: resolved.brandName,
      model: resolved.model,
      withQRCode: Boolean(withQRCode ?? createQRCode),
      ...tenantFields(req.user)
    });

    await product.save();
    await syncStageOneInputQuantity(product);
    await createProductQRCode(product);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Update product (Admin only)
// @route   PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const {
      productName,
      code,
      rootCode,
      withQRCode,
      brandId,
      modelId,
      category,
      subcategory,
      stockQuantity,
      numberOfItems,
      minStockLevel,
      basePrice,
      sellingPrice
    } = req.body;

    const product = await Product.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const requestedCode = normalizeCode(code || rootCode);
    await validateCategorySelection({ category, subcategory, user: req.user });

    if (requestedCode && requestedCode !== product.code) {
      const existingProduct = await Product.findOne({
        _id: { $ne: product._id },
        ...scopedQuery(req.user, { code: requestedCode })
      });
      if (existingProduct) {
        return res.status(400).json({ message: 'Code already exists' });
      }
    }

    if (productName) product.productName = productName;
    if (requestedCode) {
      product.code = requestedCode;
    }
    if (category) product.category = category;
    if (subcategory !== undefined) product.subcategory = subcategory;
    if (numberOfItems !== undefined) product.numberOfItems = Number(numberOfItems || 0);
    if (stockQuantity !== undefined) product.stockQuantity = stockQuantity;
    if (withQRCode !== undefined) product.withQRCode = Boolean(withQRCode);
    if (minStockLevel !== undefined) product.minStockLevel = minStockLevel;
    if (basePrice !== undefined) product.basePrice = basePrice;
    if (sellingPrice !== undefined) product.sellingPrice = sellingPrice;

    // Update brand/model only if IDs provided
    if (brandId && modelId) {
      const resolved = await resolveBrandModelStrings({ brandId, modelId, user: req.user });
      product.brandName = resolved.brandName;
      product.model = resolved.model;
    }

    await product.save();
    await syncStageOneInputQuantity(product);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.bulkUploadProducts = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.products) ? req.body.products : [];
    if (!rows.length) return res.status(400).json({ message: 'No products provided' });

    const result = { created: 0, updated: 0, qrCreated: 0, workflowCreated: 0, workflowUpdated: 0, errors: [] };

    for (const [index, row] of rows.entries()) {
      try {
        const productName = row.productName || row.partDetails || row.partDetail || row.partName || row.name || row.description;
        if (!productName) throw new Error('productName is required');

        const code = normalizeCode(row.code || row.rootCode) || await generateCode();
        const rawQuantity = row.numberOfItems || row.items || row.quantity || row.stockQuantity;
        const parsedQuantity = Number(rawQuantity || 0);
        const numberOfItems = Number.isFinite(parsedQuantity) && parsedQuantity > 0
          ? parsedQuantity
          : (Array.isArray(row.workflowStages) && row.workflowStages.length ? 1 : 0);
        const withQRCode = toBoolean(row.withQRCode ?? row.withQR);
        const resolved = await ensureBrandAndModel({ brandName: row.brandName || row.brand, model: row.model, user: req.user });
        const resolvedCategory = await ensureCategoryAndSubcategory({
          categoryName: row.categoryName || row.category,
          subcategoryName: row.subcategoryName || row.subcategory,
          user: req.user
        });

        await ensureDefects('reject', row.rejectDefects || row.rejectionDefects || row.defectRejectDetails, req.user);
        await ensureDefects('rework', row.reworkDefects || row.defectReworkDetails, req.user);

        let product = await Product.findOne({
          ...tenantFields(req.user),
          $or: [
            { code },
            { productName: { $regex: `^${escapeRegex(productName)}$`, $options: 'i' } }
          ]
        });
        const payload = {
          productName,
          code,
          description: row.description || productName,
          numberOfItems,
          stockQuantity: numberOfItems,
          brandName: resolved.brandName,
          model: resolved.model,
          ...(resolvedCategory.category ? { category: resolvedCategory.category } : {}),
          ...(resolvedCategory.subcategory ? { subcategory: resolvedCategory.subcategory } : {}),
          withQRCode,
          ...tenantFields(req.user)
        };

        if (product) {
          Object.assign(product, payload);
          await product.save();
          result.updated += 1;
        } else {
          product = await Product.create(payload);
          result.created += 1;
        }

        await syncStageOneInputQuantity(product);
        const workflowSync = await syncWorkflowTemplate({
          product,
          productName,
          code: product.code,
          workflowStages: row.workflowStages,
          finalStages: row.finalStages,
          user: req.user
        });

        if (workflowSync) {
          if (workflowSync.created) result.workflowCreated += 1;
          else result.workflowUpdated += 1;
        }

        if (withQRCode) {
          const existingQr = await QRCode.findOne({ code });
          if (!existingQr) {
            await createProductQRCode(product);
            result.qrCreated += 1;
          }
        }
      } catch (error) {
        console.error(`Bulk upload row ${index + 2} error:`, error);
        result.errors.push({ row: index + 2, error: error.message });
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Cascade delete a product and all related operational data.
//          Preserves Category, Subcategory, and Role records.
const deleteProductWithRelated = async (product, user) => {
  const productId = product._id;
  const code = product.code;
  const productName = product.productName;

  // Gather QR codes for the product (used to cascade item-level records).
  const qrCodes = await QRCode.find(scopedQuery(user, { code })).select('_id').lean();
  const qrIds = qrCodes.map((qr) => qr._id);
  const qrIdStrings = qrCodes.map((qr) => qr.qrId).filter(Boolean);

  // Manufacturing config + stage review configs/questionnaires.
  const config = await ManufacturingConfig.findOne(scopedQuery(user, {
    productName: { $regex: `^${escapeRegex(productName)}$`, $options: 'i' }
  }));
  const configId = config?._id;
  await ManufacturingConfig.deleteMany(scopedQuery(user, { _id: configId }));
  await StageReviewConfig.deleteMany(scopedQuery(user, {
    $or: [
      { productId },
      { configId },
      { productName }
    ]
  }));
  await StageReviewSubmission.deleteMany(scopedQuery(user, { productId }));

  // Inspection responses, scans, inspector verifications.
  await InspectionFormResponse.deleteMany({
    ...scopedQuery(user, {}),
    $or: [
      { productId: String(productId) },
      { productId },
      { code },
      ...(qrIdStrings.length ? [{ qrId: { $in: qrIdStrings } }] : [])
    ]
  });
  await InspectorVerification.deleteMany({
    ...scopedQuery(user, {}),
    $or: [
      { productId },
      { productId: String(productId) },
      { code }
    ]
  });
  await InspectionScanLog.deleteMany({
    ...scopedQuery(user, {}),
    $or: [
      { code },
      ...(qrIdStrings.length ? [{ qrId: { $in: qrIdStrings } }] : []),
      ...(qrIds.length ? [{ qrCode: { $in: qrIds } }] : [])
    ]
  });

  // QR codes, production logs, processing stages, product stages, movement logs.
  await QRCode.deleteMany(scopedQuery(user, { code }));
  await ProductionLog.deleteMany(scopedQuery(user, {
    $or: [
      { code },
      ...(qrIds.length ? [{ qrId: { $in: qrIds } }] : [])
    ]
  }));
  await ProcessingStage.deleteMany(scopedQuery(user, {
    $or: [
      { code },
      ...(qrIds.length ? [{ qrId: { $in: qrIds } }] : [])
    ]
  }));
  await ProductStage.deleteMany(scopedQuery(user, {
    $or: [
      { productId },
      { code }
    ]
  }));
  await StageMovementLog.deleteMany(scopedQuery(user, {
    $or: [
      { code },
      ...(qrIds.length ? [{ qrCode: { $in: qrIds } }] : []),
      ...(qrIdStrings.length ? [{ qrId: { $in: qrIdStrings } }] : [])
    ]
  }));

  // Product items derived from this product.
  await ProductItem.deleteMany(scopedQuery(user, {
    $or: [
      { rootProductId: productId },
      { rootCode: code }
    ]
  }));

  // Assemblies referencing this product's QR codes.
  if (qrIds.length) {
    await Assembly.deleteMany(scopedQuery(user, {
      'components.qrId': { $in: qrIds }
    }));
  }

  // Finally delete the product itself.
  await Product.deleteOne(scopedQuery(user, { _id: productId }));
};

// @desc    Delete product (Admin only)
// @route   DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne(scopedQuery(req.user, { _id: req.params.id }));
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await deleteProductWithRelated(product, req.user);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Bulk delete products (Admin only)
// @route   DELETE /api/products/bulk
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ message: 'No product ids provided' });
    }

    const products = await Product.find(scopedQuery(req.user, { _id: { $in: ids } }));
    for (const product of products) {
      await deleteProductWithRelated(product, req.user);
    }

    res.json({
      message: `Deleted ${products.length} product(s) and related data`,
      deleted: products.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get all low stock products
// @route   GET /api/products/low-stock/all
exports.getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find(await inferredProductQuery(req.user, {
      isDeleted: false,
      $expr: { $lte: ['$stockQuantity', '$minStockLevel'] }
    }, { User, Invoice }))
      .populate('category', 'name')
      .populate('subcategory', 'name');
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get all categories
// @route   GET /api/products/categories/all
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find(scopedQuery(req.user, { isActive: true })).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Create category (Admin only)
// @route   POST /api/products/categories
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = new Category({ name, description, ...tenantFields(req.user) });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Update category (Admin only)
// @route   PUT /api/products/categories/:id
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const category = await Category.findOneAndUpdate(
      scopedQuery(req.user, { _id: req.params.id }),
      { name, description, isActive },
      { new: true }
    );
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Delete category (Admin only)
// @route   DELETE /api/products/categories/:id
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findOneAndDelete(scopedQuery(req.user, { _id: req.params.id }));
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get all subcategories or by category
// @route   GET /api/products/subcategories/all
exports.getSubcategories = async (req, res) => {
  try {
    const { category } = req.query;
    let query = scopedQuery(req.user, { isActive: true });
    if (category) {
      query = scopedQuery(req.user, { isActive: true, category });
    }
    const subcategories = await Subcategory.find(query).select('name description isActive category').sort({ name: 1 });
    res.json(subcategories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Create subcategory (Admin only)
// @route   POST /api/products/subcategories
exports.createSubcategory = async (req, res) => {
  try {
    const { name, category, description } = req.body;

    const categoryExists = await Category.findOne(scopedQuery(req.user, { _id: category }));
    if (!categoryExists) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const subcategory = new Subcategory({ name, category, description, ...tenantFields(req.user) });
    await subcategory.save();
    res.status(201).json(subcategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Update subcategory (Admin only)
// @route   PUT /api/products/subcategories/:id
exports.updateSubcategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const subcategory = await Subcategory.findOneAndUpdate(
      scopedQuery(req.user, { _id: req.params.id }),
      { name, description, isActive },
      { new: true }
    );
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }
    res.json(subcategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Delete subcategory (Admin only)
// @route   DELETE /api/products/subcategories/:id
exports.deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findOneAndDelete(scopedQuery(req.user, { _id: req.params.id }));
    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }
    res.json({ message: 'Subcategory deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Get product analytics (sold count, dates, customers, interest)
// @route   GET /api/products/:id/analytics
exports.getProductAnalytics = async (req, res) => {
  try {
    const ObjectId = mongoose.Types.ObjectId;
    const productId = req.params.id;
    const product = await Product.findOne(await inferredProductQuery(req.user, { _id: productId, isDeleted: false }, { User, Invoice }))
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const totalSoldResult = await Invoice.aggregate([
      { $unwind: '$items' },
      { $match: await inferredInvoiceQuery(req.user, { 'items.productId': new ObjectId(productId), status: 'completed' }, User) },
      { $group: { _id: null, totalSold: { $sum: '$items.quantity' } } }
    ]);
    const totalSold = totalSoldResult[0]?.totalSold || 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const salesHistory = await Invoice.aggregate([
      { $unwind: '$items' },
      {
        $match: {
          'items.productId': new ObjectId(productId),
          ...(await inferredInvoiceQuery(req.user, {}, User)),
          status: 'completed',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const uniqueCustomers = await Invoice.distinct('customerName', {
      items: { $elemMatch: { productId: new ObjectId(productId) } },
      ...(await inferredInvoiceQuery(req.user, {}, User)),
      status: 'completed'
    });

    const totalRevenueResult = await Invoice.aggregate([
      { $unwind: '$items' },
      { $match: await inferredInvoiceQuery(req.user, { 'items.productId': new ObjectId(productId), status: 'completed' }, User) },
      { $group: { _id: null, totalRevenue: { $sum: '$items.total' } } }
    ]);
    const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

    const recentActivity = await Invoice.find(await inferredInvoiceQuery(req.user, {
      items: { $elemMatch: { productId: new ObjectId(productId) } },
      status: 'completed'
    }, User))
      .select('createdAt invoiceNumber customerName totalAmount')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      product,
      analytics: {
        totalSold,
        totalRevenue,
        customersBought: uniqueCustomers.length,
        customerInterest: uniqueCustomers.length > 0
          ? Math.round((uniqueCustomers.length / 10) * 100) || 0
          : 0,
        firstStockDate: product.createdAt,
        lastActivity: product.updatedAt,
        salesHistory: salesHistory.map(h => ({ date: h._id, sold: h.sold, revenue: h.revenue })),
        recentActivity
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
};

