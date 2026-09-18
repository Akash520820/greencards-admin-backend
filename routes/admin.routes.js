const { Router } = require("express");
const {
  getDashboardStats,
  getAllUsers,
  toggleCustomerActive,
  getPendingSellers,
  getSellers,
  approveSeller,
  rejectSeller,
  suspendSeller,
  verifyBankDetails,
  getReportedReviews,
  getHiddenReviews,
  hideReview,
  unhideReview,
} = require("../controllers/admin.controller");
const { verifyStaffJWT, verifyAdmin, verifyPermission } = require("../shared/middleware/auth.middleware");
const validate = require("../shared/middleware/validate.middleware");
const {
  sellerStatusQuerySchema,
  rejectSellerSchema,
  verifyBankDetailsSchema,
  hideReviewSchema,
  sellerIdParamSchema,
  reviewIdParamSchema,
  userIdParamSchema,
} = require("../validators/admin.validators");

const router = Router();

// Every route below requires a staff session (Staff collection, separate
// cookie + secret from customers — see auth.middleware.js), plus at least
// "admin" role. Individual routes further narrow by permission (Phase 3
// RBAC) — an admin without VIEW_FINANCIALS can't see /stats, one without
// MANAGE_SELLERS can't touch seller approval, etc. Note: promoting a user
// to staff no longer happens here — see /api/v1/staff/access-requests.
router.use(verifyStaffJWT, verifyAdmin);

router.route("/stats").get(verifyPermission("VIEW_FINANCIALS"), getDashboardStats);
router.route("/users").get(getAllUsers);
router
  .route("/users/:userId/toggle-active")
  .patch(verifyPermission("MANAGE_USERS"), validate({ params: userIdParamSchema }), toggleCustomerActive);

// seller application workflow
router
  .route("/sellers")
  .get(verifyPermission("MANAGE_SELLERS"), validate({ query: sellerStatusQuerySchema }), getSellers); // ?status=pending|approved|rejected|suspended (omit for all)
router.route("/sellers/pending").get(verifyPermission("MANAGE_SELLERS"), getPendingSellers);
router
  .route("/sellers/:sellerId/approve")
  .patch(verifyPermission("MANAGE_SELLERS"), validate({ params: sellerIdParamSchema }), approveSeller);
router
  .route("/sellers/:sellerId/reject")
  .patch(
    verifyPermission("MANAGE_SELLERS"),
    validate({ params: sellerIdParamSchema, body: rejectSellerSchema }),
    rejectSeller
  );
router
  .route("/sellers/:sellerId/suspend")
  .patch(verifyPermission("MANAGE_SELLERS"), validate({ params: sellerIdParamSchema }), suspendSeller);
router
  .route("/sellers/:sellerId/verify-bank")
  .patch(
    verifyPermission("MANAGE_SELLERS"),
    validate({ params: sellerIdParamSchema, body: verifyBankDetailsSchema }),
    verifyBankDetails
  );

// review moderation
router.route("/reviews/reported").get(verifyPermission("MODERATE_REVIEWS"), getReportedReviews);
router.route("/reviews/hidden").get(verifyPermission("MODERATE_REVIEWS"), getHiddenReviews);
router
  .route("/reviews/:reviewId/hide")
  .patch(
    verifyPermission("MODERATE_REVIEWS"),
    validate({ params: reviewIdParamSchema, body: hideReviewSchema }),
    hideReview
  );
router
  .route("/reviews/:reviewId/unhide")
  .patch(verifyPermission("MODERATE_REVIEWS"), validate({ params: reviewIdParamSchema }), unhideReview);

module.exports = router;
