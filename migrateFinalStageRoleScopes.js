require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('./models/Role');
const User = require('./models/User');

const roleData = (role) => ({
  roleName: role.roleName,
  permissions: role.permissions,
  categories: role.categories,
  subcategories: role.subcategories,
  products: role.products,
  stages: role.stages,
  finalStages: role.finalStages,
  createdBy: role.createdBy,
  dealerId: role.dealerId
});

const uniqueRoleName = async (baseName, roleFor, dealerId) => {
  const scopedRole = { roleFor, dealerId: dealerId || null };
  let candidate = baseName;
  let suffix = roleFor === 'employeeFinalStages' ? 'Employee' : 'Inspector';
  let index = 0;

  while (await Role.exists({ ...scopedRole, roleName: candidate }).collation({ locale: 'en', strength: 2 })) {
    index += 1;
    candidate = `${baseName} (${suffix}${index > 1 ? ` ${index}` : ''})`;
  }
  return candidate;
};

const migrate = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to split existing final-stage roles');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const legacyRoles = await Role.find({ roleFor: 'finalStages' });
  let convertedRoles = 0;
  let reassignedInspectors = 0;

  for (const legacyRole of legacyRoles) {
    const legacyRoleId = legacyRole._id;
    const inspectors = await User.find({
      role: 'inspector',
      assignedFinalStageRole: legacyRoleId
    }).select('_id');

    if (inspectors.length) {
      let inspectorRole = await Role.findOne({
        roleFor: 'inspectorFinalStages',
        migratedFrom: legacyRoleId
      });
      if (!inspectorRole) {
        const inspectorRoleName = await uniqueRoleName(
          legacyRole.roleName,
          'inspectorFinalStages',
          legacyRole.dealerId
        );
        inspectorRole = await Role.create({
          ...roleData(legacyRole),
          roleName: inspectorRoleName,
          roleFor: 'inspectorFinalStages',
          migratedFrom: legacyRoleId
        });
      }
      const result = await User.updateMany(
        { _id: { $in: inspectors.map((inspector) => inspector._id) } },
        { $set: { assignedFinalStageRole: inspectorRole._id } }
      );
      reassignedInspectors += result.modifiedCount || 0;
    }

    legacyRole.roleName = await uniqueRoleName(
      legacyRole.roleName,
      'employeeFinalStages',
      legacyRole.dealerId
    );
    legacyRole.roleFor = 'employeeFinalStages';
    await legacyRole.save();
    convertedRoles += 1;
  }

  console.log(`Converted ${convertedRoles} shared final-stage roles.`);
  console.log(`Reassigned ${reassignedInspectors} inspectors to independent role records.`);
};

migrate()
  .catch((error) => {
    console.error('Final-stage role migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
