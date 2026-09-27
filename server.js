require("dotenv").config();
const app = require("./app");
const connectDB = require("./shared/db/index");
const logger = require("./shared/utils/logger");
const startKeepAlive = require("./shared/utils/keepAlive");

// ─── Fail-fast: required env vars ────────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "STAFF_ACCESS_TOKEN_SECRET",
  "STAFF_REFRESH_TOKEN_SECRET",
];
const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[admin-backend] Missing required environment variables: ${missing.join(", ")}`);
  console.error("Set them in your .env file (local) or Render Dashboard (production).");
  process.exit(1);
}

const PORT = process.env.PORT || process.env.ADMIN_SERVICE_PORT || 5003;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`🛠️ Admin Microservice running on port ${PORT}`);
      console.log(`🛠️ Admin Microservice running on port ${PORT}`);
    });
    // Start keep-alive self-pinging on Render
    startKeepAlive();
  })
  .catch((err) => {
    logger.error("MongoDB connection failed in Admin Microservice:", err);
    process.exit(1);
  });
