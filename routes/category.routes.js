const { Router } = require("express");
const {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.controller");
const { verifyJWT, verifyAdmin } = require("../shared/middleware/auth.middleware");
const upload = require("../shared/middleware/multer.middleware");
const validate = require("../shared/middleware/validate.middleware");
const {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
} = require("../validators/category.validators");

const router = Router();

// public routes
router.route("/").get(getAllCategories);
router.route("/:slug").get(getCategoryBySlug);

// admin-only routes — multer runs before validate() since it populates
// req.body on these multipart/form-data routes
router
  .route("/")
  .post(verifyJWT, verifyAdmin, upload.single("image"), validate({ body: createCategorySchema }), createCategory);
router
  .route("/:categoryId")
  .patch(
    verifyJWT,
    verifyAdmin,
    upload.single("image"),
    validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
    updateCategory
  )
  .delete(verifyJWT, verifyAdmin, validate({ params: categoryIdParamSchema }), deleteCategory);

module.exports = router;
