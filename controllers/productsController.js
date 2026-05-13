const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Invoice = require('../models/Invoice');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const BrandModel = require('../models/BrandModel');

// @desc    Get all products (with optional search/filter)
// @route   GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const { search, category, subcategory, lowStock } = req.query;
    let query = { isDeleted: false }; // Only show non-deleted products

    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } }
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
    const product = await Product.findById(req.params.id)
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

// @desc    Get product by barcode/productCode
// @route   GET /api/products/code/:code
exports.getProductByCode = async (req, res) => {
  try {
    const product = await Product.findOne({
      productCode: req.params.code,
      isDeleted: false
    })
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
const resolveBrandModelStrings = async ({ brandId, modelId, brandName, model }) => {
  // If IDs provided, prefer them
  if (brandId && modelId) {
    const brand = await Brand.findById(brandId);
    const m = await BrandModel.findById(modelId);

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

// @desc    Create new product (Admin only)
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const {
      productName,
      productCode,
      brandId,
      modelId,
      brandName,
      model,
      category,
      subcategory,
      stockQuantity,
      minStockLevel,
      basePrice,
      sellingPrice
    } = req.body;

    if (!productName) {
      return res.status(400).json({ message: 'productName is required' });
    }

    // Ensure uniqueness even after deletion
    if (productCode) {
      const existingProduct = await Product.findOne({ productCode });
      if (existingProduct) {
        return res.status(400).json({ message: 'Product code already exists' });
      }
    }

    const resolved = await resolveBrandModelStrings({ brandId, modelId, brandName, model });

    const product = new Product({
      productName,
      productCode, // Will be auto-generated if not provided
      category,
      subcategory,
      stockQuantity: stockQuantity || 0,
      minStockLevel: minStockLevel || 5,
      basePrice,
      sellingPrice,
      brandName: resolved.brandName,
      model: resolved.model
    });

    await product.save();
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
      productCode,
      brandId,
      modelId,
      category,
      subcategory,
      stockQuantity,
      minStockLevel,
      basePrice,
      sellingPrice
    } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (productCode && productCode !== product.productCode) {
      const existingProduct = await Product.findOne({ productCode });
      if (existingProduct) {
        return res.status(400).json({ message: 'Product code already exists' });
      }
    }

    if (productName) product.productName = productName;
    if (productCode) product.productCode = productCode;
    if (category) product.category = category;
    if (subcategory !== undefined) product.subcategory = subcategory;
    if (stockQuantity !== undefined) product.stockQuantity = stockQuantity;
    if (minStockLevel !== undefined) product.minStockLevel = minStockLevel;
    if (basePrice !== undefined) product.basePrice = basePrice;
    if (sellingPrice !== undefined) product.sellingPrice = sellingPrice;

    // Update brand/model only if IDs provided
    if (brandId && modelId) {
      const resolved = await resolveBrandModelStrings({ brandId, modelId });
      product.brandName = resolved.brandName;
      product.model = resolved.model;
    }

    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// @desc    Delete product (Admin only)
// @route   DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
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

// @desc    Get all low stock products
// @route   GET /api/products/low-stock/all
exports.getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ['$stockQuantity', '$minStockLevel'] }
    })
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
    const categories = await Category.find({ isActive: true });
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
    const category = new Category({ name, description });
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
    const category = await Category.findByIdAndUpdate(
      req.params.id,
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
    const category = await Category.findByIdAndDelete(req.params.id);
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
    let query = { isActive: true };
    if (category) {
      query.category = category;
    }
    const subcategories = await Subcategory.find(query).select('name description isActive category');
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

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const subcategory = new Subcategory({ name, category, description });
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
    const subcategory = await Subcategory.findByIdAndUpdate(
      req.params.id,
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
    const subcategory = await Subcategory.findByIdAndDelete(req.params.id);
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
    const product = await Product.findById(productId)
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const totalSoldResult = await Invoice.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.productId': new ObjectId(productId), status: 'completed' } },
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
      status: 'completed'
    });

    const totalRevenueResult = await Invoice.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.productId': new ObjectId(productId), status: 'completed' } },
      { $group: { _id: null, totalRevenue: { $sum: '$items.total' } } }
    ]);
    const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

    const recentActivity = await Invoice.find({
      items: { $elemMatch: { productId: new ObjectId(productId) } },
      status: 'completed'
    })
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

