const express = require('express');
const router = express.Router();
const { auth, authAndEmployee } = require('../middleware/authMiddleware');
const productionLogController = require('../controllers/productionLogController');

router.get('/', auth, authAndEmployee, productionLogController.getAllProductionLogs);
router.get('/stats', auth, authAndEmployee, productionLogController.getProductionStats);
router.get('/daily', auth, authAndEmployee, productionLogController.getDailyProduction);
router.get('/:id', auth, authAndEmployee, productionLogController.getProductionLogById);
router.post('/', auth, authAndEmployee, productionLogController.createProductionLog);
router.put('/:id', auth, authAndEmployee, productionLogController.updateProductionLog);

module.exports = router;
