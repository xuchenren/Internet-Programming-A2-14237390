const crypto = require("crypto");
const { app } = require("./config");

const PASSWORD_KEY_LENGTH = 64;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signHmac(value) {
  return crypto.createHmac("sha256", app.jwtSecret).update(value).digest("base64url");
}

function parseStoredHash(hash = "") {
  const [salt, derivedKey] = hash.split(":");

  if (!salt || !derivedKey) {
    return null;
  }

  return { salt, derivedKey };
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const parsedHash = parseStoredHash(storedHash);

  if (!parsedHash) {
    return false;
  }

  const expected = Buffer.from(parsedHash.derivedKey, "hex");
  const candidate = await scryptAsync(password, parsedHash.salt);

  if (expected.length !== candidate.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, candidate);
}

function createToken(user) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const payload = {
    sub: String(user.id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + app.tokenLifetimeSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signHmac(unsignedToken);

  return `${unsignedToken}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== "string") {
    throw new Error("Invalid token.");
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid token structure.");
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signHmac(unsignedToken);

  if (providedSignature.length !== expectedSignature.length) {
    throw new Error("Invalid token signature.");
  }

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid token signature.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));

  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired.");
  }

  return payload;
}

module.exports = {
  createToken,
  hashPassword,
  verifyPassword,
  verifyToken,
};
