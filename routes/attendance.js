const express = require('express');
const router = express.Router();

const attendanceController = require('../controllers/attendanceController');
const { auth } = require('../middleware/authMiddleware');

router.get('/me', auth, attendanceController.getMyAttendance);
router.get('/admin/overview', auth, attendanceController.getAdminOverview);
router.post('/check-in', auth, attendanceController.checkIn);
router.post('/check-out', auth, attendanceController.checkOut);

module.exports = router;
