const Product = require('../models/Product');

exports.getAllProductMasters = async (req, res) => {
  try {
    const { search, type, subType, isActive } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { partNo: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } }
      ];
    }

    if (type) query.type = type;
    if (subType) query.subType = subType;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const products = await Product.find(query).sort({ updatedAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductMasterById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductMasterByPartNo = async (req, res) => {
  try {
    const product = await Product.findOne({ partNo: req.params.partNo });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createProductMaster = async (req, res) => {
  try {
    const { partNo, description, productName, type, subType, unitWeight, unit } = req.body;

    const existingProduct = await Product.findOne({ partNo: partNo?.toUpperCase() });
    if (existingProduct) {
      return res.status(400).json({ message: 'Part No already exists' });
    }

    const product = new Product({
      partNo: partNo?.toUpperCase(),
      productName: productName || description || 'Untitled',
      description,
      type,
      subType,
      unitWeight,
      unit
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateProductMaster = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { partNo, description, productName, type, subType, unitWeight, unit, isActive } = req.body;

    if (partNo && partNo !== product.partNo) {
      const existing = await Product.findOne({ partNo: partNo?.toUpperCase() });
      if (existing) {
        return res.status(400).json({ message: 'Part No already exists' });
      }
      product.partNo = partNo.toUpperCase();
    }

    if (productName !== undefined) product.productName = productName;
    if (description !== undefined) product.description = description;
    if (type !== undefined) product.type = type;
    if (subType !== undefined) product.subType = subType;
    if (unitWeight !== undefined) product.unitWeight = unitWeight;
    if (unit !== undefined) product.unit = unit;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteProductMaster = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.uploadProductMasters = async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: 'No products provided' });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    for (const item of products) {
      try {
        const existing = await Product.findOne({ partNo: item.partNo?.toUpperCase() });
        
        if (existing) {
          existing.productName = item.productName || item.description || existing.productName;
          existing.description = item.description || existing.description;
          existing.type = item.type || existing.type;
          existing.subType = item.subType || existing.subType;
          await existing.save();
          results.updated++;
        } else {
          const product = new Product({
            partNo: item.partNo?.toUpperCase(),
            productName: item.productName || item.description || 'Untitled',
            description: item.description,
            type: item.type,
            subType: item.subType
          });
          await product.save();
          results.created++;
        }
      } catch (err) {
        results.errors.push({ partNo: item.partNo, error: err.message });
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductTypes = async (req, res) => {
  try {
    const types = await Product.distinct('type', { type: { $ne: null } });
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductSubTypes = async (req, res) => {
  try {
    const { type } = req.query;
    let query = { subType: { $ne: null } };
    if (type) query.type = type;
    
    const subTypes = await Product.distinct('subType', query);
    res.json(subTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};