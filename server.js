require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { sequelize, testConnection, syncDatabase } = require("./models");

// Import core routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/productRoutes");
const salesRoutes = require("./routes/salesRoutes");
const customerRoutes = require("./routes/customerRoutes");
const employeeRoutes = require("./routes/employees");
const expenseRoutes = require("./routes/expense");
const categoryRoutes = require("./routes/categories");
const inventoryRoutes = require("./routes/inventoryRoutes");
const locationRoutes = require("./routes/locations");
const notificationRoutes = require("./routes/notifications");
const shopSettingsRoutes = require("./routes/shopSettings");
const dashboardRoutes = require("./routes/dashboardRoutes");
const backupRoutes = require("./routes/backup");
const backupManagerRoutes = require("./routes/backupManager");

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === "1";

// Helper function to get local IP address
function getLocalIP() {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const LOCAL_IP = getLocalIP();
console.log(`🌐 Detected local IP: ${LOCAL_IP}`);

// ============================================
// MIDDLEWARE
// ============================================
app.use(
  cors({
    origin: [
      "https://shop-software-frontend.vercel.app",
      "http://localhost:5173",
      `http://${LOCAL_IP}:5173`,
      "http://127.0.0.1:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Parse JSON and urlencoded data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static files for uploads - sirf local par (Vercel par disk read-only hai)
if (!isVercel && process.env.NODE_ENV !== "production") {
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log("📁 Uploads directory created");
  }
  app.use("/uploads", express.static(uploadsDir));
}

// ============================================
// CORE ROUTES
// ============================================
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/shop-settings", shopSettingsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/return-exchange", require("./routes/returnExchange"));

// Backup routes
app.use("/api/backup", backupRoutes);
app.use("/api/backup-manager", backupManagerRoutes);

// ============================================
// TEST AND HEALTH ROUTES
// ============================================
app.get("/api/test", (req, res) => {
  res.json({
    message: "Server is running",
    time: new Date().toISOString(),
    serverIp: LOCAL_IP,
    routes: [
      "/api/auth",
      "/api/products",
      "/api/sales",
      "/api/customers",
      "/api/employees",
      "/api/expenses",
      "/api/categories",
      "/api/inventory",
      "/api/locations",
      "/api/notifications",
      "/api/shop-settings",
      "/api/dashboard",
      "/api/backup",
      "/api/backup-manager",
      "/api/test",
      "/api/health",
    ],
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running",
    database: process.env.DB_NAME,
    environment: process.env.NODE_ENV || "development",
    serverIp: LOCAL_IP,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Shop Management System API",
    version: "1.0.0",
    serverIp: LOCAL_IP,
    documentation: "Use /api/health for status, /api/test for route list",
  });
});

// ============================================
// 404 HANDLER - Must be after all routes
// ============================================
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
    availableRoutes: "/api/test",
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  // Vercel Logs mein asal error nazar aaye is liye logging on hai
  console.error("❌ Server error:", err);

  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      message: "Validation error",
      errors: err.errors.map((e) => e.message),
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(400).json({
      message: "Duplicate entry",
      errors: err.errors.map((e) => e.message),
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      message: "Referenced record does not exist",
    });
  }

  if (err.name === "SequelizeDatabaseError") {
    return res.status(400).json({
      message: "Database error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token expired" });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large. Max size: 5MB" });
  }

  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ============================================
// START SERVER (sirf local par)
// ============================================
const startServer = async () => {
  try {
    console.log("🔄 Starting server...");
    console.log("🔄 Testing database connection...");

    await testConnection();
    console.log("✅ Database connection successful");

    console.log("🔄 Syncing database...");
    await syncDatabase(false);
    console.log("✅ Database sync completed");

    app.listen(PORT, "0.0.0.0", () => {
      console.log("\n=================================");
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Database: ${process.env.DB_NAME}`);
      console.log("=================================\n");
      console.log(`🔗 Local URL: http://localhost:${PORT}/api/test`);
      console.log(`📡 Network URL: http://${LOCAL_IP}:${PORT}/api/test`);
      console.log(`📱 Access from other devices: http://${LOCAL_IP}:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);

    if (
      error.name === "SequelizeConnectionError" ||
      error.name === "SequelizeConnectionRefusedError"
    ) {
      console.error("\n📌 Database connection failed. Please check:");
      console.error("   - MySQL server is running");
      console.error("   - Database credentials in .env file");
      console.error("   - Database name exists");
      console.error("   - MySQL port (default: 3306) is correct");
      console.error("   - Network connectivity\n");

      console.error("📋 Your current .env settings:");
      console.error(`   DB_HOST: ${process.env.DB_HOST || "localhost"}`);
      console.error(`   DB_PORT: ${process.env.DB_PORT || 3306}`);
      console.error(`   DB_NAME: ${process.env.DB_NAME || "shop_management"}`);
      console.error(`   DB_USER: ${process.env.DB_USER || "root"}`);
      console.error(
        `   DB_PASSWORD: ${process.env.DB_PASSWORD ? "********" : "(empty)"}`,
      );
    }

    process.exit(1);
  }
};

if (!isVercel) {
  // Local development: process handlers + server start
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled Rejection:", error);
    process.exit(1);
  });

  process.on("SIGTERM", () => {
    console.log("🛑 SIGTERM received. Closing server...");
    sequelize.close().then(() => {
      console.log("✅ Database connection closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("🛑 SIGINT received. Closing server...");
    sequelize.close().then(() => {
      console.log("✅ Database connection closed");
      process.exit(0);
    });
  });

  startServer();
}

// Vercel ke liye app export zaroori hai
module.exports = app;
