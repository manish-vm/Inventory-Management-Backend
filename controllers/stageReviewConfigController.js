const StageReviewConfig = require("../models/StageReviewConfig");
const StageReviewSubmission = require("../models/StageReviewSubmission");
const { getManufacturingStatsByCode } = require("../utils/manufacturingStats");
const ManufacturingConfig = require("../models/ManufacturingConfig");
const User = require("../models/User");
const {
  scopedQuery,
  tenantFields,
  getDealerUserIds
} = require("../utils/tenantScope");

const scopedInspectionResponseQuery = async (user, base = {}) => {
  if (user?.role === 'superadmin') return { ...base };
  if (user?.role === 'employee') return { ...base, employee: user._id };
  const dealerUserIds = await getDealerUserIds(user, User);
  if (!dealerUserIds) return { ...base, employee: user?._id };
  return { ...base, employee: { $in: dealerUserIds } };
};

const parseStageNumber = (stageId) => {
  // Accept stageId shapes like:
  //  - "1" / 1
  //  - "stage-1" / "Stage-1" / "S1" / "S-1"
  //  - "something-2" (suffix digits)
  //  - "1-stage" (prefix digits)
  // Return null if stage number cannot be inferred.
  const raw = stageId === undefined || stageId === null ? '' : String(stageId).trim();
  if (!raw) return null;

  const exact = Number(raw);
  if (Number.isFinite(exact) && exact > 0) return exact;

  // suffix digits: "something-2" or "stage-2"
  const suffixMatch = raw.match(/-(\d+)$/);
  const suffix = suffixMatch ? Number(suffixMatch[1]) : NaN;
  if (Number.isFinite(suffix) && suffix > 0) return suffix;

  // prefix digits: "2-stage" (rare but handle)
  const prefixMatch = raw.match(/^(\d+)[^\d]*$/) || raw.match(/^(\d+)(?=[^\d]*$)/);
  if (prefixMatch) {
    const prefix = Number(prefixMatch[1]);
    if (Number.isFinite(prefix) && prefix > 0) return prefix;
  }

  // handle "S1" / "S-1" / "STAGE1"
  const sMatch = raw.match(/\bS\s*[-]?(\d+)\b/i) || raw.match(/\bSTAGE\s*[-]?(\d+)\b/i);
  const sNum = sMatch ? Number(sMatch[1]) : NaN;
  if (Number.isFinite(sNum) && sNum > 0) return sNum;

  return null;
};

exports.createOrUpdateConfig = async (req, res) => {
  try {
    const { stageId } = req.params;

    const {
      configurationMode,
      acceptedRouteStage,
      reworkRouteStage,
      okQuestionnaireEnabled,
      okQuestions,
      rejectionQuestionnaireEnabled,
      rejectionQuestions,
      reworkQuestionnaireEnabled,
      reworkQuestions
    } = req.body;

    const config = await StageReviewConfig.findOneAndUpdate(
      scopedQuery(req.user, { stageId }),
      {
        stageId,
        ...tenantFields(req.user),
        configurationMode: configurationMode === 'finalStages' ? 'finalStages' : 'stages',
        acceptedRouteStage: acceptedRouteStage || "",
        reworkRouteStage: reworkRouteStage || "",
        okQuestionnaireEnabled: Boolean(okQuestionnaireEnabled),
        okQuestions: Array.isArray(okQuestions) ? okQuestions : [],
        rejectionQuestionnaireEnabled: Boolean(rejectionQuestionnaireEnabled),
        rejectionQuestions: Array.isArray(rejectionQuestions) ? rejectionQuestions : [],
        reworkQuestionnaireEnabled: Boolean(reworkQuestionnaireEnabled),
        reworkQuestions: Array.isArray(reworkQuestions) ? reworkQuestions : []
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
      ...scopedQuery(req.user, { stageId })
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

exports.getReportOptions = async (req, res) => {
  try {
    const { configId, stageNumber } = req.params;
    const config = await ManufacturingConfig.findOne(scopedQuery(req.user, { _id: configId })).lean();
    if (!config) {
      return res.status(404).json({ success: false, message: "Configuration not found" });
    }

    const stage = (config.stages || []).find((item) => Number(item.stageNumber) === Number(stageNumber));
    if (!stage) {
      return res.status(404).json({ success: false, message: "Stage not found" });
    }

    const questions = stage.reviewForm?.rejectionForm?.questions || [];
    const groups = [];
    const seen = new Set();

    for (const question of questions) {
      for (const option of question.options || []) {
        const assemblyProcess = option.assemblyProcess || option.label || option.value || "";
        const key = assemblyProcess.trim().toLowerCase();
        if (!assemblyProcess || seen.has(key)) continue;
        seen.add(key);
        const defects = [];
        for (const subQuestion of option.subQuestions || []) {
          for (const defectOption of subQuestion.options || []) {
            const defectType = defectOption.defectType || defectOption.label || defectOption.value || "";
            if (defectType && !defects.includes(defectType)) defects.push(defectType);
          }
        }
        groups.push({ assemblyProcess, defects });
      }
    }

    res.status(200).json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitReview = async (req, res) => {
  try {
    const submission = await StageReviewSubmission.create({
      ...req.body,
      ...tenantFields(req.user)
    });

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

// Stage review analytics should reflect the queue model (accepted items forwarded into later stages
// should contribute as input/pending there). We already use getManufacturingStatsByCode from manufacturingStats.js,
// so no change is required here.
exports.getAnalytics = async (req, res) => {
  try {
    const { stageId } = req.params;
    const { code } = req.query;

    const isFinalMode = String(stageId).includes('-finalStages-');

    if (code) {
      const parsedStageNumber = parseStageNumber(stageId);
      if (!parsedStageNumber) {
        return res.status(400).json({
          success: false,
          message: `Invalid stageId. Could not parse stage number from: ${stageId}`
        });
      }

      if (isFinalMode) {
        const InspectionFormResponse = require('../models/InspectionFormResponse');
        const responses = await InspectionFormResponse.find(await scopedInspectionResponseQuery(req.user, {
          code,
          stageNumber: parsedStageNumber,
          finalStage: true
        }));

        const ok = responses.reduce((sum, r) => sum + Number(r.acceptedCount || 0), 0);
        const notOk = responses.reduce((sum, r) => sum + Number(r.rejectedCount || 0), 0);
        const pending = responses.reduce((sum, r) => sum + Number(r.reworkCount || 0), 0);
        const total = ok + notOk + pending;

        return res.status(200).json({
          success: true,
          data: {
            total,
            totalItems: total,
            ok,
            notOk,
            pending
          }
        });
      }

      const stats = await getManufacturingStatsByCode({
        code,
        stageNumber: parsedStageNumber
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

    if (isFinalMode) {
      const parsedStageNumber = parseStageNumber(stageId);
      const InspectionFormResponse = require('../models/InspectionFormResponse');
      const responses = await InspectionFormResponse.find(await scopedInspectionResponseQuery(req.user, {
        stageNumber: parsedStageNumber,
        finalStage: true
      }));

      const ok = responses.reduce((sum, r) => sum + Number(r.acceptedCount || 0), 0);
      const notOk = responses.reduce((sum, r) => sum + Number(r.rejectedCount || 0), 0);
      const pending = responses.reduce((sum, r) => sum + Number(r.reworkCount || 0), 0);
      const total = ok + notOk + pending;

      return res.status(200).json({
        success: true,
        data: {
          total,
          totalItems: total,
          ok,
          notOk,
          pending
        }
      });
    }

    const submissions = await StageReviewSubmission.find(scopedQuery(req.user, {
      stageId
    }));

    const total = submissions.length;
    const accepted = submissions.filter(s => s.status === "accepted").length;
    const rejected = submissions.filter(s => s.status === "rejected").length;
    const rework = submissions.filter(s => s.status === "rework").length;

    res.status(200).json({
      success: true,
      data: {
        total,
        totalItems: total,
        accepted,
        rejected,
        rework,
        acceptedPercentage: total > 0 ? (accepted / total) * 100 : 0,
        rejectedPercentage: total > 0 ? (rejected / total) * 100 : 0,
        reworkPercentage: total > 0 ? (rework / total) * 100 : 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


