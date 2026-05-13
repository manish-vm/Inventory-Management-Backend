const express = require('express');
const router = express.Router();
const productMasterController = require('../controllers/productMasterController');

router.get('/', productMasterController.getAllProductMasters);
router.get('/types', productMasterController.getProductTypes);
router.get('/subtypes', productMasterController.getProductSubTypes);
router.get('/part/:partNo', productMasterController.getProductMasterByPartNo);
router.get('/:id', productMasterController.getProductMasterById);
router.post('/', productMasterController.createProductMaster);
router.post('/upload', productMasterController.uploadProductMasters);
router.put('/:id', productMasterController.updateProductMaster);
router.delete('/:id', productMasterController.deleteProductMaster);

module.exports = router;
