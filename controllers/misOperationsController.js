const BopReceipt = require('../models/BopReceipt');
const SupplierRejection = require('../models/SupplierRejection');

const monthRange = (month, year) => {
  const parsedMonth = Number(month);
  const parsedYear = Number(year);
  if (!parsedMonth || !parsedYear || parsedMonth < 1 || parsedMonth > 12) return null;
  return {
    $gte: new Date(parsedYear, parsedMonth - 1, 1),
    $lt: new Date(parsedYear, parsedMonth, 1)
  };
};

const listQuery = (dateField, req) => {
  const query = {};
  const range = monthRange(req.query.month, req.query.year);
  if (range) query[dateField] = range;
  if (req.query.productionLine) query.productionLine = req.query.productionLine;
  return query;
};

exports.getBopReceipts = async (req, res) => {
  try {
    const rows = await BopReceipt.find(listQuery('receivedAt', req)).sort({ receivedAt: 1, productionLine: 1, partType: 1 });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createBopReceipt = async (req, res) => {
  try {
    const receivedAt = new Date(req.body.receivedAt);
    const dayStart = new Date(receivedAt.getFullYear(), receivedAt.getMonth(), receivedAt.getDate());
    const dayEnd = new Date(receivedAt.getFullYear(), receivedAt.getMonth(), receivedAt.getDate() + 1);
    const row = await BopReceipt.findOneAndUpdate(
      {
        productionLine: req.body.productionLine,
        partType: req.body.partType,
        receivedAt: { $gte: dayStart, $lt: dayEnd }
      },
      { $set: { ...req.body, receivedAt: dayStart, createdBy: req.user?._id } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateBopReceipt = async (req, res) => {
  try {
    const row = await BopReceipt.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'BOP receipt not found' });
    res.json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteBopReceipt = async (req, res) => {
  try {
    const row = await BopReceipt.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'BOP receipt not found' });
    res.json({ message: 'BOP receipt deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSupplierRejections = async (req, res) => {
  try {
    const rows = await SupplierRejection.find(listQuery('inspectedAt', req)).sort({ inspectedAt: 1, createdAt: 1 });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createSupplierRejection = async (req, res) => {
  try {
    const row = await SupplierRejection.create({ ...req.body, createdBy: req.user?._id });
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateSupplierRejection = async (req, res) => {
  try {
    const row = await SupplierRejection.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ message: 'Supplier rejection not found' });
    res.json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteSupplierRejection = async (req, res) => {
  try {
    const row = await SupplierRejection.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Supplier rejection not found' });
    res.json({ message: 'Supplier rejection deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
