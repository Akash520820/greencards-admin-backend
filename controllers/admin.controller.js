const asyncHandler = require("../shared/utils/asyncHandler");
const ApiError = require("../shared/utils/ApiError");
const ApiResponse = require("../shared/utils/ApiResponse");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const Order = require("../models/order.model");
const SellerProfile = require("../models/sellerProfile.model");
const Review = require("../models/review.model");
const { recalculateProductRatings } = require("../controllers/review.controller");
const { logAudit } = require("../shared/utils/auditLog.util");
const logger = require("../shared/utils/logger");

/**
 * Fires an internal command at another microservice (best-effort, non-blocking).
 * Admin actions should never fail because a downstream service is temporarily
 * unreachable — we log a warning and move on. The admin's local shadow copy
 * is already updated, which keeps reads consistent.
 *
 * @param {string} serviceUrl  - e.g. process.env.USER_BACKEND_INTERNAL_URL
 * @param {string} commandType - e.g. "USER_SET_ACTIVE"
 * @param {object} payload     - command-specific data
 */
const propagateCommand = async (serviceUrl, commandType, payload) => {
  try {
    const res = await fetch(`${serviceUrl}/internal/commands`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ commandType, payload }),
      signal: AbortSignal.timeout(5000), // 5-second timeout — don't stall the admin UI
    });
    if (!res.ok) {
      logger.warn(`propagateCommand(${commandType}) to ${serviceUrl} returned ${res.status}`);
    }
  } catch (err) {
    // Network error, timeout, or service down — log and continue
    logger.warn(`propagateCommand(${commandType}) to ${serviceUrl} failed: ${err.message}`);
  }
};


// ---- Dashboard summary stats ----
const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalProducts, totalOrders, revenueResult, ordersByStatus] = await Promise.all([
    User.countDocuments({ role: "user" }),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
    ]),
    Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
        ordersByStatus,
      },
      "Dashboard stats fetched successfully"
    )
  );
});

// ---- GET all users (admin) ----
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await Promise.all([
    User.find().select("-password -refreshToken").skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    User.countDocuments(),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { users, pagination: { total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) } },
      "Users fetched successfully"
    )
  );
});

// ---- Activate/deactivate a customer or seller account (never a staff
// account — that's an entirely separate system, see staff.controller.js) ----
const toggleCustomerActive = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  await logAudit(
    req.staff,
    user.isActive ? "user.activated" : "user.deactivated",
    { type: "User", id: user._id },
    {},
    req
  );

  // Propagate to user-backend (authoritative user_db) and seller-backend (local User shadow) — best-effort, non-blocking
  propagateCommand(
    process.env.USER_BACKEND_INTERNAL_URL,
    "USER_SET_ACTIVE",
    { userId: user._id.toString(), isActive: user.isActive }
  );
  propagateCommand(
    process.env.SELLER_BACKEND_INTERNAL_URL,
    "USER_SET_ACTIVE",
    { userId: user._id.toString(), isActive: user.isActive }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, user, `User ${user.isActive ? "activated" : "deactivated"}`));
});

// ---- GET pending seller applications ----
const getPendingSellers = asyncHandler(async (req, res) => {
  const pendingSellers = await SellerProfile.find({ status: "pending" })
    .populate("userId", "userName fullName email phone")
    .sort({ createdAt: 1 });

  return res.status(200).json(new ApiResponse(200, pendingSellers, "Pending seller applications fetched"));
});

// ---- GET seller profiles by status (or all, if no status given) ----
// Added so actions like suspendSeller have a discovery path: previously the
// only listing endpoint was getPendingSellers (status "pending" only), so an
// already-approved seller's SellerProfile _id was unreachable from the API.
const getSellers = asyncHandler(async (req, res) => {
  const { status } = req.query; // "pending" | "approved" | "rejected" | "suspended" — omit for all

  const filter = {};
  if (status) {
    if (!["pending", "approved", "rejected", "suspended"].includes(status)) {
      throw new ApiError(400, "status must be one of: pending, approved, rejected, suspended");
    }
    filter.status = status;
  }

  const sellers = await SellerProfile.find(filter)
    .populate("userId", "userName fullName email phone")
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, sellers, "Sellers fetched"));
});

// ---- Approve a seller application: flips SellerProfile.status AND User.role ----
// requires bank details to already be verified via verifyBankDetails — approving
// a seller whose payout account hasn't been confirmed is not allowed
const approveSeller = asyncHandler(async (req, res) => {
  const { sellerId } = req.params; // SellerProfile _id

  const sellerProfile = await SellerProfile.findById(sellerId);
  if (!sellerProfile) {
    throw new ApiError(404, "Seller application not found");
  }
  if (sellerProfile.status === "approved") {
    throw new ApiError(409, "This seller is already approved");
  }

  if (sellerProfile.bankAccountDetails.verificationStatus !== "verified") {
    throw new ApiError(
      400,
      "Bank account details must be verified before this seller can be approved. Use PATCH /admin/sellers/:sellerId/verify-bank first."
    );
  }

  sellerProfile.status = "approved";
  sellerProfile.approvedBy = req.staff._id;
  sellerProfile.approvedAt = new Date();
  sellerProfile.rejectionReason = undefined;
  await sellerProfile.save();

  const user = await User.findByIdAndUpdate(sellerProfile.userId, { role: "seller" }, { new: true }).select(
    "-password -refreshToken"
  );
  if (!user) {
    throw new ApiError(404, "User linked to this seller application no longer exists");
  }

  await logAudit(req.staff, "seller.approve", { type: "SellerProfile", id: sellerProfile._id }, {}, req);

  return res.status(200).json(new ApiResponse(200, { user, sellerProfile }, "Seller approved"));
});

// ---- Reject a seller application ----
const rejectSeller = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;
  const { reason } = req.body;

  const sellerProfile = await SellerProfile.findById(sellerId);
  if (!sellerProfile) {
    throw new ApiError(404, "Seller application not found");
  }

  sellerProfile.status = "rejected";
  sellerProfile.rejectionReason = reason || "Not specified";
  await sellerProfile.save();

  await logAudit(req.staff, "seller.reject", { type: "SellerProfile", id: sellerProfile._id }, { reason }, req);

  return res.status(200).json(new ApiResponse(200, sellerProfile, "Seller application rejected"));
});

// ---- Suspend an already-approved seller (blocks their seller-only routes, keeps the account) ----
const suspendSeller = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;

  const sellerProfile = await SellerProfile.findById(sellerId);
  if (!sellerProfile) {
    throw new ApiError(404, "Seller application not found");
  }
  if (sellerProfile.status !== "approved") {
    throw new ApiError(400, "Only an approved seller can be suspended");
  }

  // 1. Update local admin_db shadow copies
  sellerProfile.status = "suspended";
  await sellerProfile.save();

  const user = await User.findByIdAndUpdate(sellerProfile.userId, { role: "user" }, { new: true }).select(
    "-password -refreshToken"
  );

  await logAudit(req.staff, "seller.suspend", { type: "SellerProfile", id: sellerProfile._id }, {}, req);

  // 2. Propagate to the owning databases — best-effort, non-blocking
  // seller-backend owns the SellerProfile record in seller_db
  propagateCommand(
    process.env.SELLER_BACKEND_INTERNAL_URL,
    "SELLER_SET_STATUS",
    { sellerProfileId: sellerProfile._id.toString(), status: "suspended" }
  );
  // user-backend owns the User record in user_db (role downgrade)
  propagateCommand(
    process.env.USER_BACKEND_INTERNAL_URL,
    "USER_ROLE_UPDATE",
    { userId: sellerProfile.userId.toString(), role: "user" }
  );

  return res.status(200).json(new ApiResponse(200, { user, sellerProfile }, "Seller suspended"));
});

// ---- Verify (or reject) a seller's bank account details — separate from overall seller approval ----
const verifyBankDetails = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;
  const { verificationStatus } = req.body; // "verified" | "rejected"

  if (!["verified", "rejected"].includes(verificationStatus)) {
    throw new ApiError(400, "verificationStatus must be 'verified' or 'rejected'");
  }

  const sellerProfile = await SellerProfile.findById(sellerId);
  if (!sellerProfile) {
    throw new ApiError(404, "Seller application not found");
  }

  sellerProfile.bankAccountDetails.verificationStatus = verificationStatus;
  sellerProfile.bankAccountDetails.verifiedBy = req.staff._id;
  sellerProfile.bankAccountDetails.verifiedAt = new Date();
  await sellerProfile.save();

  await logAudit(
    req.staff,
    "bank.verify",
    { type: "SellerProfile", id: sellerProfile._id },
    { verificationStatus },
    req
  );

  return res.status(200).json(new ApiResponse(200, sellerProfile, `Bank details marked as ${verificationStatus}`));
});

// ---- GET reviews that have at least one report and are still visible ----
const getReportedReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ "reports.0": { $exists: true }, moderationStatus: "visible" })
    .populate("user", "userName email")
    .populate("product", "name slug")
    .sort({ "reports.length": -1, createdAt: -1 });

  return res.status(200).json(new ApiResponse(200, reviews, "Reported reviews fetched successfully"));
});

// ---- GET reviews currently hidden ----
// Added so unhideReview has a discovery path: previously the only review
// listing endpoint (getReportedReviews) excluded hidden reviews by
// definition, so a hidden review's id became unreachable from the API the
// moment it was hidden.
const getHiddenReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ moderationStatus: "hidden" })
    .populate("user", "userName email")
    .populate("product", "name slug")
    .populate("hiddenBy", "fullName companyEmail employeeId")
    .sort({ hiddenAt: -1 });

  return res.status(200).json(new ApiResponse(200, reviews, "Hidden reviews fetched successfully"));
});

// ---- Hide an abusive/policy-violating review — removes it from public view and ratings ----
const hideReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { reason } = req.body;

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  review.moderationStatus = "hidden";
  review.hiddenReason = reason;
  review.hiddenBy = req.staff._id;
  review.hiddenAt = new Date();
  await review.save();

  await recalculateProductRatings(review.product); // hidden reviews no longer count toward the product's rating

  await logAudit(req.staff, "review.hide", { type: "Review", id: review._id }, { reason }, req);

  return res.status(200).json(new ApiResponse(200, review, "Review hidden"));
});

// ---- Restore a previously hidden review ----
const unhideReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  review.moderationStatus = "visible";
  review.hiddenReason = undefined;
  review.hiddenBy = undefined;
  review.hiddenAt = undefined;
  await review.save();

  await recalculateProductRatings(review.product);

  await logAudit(req.staff, "review.unhide", { type: "Review", id: review._id }, {}, req);

  return res.status(200).json(new ApiResponse(200, review, "Review restored"));
});

module.exports = {
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
};