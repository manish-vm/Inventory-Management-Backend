const express = require('express');
const { auth, adminOnly } = require('../middleware/authMiddleware');
const controller = require('../controllers/misOperationsController');

const router = express.Router();
router.use(auth, adminOnly);

router.get('/bop-receipts', controller.getBopReceipts);
router.post('/bop-receipts', controller.createBopReceipt);
router.put('/bop-receipts/:id', controller.updateBopReceipt);
router.delete('/bop-receipts/:id', controller.deleteBopReceipt);

router.get('/supplier-rejections', controller.getSupplierRejections);
router.post('/supplier-rejections', controller.createSupplierRejection);
router.put('/supplier-rejections/:id', controller.updateSupplierRejection);
router.delete('/supplier-rejections/:id', controller.deleteSupplierRejection);

module.exports = router;
