const { Sequelize } = require("sequelize");
const mysql2 = require("mysql2");
require("dotenv").config();

const useSSL = process.env.DB_SSL === "true";

const commonOptions = {
  dialect: "mysql",
  dialectModule: mysql2,
  logging: false,
  // Serverless ke liye chhota pool
  pool: { max: 2, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: useSSL
    ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } }
    : {},
};

const sequelize = new Sequelize(
  process.env.DB_NAME || "shop_management",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    ...commonOptions,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
  },
);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ MySQL connected.");
    return true;
  } catch (error) {
    console.error("❌ MySQL failed:", error.message);
    throw error;
  }
};

const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ alter: !force, force });
    console.log("✅ Database synced");
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
    throw error;
  }
};

module.exports = { sequelize, testConnection, syncDatabase };
