require("dotenv").config();
const app = require("./app");
const connectDB = require("./shared/db/index");
const logger = require("./shared/utils/logger");
const startKeepAlive = require("./shared/utils/keepAlive");

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
