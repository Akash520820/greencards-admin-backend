const { Router } = require("express");
const {
  createCoupon,
  getAllCoupons,
  validateCoupon,
  deleteCoupon,
} = require("../controllers/coupon.controller");
const { verifyJWT, verifyAdmin } = require("../shared/middleware/auth.middleware");

const router = Router();

// Public / Authenticated route to validate a coupon
router.route("/validate").post(validateCoupon);

// Admin-only routes
router.use(verifyJWT, verifyAdmin);
router.route("/").post(createCoupon).get(getAllCoupons);
router.route("/:couponId").delete(deleteCoupon);

module.exports = router;
