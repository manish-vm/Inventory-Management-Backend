const express = require('express');
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require('../middleware/authMiddleware');
const rawMaterialController = require('../controllers/rawMaterialController');

router.get('/', auth, authAndEmployee, rawMaterialController.getAllRawMaterials);
router.get('/stats', auth, authAndEmployee, rawMaterialController.getRawMaterialStats);
router.get('/:id', auth, authAndEmployee, rawMaterialController.getRawMaterialById);
router.post('/', auth, authAndEmployee, rawMaterialController.createRawMaterial);
router.put('/:id', auth, authAndEmployee, rawMaterialController.updateRawMaterialQuantity);
router.put('/:id/validate', auth, adminOnly, rawMaterialController.validateRawMaterial);

module.exports = router;
