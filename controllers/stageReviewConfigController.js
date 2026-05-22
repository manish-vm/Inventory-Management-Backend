const StageReviewConfig = require("../models/StageReviewConfig");
const StageReviewSubmission = require("../models/StageReviewSubmission");
const { getManufacturingStatsByPartNo } = require("../utils/manufacturingStats");

const parseStageNumber = (stageId) => {
  const exact = Number(stageId);
  if (Number.isFinite(exact) && exact > 0) return exact;

  const suffixMatch = String(stageId || "").match(/-(\d+)$/);
  const suffix = suffixMatch ? Number(suffixMatch[1]) : NaN;
  return Number.isFinite(suffix) && suffix > 0 ? suffix : null;
};

exports.createOrUpdateConfig = async (req, res) => {
  try {
    const { stageId } = req.params;

    const {
      acceptedRouteStage,
      reworkRouteStage,
      rejectionQuestionnaireEnabled,
      rejectionQuestions
    } = req.body;

    const config = await StageReviewConfig.findOneAndUpdate(
      { stageId },
      {
        stageId,
        acceptedRouteStage: acceptedRouteStage || "",
        reworkRouteStage: reworkRouteStage || "",
        rejectionQuestionnaireEnabled: Boolean(rejectionQuestionnaireEnabled),
        rejectionQuestions: Array.isArray(rejectionQuestions) ? rejectionQuestions : []
      },
      {
        new: true,
        upsert: true
      }
    );

    res.status(200).json({
      success: true,
      data: config
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const { stageId } = req.params;

    const config = await StageReviewConfig.findOne({
      stageId
    });

    res.status(200).json({
      success: true,
      data: config
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.submitReview = async (req, res) => {
  try {
    const submission = await StageReviewSubmission.create(req.body);

    res.status(201).json({
      success: true,
      data: submission
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { stageId } = req.params;
    const { partNo } = req.query;

    if (partNo) {
      const stats = await getManufacturingStatsByPartNo({
        partNo,
        stageNumber: parseStageNumber(stageId)
      });

      return res.status(200).json({
        success: true,
        data: {
          total: stats.totalItems,
          totalItems: stats.totalItems,
          accepted: stats.accepted,
          rejected: stats.rejected,
          rework: stats.rework,
          pending: stats.pending
        }
      });
    }

    const submissions = await StageReviewSubmission.find({
      stageId
    });

    const total = submissions.length;

    const accepted = submissions.filter(
      s => s.status === "accepted"
    ).length;

    const rejected = submissions.filter(
      s => s.status === "rejected"
    ).length;

    const rework = submissions.filter(
      s => s.status === "rework"
    ).length;

    res.status(200).json({
      success: true,
      data: {
        total,
        accepted,
        rejected,
        rework,
        acceptedPercentage:
          total > 0 ? (accepted / total) * 100 : 0,

        rejectedPercentage:
          total > 0 ? (rejected / total) * 100 : 0,

        reworkPercentage:
          total > 0 ? (rework / total) * 100 : 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
