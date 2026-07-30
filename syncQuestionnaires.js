require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const ManufacturingConfig = require('./models/ManufacturingConfig');
const StageReviewConfig = require('./models/StageReviewConfig');
const Product = require('./models/Product');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const productForConfig = async (configDoc) => Product.findOne({
  productName: { $regex: `^${escapeRegex(configDoc.productName)}$`, $options: 'i' },
  ...(configDoc.dealerId ? { dealerId: configDoc.dealerId } : {}),
  isDeleted: false
}).select('_id').lean();

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
      const product = await productForConfig(configDoc);

      for (const stage of stages) {
        const rf = stage.reviewForm || {};
        const rejQs = rf.rejectionForm?.questions || [];
        const rwkQs = rf.reworkForm?.questions || [];

        if (rejQs.length || rwkQs.length) {
          const updateData = {
            productId: product?._id || null,
            configId: configDoc._id,
            stageNumber: stage.stageNumber,
            stageName: stage.stageName || '',
            configurationMode: 'stages',
            rejectionQuestionnaireEnabled: rejQs.length > 0,
            rejectionQuestions: rejQs,
            reworkQuestionnaireEnabled: rwkQs.length > 0,
            reworkQuestions: rwkQs,
            ...(configDoc.dealerId ? { dealerId: configDoc.dealerId } : {})
          };

          await StageReviewConfig.findOneAndUpdate(
            {
              stageId: `${configDoc._id}-stages-${stage.stageNumber}`,
              ...(product?._id ? { productId: product._id } : {})
            },
            { stageId: `${configDoc._id}-stages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );

          // Backfill any legacy product-name keyed document, but do not create
          // new aliases. New reads/writes use config-id stageIds only.
          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc.productName}-stages-${stage.stageNumber}` },
            { $set: updateData },
            { new: true }
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
            productId: product?._id || null,
            configId: configDoc._id,
            stageNumber: stage.stageNumber,
            stageName: stage.stageName || '',
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
            {
              stageId: `${configDoc._id}-finalStages-${stage.stageNumber}`,
              ...(product?._id ? { productId: product._id } : {})
            },
            { stageId: `${configDoc._id}-finalStages-${stage.stageNumber}`, ...updateData },
            { new: true, upsert: true }
          );

          // Backfill legacy product-name keyed documents without creating more.
          await StageReviewConfig.findOneAndUpdate(
            { stageId: `${configDoc.productName}-finalStages-${stage.stageNumber}` },
            { $set: updateData },
            { new: true }
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
