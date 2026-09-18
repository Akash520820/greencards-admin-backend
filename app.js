const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");

const notFound = require("./shared/middleware/notFound.middleware");
const errorHandler = require("./shared/middleware/errorHandler.middleware");
const { apiLimiter } = require("./shared/middleware/rateLimiter.middleware");

const adminRouter = require("./routes/admin.routes");
const categoryRouter = require("./routes/category.routes");
const couponRouter = require("./routes/coupon.routes");
const siteContentRouter = require("./routes/siteContent.routes");

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(apiLimiter);

// Admin Microservice Routes
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/coupons", couponRouter);
app.use("/api/v1/site-content", siteContentRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
