const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");

  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
}

module.exports = {
  app: {
    port: Number(process.env.PORT) || 3000,
    publicDir: path.join(__dirname, "..", "public"),
    vueDistDir: path.join(__dirname, "..", "node_modules", "vue", "dist"),
    jwtSecret: process.env.JWT_SECRET || "development-only-secret-change-me",
    tokenLifetimeSeconds: 60 * 60 * 12,
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "CHANGE_ME",
    database: process.env.DB_NAME || "studyhub_learning_platform",
    connectionLimit: 10,
  },
};
