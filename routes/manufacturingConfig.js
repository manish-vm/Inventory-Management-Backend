const express = require('express');
const router = express.Router();
const manufacturingConfigController = require('../controllers/manufacturingConfigController');

router.get('/', manufacturingConfigController.getAllManufacturingConfigs);
// Backwards compatibility (older UI may still call by partNo)
// IMPORTANT: place this route BEFORE '/:id' to avoid it being captured by the :id param
router.get('/part/:partNo', manufacturingConfigController.getManufacturingConfigByPartNo);
router.get('/:id', manufacturingConfigController.getManufacturingConfigById);
router.post('/', manufacturingConfigController.createManufacturingConfig);
router.post('/validate-stage', manufacturingConfigController.validateStageSequence);
router.put('/:id', manufacturingConfigController.updateManufacturingConfig);
router.delete('/:id', manufacturingConfigController.deleteManufacturingConfig);

module.exports = router;
