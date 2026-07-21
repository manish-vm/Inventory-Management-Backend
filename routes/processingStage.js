const express = require('express');
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require('../middleware/authMiddleware');
const processingStageController = require('../controllers/processingStageController');

router.get('/', auth, authAndEmployee, processingStageController.getAllProcessingStages);
router.get('/stats', auth, authAndEmployee, processingStageController.getStageStats);

// Admin: stage-level review management
router.get('/review/stage/:stageNumber/stats', auth, adminOnly, processingStageController.getStageReviewStats);
router.get('/review/stage/:stageNumber/items', auth, adminOnly, processingStageController.getStageReviewItems);
router.put('/review/:id', auth, adminOnly, processingStageController.updateStageReview);

router.get('/:id', auth, authAndEmployee, processingStageController.getProcessingStageById);
router.post('/', auth, authAndEmployee, processingStageController.createProcessingStage);
router.put('/:id', auth, authAndEmployee, processingStageController.updateProcessingStage);
router.put('/:id/complete', auth, authAndEmployee, processingStageController.completeProcessingStage);
router.put('/:id/validate', auth, adminOnly, processingStageController.validateProcessingStage);


module.exports = router;
