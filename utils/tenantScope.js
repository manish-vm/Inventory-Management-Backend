const legacyUnassignedScope = {
  $or: [
    { dealerId: null },
    { dealerId: { $exists: false } }
  ]
};

const withScope = (base, scope) => {
  if (!base || !Object.keys(base).length) return scope;
  return { $and: [base, scope] };
};

const scopedQuery = (user, base = {}) => {
  if (user?.role === 'superadmin') return { ...base };
  if (user?.dealerId) return { ...base, dealerId: user.dealerId };
  return withScope({ ...base }, legacyUnassignedScope);
};

const scopedMatch = scopedQuery;

const tenantFields = (user) => {
  if (!user?.dealerId || user.role === 'superadmin') return {};
  return { dealerId: user.dealerId };
};

const tenantDealerFilter = (user) => (
  user?.role === 'superadmin' || !user?.dealerId ? {} : { dealerId: user.dealerId }
);

const getDealerUserIds = async (user, User) => {
  if (!user?.dealerId || user.role === 'superadmin') return null;
  const users = await User.find({ dealerId: user.dealerId }).select('_id').lean();
  return users.map((row) => row._id);
};

const inferredInvoiceQuery = async (user, base = {}, User) => {
  if (user?.role === 'superadmin') return { ...base };
  if (!user?.dealerId) return scopedQuery(user, base);

  const dealerUserIds = await getDealerUserIds(user, User);
  return {
    ...base,
    $or: [
      { dealerId: user.dealerId },
      {
        $and: [
          legacyUnassignedScope,
          {
            $or: [
              { cashier: { $in: dealerUserIds } },
              { referredEmployee: { $in: dealerUserIds } }
            ]
          }
        ]
      }
    ]
  };
};

const inferredProductQuery = async (user, base = {}, { User, Invoice }) => {
  if (user?.role === 'superadmin') return { ...base };
  if (!user?.dealerId) return scopedQuery(user, base);

  const invoiceQuery = await inferredInvoiceQuery(user, {}, User);
  const productIds = await Invoice.distinct('items.productId', invoiceQuery);

  return {
    ...base,
    $or: [
      { dealerId: user.dealerId },
      {
        $and: [
          legacyUnassignedScope,
          { _id: { $in: productIds } }
        ]
      }
    ]
  };
};

module.exports = {
  scopedQuery,
  scopedMatch,
  tenantFields,
  tenantDealerFilter,
  getDealerUserIds,
  inferredInvoiceQuery,
  inferredProductQuery
};
