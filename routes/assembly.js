const express = require('express');
const router = express.Router();
const { auth, authAndEmployee } = require('../middleware/authMiddleware');
const assemblyController = require('../controllers/assemblyController');

router.get('/', auth, authAndEmployee, assemblyController.getAllAssemblies);
router.get('/stats', auth, authAndEmployee, assemblyController.getAssemblyStats);
router.get('/daily', auth, authAndEmployee, assemblyController.getDailyAssembly);
router.get('/:id', auth, authAndEmployee, assemblyController.getAssemblyById);
router.post('/', auth, authAndEmployee, assemblyController.createAssembly);
router.put('/:id', auth, authAndEmployee, assemblyController.updateAssembly);
router.put('/:id/finalize', auth, authAndEmployee, assemblyController.finalizeAssembly);

module.exports = router;
