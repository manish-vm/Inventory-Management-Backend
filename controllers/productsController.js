const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');

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

// @desc    Create new product (Admin only)
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const { productName, productCode, category, subcategory, stockQuantity, minStockLevel, basePrice, sellingPrice } = req.body;

    // Check if product code already exists - in ANY product (including deleted)
    // This ensures deleted product codes are never reused
    if (productCode) {
      const existingProduct = await Product.findOne({ productCode });
      if (existingProduct) {
        return res.status(400).json({ message: 'Product code already exists' });
      }
    }

    const product = new Product({
      productName,
      productCode, // Will be auto-generated if not provided (always unique, never reused)
      category,
      subcategory,
      stockQuantity: stockQuantity || 0,
      minStockLevel: minStockLevel || 5,
      basePrice,
      sellingPrice
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
    const { productName, productCode, category, subcategory, stockQuantity, minStockLevel, basePrice, sellingPrice } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if productCode is being changed and if it already exists
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
    
    // Validate category exists
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

