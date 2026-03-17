const express = require("express");
const router = express.Router();

const {
  createEmployee,
  getAdminEmployees,
  updateEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
  getActiveEmployees,
  updateSalesTarget,
  resetSalesCount,
  getEmployeeProfile
} = require("../controllers/employeeController");

const { auth } = require('../middleware/authMiddleware');
const { adminOnly, authAndEmployee } = require('../middleware/roleMiddleware');


router.post("/", auth, adminOnly, createEmployee);
router.get("/", auth, adminOnly, getAdminEmployees);
router.get("/profile", auth, authAndEmployee, getEmployeeProfile);
router.put("/:id", auth, adminOnly, updateEmployee);
router.delete("/:id", auth, adminOnly, deleteEmployee);
router.patch("/status/:id", auth, adminOnly, toggleEmployeeStatus);
router.get("/active", auth, getActiveEmployees);
router.put("/target/:id", auth, adminOnly, updateSalesTarget);
router.post("/reset-count/:id", auth, adminOnly, resetSalesCount);

module.exports = router;

