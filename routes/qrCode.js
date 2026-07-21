const express = require('express');
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require('../middleware/authMiddleware');
const qrCodeController = require('../controllers/qrCodeController');

router.get('/', auth, authAndEmployee, qrCodeController.getAllQRCodes);
router.get('/stats', auth, authAndEmployee, qrCodeController.getQRCodeStats);
router.get('/qr/:qrId', auth, authAndEmployee, qrCodeController.getQRCodeByQRId);
router.get('/:id', auth, authAndEmployee, qrCodeController.getQRCodeById);
router.post('/', auth, adminOnly, qrCodeController.createQRCode);
router.post('/bulk', auth, adminOnly, qrCodeController.bulkCreateQRCodes);
router.put('/:id', auth, adminOnly, qrCodeController.updateQRCode);
router.put('/:id/progress', auth, authAndEmployee, qrCodeController.updateQRCodeProgress);
router.delete('/:id', auth, adminOnly, qrCodeController.deleteQRCode);

module.exports = router;
