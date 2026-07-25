require('dotenv').config();
const mongoose = require('mongoose');
const ManufacturingConfig = require('./models/ManufacturingConfig');
const StageReviewConfig = require('./models/StageReviewConfig');

async function syncAll() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const mConfigs = await ManufacturingConfig.find({}).lean();
    console.log(`Checking ${mConfigs.length} ManufacturingConfig documents for questionnaire sync...`);

    let syncedCount = 0;
    for (const configDoc of mConfigs) {
      const stages = configDoc.stages || [];
      const finalStages = configDoc.finalStages || [];

      for (const stage of stages) {
        const rf = stage.reviewForm || {};
        const rejQs = rf.rejectionForm?.questions || [];
        const rwkQs = rf.reworkForm?.questions || [];

        if (rejQs.length || rwkQs.length) {
          const updateData = {
            rejectionQuestionnaireEnabled: rejQs.length > 0,
            rejectionQuestions: rejQs,
            reworkQuestionnaireEnabled: rwkQs.length > 0,
            reworkQuestions: rwkQs,
            ...(configDoc.dealerId ? { dealerId: configDoc.dealerId } : {})
          };

          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc._id}-stages-${stage.stageNumber}` },
            { stageId: `${configDoc._id}-stages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );

          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc.productName}-stages-${stage.stageNumber}` },
            { stageId: `${configDoc.productName}-stages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );
          syncedCount++;
        }
      }

      for (const stage of finalStages) {
        const rf = stage.reviewForm || {};
        const notOkQs = rf.rejectionForm?.questions || [];
        const okQs = rf.okForm?.questions || [];

        if (notOkQs.length || okQs.length) {
          const updateData = {
            configurationMode: 'finalStages',
            rejectionQuestionnaireEnabled: notOkQs.length > 0,
            rejectionQuestions: notOkQs,
            okQuestionnaireEnabled: okQs.length > 0,
            okQuestions: okQs,
            reworkQuestionnaireEnabled: false,
            reworkQuestions: [],
            ...(configDoc.dealerId ? { dealerId: configDoc.dealerId } : {})
          };

          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc._id}-finalStages-${stage.stageNumber}` },
            { stageId: `${configDoc._id}-finalStages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );

          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc.productName}-finalStages-${stage.stageNumber}` },
            { stageId: `${configDoc.productName}-finalStages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );
          syncedCount++;
        }
      }
    }

    console.log(`Sync completed! Updated ${syncedCount} questionnaire stage review configs.`);
  } catch (err) {
    console.error('Error during questionnaire sync:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

syncAll();
