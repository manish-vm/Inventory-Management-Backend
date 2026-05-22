const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const ManufacturingConfig = require('../models/ManufacturingConfig');
const Product = require('../models/Product');

router.get('/stage/:stageId', auth, async (req, res) => {
  try {
    const stageId = Number(req.params.stageId);
    const { partNo, productName } = req.query;

    let resolvedProductName = productName;
    if (!resolvedProductName && partNo) {
      const product = await Product.findOne({
        $or: [{ partNo }, { productCode: partNo }]
      });
      resolvedProductName = product?.productName;
    }

    if (!resolvedProductName) {
      return res.json([]);
    }

    const query = { productName: resolvedProductName, 'stages.stageNumber': stageId };

    const config = await ManufacturingConfig.findOne(query);
    const stage = config?.stages?.find((item) => Number(item.stageNumber) === stageId);
    const questions = stage?.reviewForm?.questions || stage?.reviewForm?.outcomes || [];

    if (!config || !stage || questions.length === 0) {
      return res.json([]);
    }

    res.json([
      {
        formId: stage?.reviewForm?.formId || `stage-${stageId}-admin`,
        formName: stage?.reviewForm?.formName || `${stage.stageName} Inspection Form`,
        stageId,
        productName: config.productName,
        questions
      }
    ]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
