const express = require('express');
const router = express.Router();
const processingStageController = require('../controllers/processingStageController');

router.get('/', processingStageController.getAllProcessingStages);
router.get('/stats', processingStageController.getStageStats);
router.get('/:id', processingStageController.getProcessingStageById);
router.post('/', processingStageController.createProcessingStage);
router.put('/:id', processingStageController.updateProcessingStage);
router.put('/:id/complete', processingStageController.completeProcessingStage);
router.put('/:id/validate', processingStageController.validateProcessingStage);

module.exports = router;