const express = require("express");
const router = express.Router();
const { auth, adminOnly, authAndEmployee } = require("../middleware/authMiddleware");

const controller = require(
  "../controllers/stageReviewConfigController"
);

router.post(
  "/:stageId",
  auth,
  adminOnly,
  controller.createOrUpdateConfig
);

router.get(
  "/report-options/:configId/:stageNumber",
  auth,
  authAndEmployee,
  controller.getReportOptions
);

router.post(
  "/submit/review",
  auth,
  authAndEmployee,
  controller.submitReview
);

router.get(
  "/analytics/:stageId",
  auth,
  authAndEmployee,
  controller.getAnalytics
);

router.get(
  "/:stageId",
  auth,
  authAndEmployee,
  controller.getConfig
);

module.exports = router;
