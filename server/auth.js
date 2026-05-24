const { query } = require("./db");
const { verifyToken } = require("./security");

function getBearerToken(request) {
  const header = request.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim();
}

function sanitizeUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireAuth(request, response, next) {
  const token = getBearerToken(request);

  if (!token) {
    response.status(401).json({ message: "Login required." });
    return;
  }

  try {
    const payload = verifyToken(token);
    const rows = await query(
      `SELECT id, full_name, email, role, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [payload.sub]
    );

    if (!rows[0]) {
      response.status(401).json({ message: "Your session is no longer valid." });
      return;
    }

    request.authUser = sanitizeUser(rows[0]);
    next();
  } catch (error) {
    response.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}

function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.authUser) {
      response.status(401).json({ message: "Login required." });
      return;
    }

    if (!roles.includes(request.authUser.role)) {
      response.status(403).json({ message: "You do not have permission to perform this action." });
      return;
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  sanitizeUser,
};
