const express = require('express');
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require('../middleware/authMiddleware');
const productMasterController = require('../controllers/productMasterController');

router.get('/', auth, authAndEmployee, productMasterController.getAllProductMasters);
router.get('/types', auth, authAndEmployee, productMasterController.getProductTypes);
router.get('/subtypes', auth, authAndEmployee, productMasterController.getProductSubTypes);
router.get('/code/:code', auth, authAndEmployee, productMasterController.getProductMasterByCode);
router.get('/part/:code', auth, authAndEmployee, productMasterController.getProductMasterByCode);
router.get('/:id', auth, authAndEmployee, productMasterController.getProductMasterById);
router.post('/', auth, adminOnly, productMasterController.createProductMaster);
router.post('/upload', auth, adminOnly, productMasterController.uploadProductMasters);
router.put('/:id', auth, adminOnly, productMasterController.updateProductMaster);
router.delete('/:id', auth, adminOnly, productMasterController.deleteProductMaster);

module.exports = router;


