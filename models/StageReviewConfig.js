const mongoose = require("mongoose");

const QuestionOptionSchema = new mongoose.Schema({
  optionId: {
    type: String
  },

  label: {
    type: String,
    default: ""
  },

  value: {
    type: String,
    default: ""
  },

  subQuestions: []
});

const ReviewQuestionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true
  },

  questionText: {
    type: String,
    default: ""
  },

  responseType: {
    type: String,
    enum: [
      "text",
      "dropdown",
      "radio",
      "checkbox"
    ],
    required: true
  },

  required: {
    type: Boolean,
    default: false
  },

  options: [QuestionOptionSchema]
});

const StageReviewConfigSchema = new mongoose.Schema({
  stageId: {
    type: String,
    required: true
  },

  // Questionnaire ownership must be product scoped. A stage name such as
  // "Moulding Defects" can exist on many products, but these fields keep each
  // product-stage questionnaire isolated.
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    default: null
  },

  configId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ManufacturingConfig",
    default: null
  },

  stageNumber: {
    type: Number,
    default: null
  },

  stageName: {
    type: String,
    default: ""
  },

  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dealer",
    default: null
  },

  configurationMode: {
    type: String,
    enum: ['stages', 'finalStages'],
    default: 'stages'
  },

  acceptedRouteStage: {
    type: String,
    default: ""
  },

  reworkRouteStage: {
    type: String,
    default: ""
  },

  rejectionQuestionnaireEnabled: {
    type: Boolean,
    default: false
  },

  rejectionQuestions: [ReviewQuestionSchema],

  okQuestionnaireEnabled: {
    type: Boolean,
    default: false
  },

  okQuestions: [ReviewQuestionSchema],

  reworkQuestionnaireEnabled: {
    type: Boolean,
    default: false
  },

  reworkQuestions: [ReviewQuestionSchema]
}, {
  timestamps: true
});

StageReviewConfigSchema.index({ dealerId: 1, productId: 1, stageId: 1 });
StageReviewConfigSchema.index({ dealerId: 1, configId: 1, configurationMode: 1, stageNumber: 1 });

module.exports = mongoose.model(
  "StageReviewConfig",
  StageReviewConfigSchema
);
