const { Router } = require("express");
const { getSiteContent, updateSiteContent } = require("../controllers/siteContent.controller");
const { verifyJWT, verifyAdmin } = require("../shared/middleware/auth.middleware");
const validate = require("../shared/middleware/validate.middleware");
const { updateSiteContentSchema } = require("../validators/siteContent.validators");

const router = Router();

// public — used by the FAQs, Delivery Information, Return & Refund Policy,
// and Payment Methods pages
router.route("/").get(getSiteContent);

// admin only — lets an admin edit that copy without a redeploy
router
  .route("/")
  .patch(verifyJWT, verifyAdmin, validate({ body: updateSiteContentSchema }), updateSiteContent);

module.exports = router;