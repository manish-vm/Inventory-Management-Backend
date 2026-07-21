const express = require('express');
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require('../middleware/authMiddleware');
const manufacturingConfigController = require('../controllers/manufacturingConfigController');

router.get('/', auth, authAndEmployee, manufacturingConfigController.getAllManufacturingConfigs);
// IMPORTANT: place these routes BEFORE '/:id' to avoid them being captured by the :id param
router.get('/code/:code', auth, authAndEmployee, manufacturingConfigController.getManufacturingConfigByCode);
router.get('/part/:code', auth, authAndEmployee, manufacturingConfigController.getManufacturingConfigByCode);
router.get('/:id', auth, authAndEmployee, manufacturingConfigController.getManufacturingConfigById);
router.post('/', auth, adminOnly, manufacturingConfigController.createManufacturingConfig);
router.post('/validate-stage', auth, authAndEmployee, manufacturingConfigController.validateStageSequence);

// Admin: review form builder (dynamic question tree)
router.get('/:id/review-forms', auth, adminOnly, manufacturingConfigController.getReviewForms);
router.put('/:id/review-forms', auth, adminOnly, manufacturingConfigController.saveReviewForms);

router.put('/:id', auth, adminOnly, manufacturingConfigController.updateManufacturingConfig);
router.delete('/:id', auth, adminOnly, manufacturingConfigController.deleteManufacturingConfig);


module.exports = router;


