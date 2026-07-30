require('node:dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');

const ActivityLog = require('./models/ActivityLog');
const Assembly = require('./models/Assembly');
const Attendance = require('./models/Attendance');
const BopReceipt = require('./models/BopReceipt');
const Brand = require('./models/Brand');
const BrandModel = require('./models/BrandModel');
const Category = require('./models/Category');
const ChatSession = require('./models/ChatSession');
const Customer = require('./models/Customer');
const Dealer = require('./models/Dealer');
const DefectDetail = require('./models/DefectDetail');
const EmployeeMisSheetEntry = require('./models/EmployeeMisSheetEntry');
const InspectionFormResponse = require('./models/InspectionFormResponse');
const InspectionScanLog = require('./models/InspectionScanLog');
const InspectorVerification = require('./models/InspectorVerification');
const Invoice = require('./models/Invoice');
const ManufacturingConfig = require('./models/ManufacturingConfig');
const Notification = require('./models/Notification');
const ProcessingStage = require('./models/ProcessingStage');
const Product = require('./models/Product');
const ProductionLog = require('./models/ProductionLog');
const ProductItem = require('./models/ProductItem');
const ProductStage = require('./models/ProductStage');
const QRCode = require('./models/QRCode');
const RawMaterial = require('./models/RawMaterial');
const RefundRequest = require('./models/RefundRequest');
const Role = require('./models/Role');
const ShellMouldingInspectionEntry = require('./models/ShellMouldingInspectionEntry');
const StageMovementLog = require('./models/StageMovementLog');
const StageReviewConfig = require('./models/StageReviewConfig');
const StageReviewSubmission = require('./models/StageReviewSubmission');
const Subcategory = require('./models/Subcategory');
const SubscriptionPlan = require('./models/SubscriptionPlan');
const SupplierRejection = require('./models/SupplierRejection');
const VisorPdiirInspectionEntry = require('./models/VisorPdiirInspectionEntry');

// Clears every application collection except users.
// Preserved: User documents only, so existing login credentials remain.
// Cleared: products, manufacturing configs, questionnaires, roles, dealers,
// plans, reports, responses, QR codes, invoices, logs, and all operational data.
const collectionsToClear = [
  ActivityLog,
  Assembly,
  Attendance,
  BopReceipt,
  Brand,
  BrandModel,
  Category,
  ChatSession,
  Customer,
  Dealer,
  DefectDetail,
  EmployeeMisSheetEntry,
  InspectionFormResponse,
  InspectionScanLog,
  InspectorVerification,
  Invoice,
  ManufacturingConfig,
  Notification,
  ProcessingStage,
  Product,
  ProductionLog,
  ProductItem,
  ProductStage,
  QRCode,
  RawMaterial,
  RefundRequest,
  Role,
  ShellMouldingInspectionEntry,
  StageMovementLog,
  StageReviewConfig,
  StageReviewSubmission,
  Subcategory,
  SubscriptionPlan,
  SupplierRejection,
  VisorPdiirInspectionEntry
];

async function clearAllExceptUsers() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI or MONGODB_URI is required');

  await mongoose.connect(mongoUri);

  const dryRun = process.argv.includes('--dry-run');
  const results = await Promise.all(collectionsToClear.map(async (model) => {
    if (dryRun) {
      const count = await model.countDocuments({});
      return { collection: model.collection.name, deleted: 0, wouldDelete: count };
    }

    const result = await model.deleteMany({});
    return { collection: model.collection.name, deleted: result.deletedCount || 0, wouldDelete: undefined };
  }));

  const totalDeleted = results.reduce((sum, row) => sum + row.deleted, 0);
  const totalWouldDelete = results.reduce((sum, row) => sum + (row.wouldDelete || 0), 0);
  console.table(results);
  if (dryRun) {
    console.log(`Dry run completed. ${totalWouldDelete} documents would be deleted. Only users would be preserved.`);
  } else {
    console.log(`Reset completed. Deleted ${totalDeleted} documents. Only users were preserved.`);
  }
  await mongoose.connection.close();
}

clearAllExceptUsers().catch(async (error) => {
  console.error('Reset failed:', error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
