const express = require("express");
const fs = require("fs");
const path = require("path");
const { app: appConfig, db: dbConfig } = require("./server/config");
const { pool, query, testConnection } = require("./server/db");
const { requireAuth, requireRole, sanitizeUser } = require("./server/auth");
const { createToken, hashPassword, verifyPassword } = require("./server/security");
const {
  cleanText,
  normalizeEmail,
  validateDeck,
  validateFlashcard,
  validateStudySession,
  validateUser,
} = require("./server/validators");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use("/vendor/vue", express.static(appConfig.vueDistDir));
app.use(express.static(appConfig.publicDir));

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseId(value, label) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, `Invalid ${label} id.`);
  }

  return id;
}

function isAdmin(user) {
  return user.role === "admin";
}

function mapDeck(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    title: row.title,
    description: row.description,
    topic: row.topic,
    visibility: row.visibility,
    cardCount: Number(row.card_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFlashcard(row) {
  return {
    id: row.id,
    deckId: row.deck_id,
    deckTitle: row.deck_title,
    deckTopic: row.deck_topic,
    question: row.question,
    answer: row.answer,
    masteryLevel: row.mastery_level,
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStudySession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    studentName: row.student_name,
    deckId: row.deck_id,
    deckTitle: row.deck_title,
    flashcardId: row.flashcard_id,
    flashcardQuestion: row.flashcard_question,
    outcome: row.outcome,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
    studiedAt: row.studied_at,
    updatedAt: row.updated_at,
  };
}

async function fetchUserWithPasswordByEmail(email) {
  const rows = await query(
    `SELECT id, full_name, email, password_hash, role, created_at, updated_at
     FROM users
     WHERE email = ?`,
    [email]
  );

  return rows[0] || null;
}

async function fetchUserById(id) {
  const rows = await query(
    `SELECT id, full_name, email, role, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [id]
  );

  return rows[0] ? sanitizeUser(rows[0]) : null;
}

async function ensureDeckAccess(deckId, user) {
  const params = [deckId];
  let sql = `
    SELECT d.id, d.owner_id, d.title
    FROM decks d
    WHERE d.id = ?
  `;

  if (!isAdmin(user)) {
    sql += " AND d.owner_id = ?";
    params.push(user.id);
  }

  const rows = await query(sql, params);

  if (!rows[0]) {
    throw createHttpError(404, "Deck not found or not accessible.");
  }

  return rows[0];
}

async function ensureFlashcardAccess(flashcardId, user) {
  const params = [flashcardId];
  let sql = `
    SELECT f.id, f.deck_id, d.owner_id, f.question
    FROM flashcards f
    INNER JOIN decks d ON d.id = f.deck_id
    WHERE f.id = ?
  `;

  if (!isAdmin(user)) {
    sql += " AND d.owner_id = ?";
    params.push(user.id);
  }

  const rows = await query(sql, params);

  if (!rows[0]) {
    throw createHttpError(404, "Flashcard not found or not accessible.");
  }

  return rows[0];
}

async function ensureStudySessionAccess(sessionId, user) {
  const params = [sessionId];
  let sql = `
    SELECT s.id, s.user_id, s.deck_id
    FROM study_sessions s
    WHERE s.id = ?
  `;

  if (!isAdmin(user)) {
    sql += " AND s.user_id = ?";
    params.push(user.id);
  }

  const rows = await query(sql, params);

  if (!rows[0]) {
    throw createHttpError(404, "Study session not found or not accessible.");
  }

  return rows[0];
}

async function ensureFlashcardBelongsToDeck(flashcardId, deckId, user) {
  const params = [flashcardId, deckId];
  let sql = `
    SELECT f.id
    FROM flashcards f
    INNER JOIN decks d ON d.id = f.deck_id
    WHERE f.id = ?
      AND f.deck_id = ?
  `;

  if (!isAdmin(user)) {
    sql += " AND d.owner_id = ?";
    params.push(user.id);
  }

  const rows = await query(sql, params);

  if (!rows[0]) {
    throw createHttpError(400, "The selected flashcard does not belong to the chosen deck.");
  }
}

app.get("/api/health", async (request, response) => {
  try {
    await testConnection();
    response.json({
      status: "ok",
      database: "connected",
      project: "StudyHub Academy",
    });
  } catch (error) {
    response.status(503).json({
      status: "warning",
      database: "disconnected",
      message: "Database connection could not be established.",
    });
  }
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const { user, errors } = validateUser(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    const existingUser = await fetchUserWithPasswordByEmail(user.email);

    if (existingUser) {
      response.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const passwordHash = await hashPassword(user.password);
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES (?, ?, ?, 'student')`,
      [user.fullName, user.email, passwordHash]
    );

    const savedUser = await fetchUserById(result.insertId);
    const token = createToken(savedUser);

    response.status(201).json({
      message: "Account created successfully.",
      token,
      user: savedUser,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const password = typeof request.body.password === "string" ? request.body.password : "";

    if (!email || !password) {
      response.status(400).json({ message: "Email and password are required." });
      return;
    }

    const user = await fetchUserWithPasswordByEmail(email);

    if (!user) {
      response.status(401).json({ message: "Incorrect email or password." });
      return;
    }

    const matches = await verifyPassword(password, user.password_hash);

    if (!matches) {
      response.status(401).json({ message: "Incorrect email or password." });
      return;
    }

    const sanitizedUser = sanitizeUser(user);
    const token = createToken(sanitizedUser);

    response.json({
      message: "Login successful.",
      token,
      user: sanitizedUser,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (request, response) => {
  response.json({ user: request.authUser });
});

app.get("/api/users", requireAuth, requireRole("admin"), async (request, response, next) => {
  try {
    const rows = await query(
      `SELECT id, full_name, email, role, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    response.json({ users: rows.map(sanitizeUser) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireAuth, requireRole("admin"), async (request, response, next) => {
  try {
    const { user, errors } = validateUser(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    const existingUser = await fetchUserWithPasswordByEmail(user.email);

    if (existingUser) {
      response.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const passwordHash = await hashPassword(user.password);
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [user.fullName, user.email, passwordHash, user.role]
    );

    const savedUser = await fetchUserById(result.insertId);

    response.status(201).json({
      message: "User created successfully.",
      user: savedUser,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/users/:id", requireAuth, requireRole("admin"), async (request, response, next) => {
  try {
    const userId = parseId(request.params.id, "user");
    const { user, errors } = validateUser(request.body, { passwordRequired: false });

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    const existingRows = await query(
      `SELECT id, role
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!existingRows[0]) {
      response.status(404).json({ message: "User not found." });
      return;
    }

    const duplicateRows = await query(
      `SELECT id
       FROM users
       WHERE email = ?
         AND id <> ?`,
      [user.email, userId]
    );

    if (duplicateRows[0]) {
      response.status(409).json({ message: "Another user already uses this email address." });
      return;
    }

    if (request.authUser.id === userId && user.role !== "admin") {
      response.status(400).json({ message: "You cannot remove your own admin role." });
      return;
    }

    if (user.password) {
      const passwordHash = await hashPassword(user.password);

      await query(
        `UPDATE users
         SET full_name = ?, email = ?, role = ?, password_hash = ?
         WHERE id = ?`,
        [user.fullName, user.email, user.role, passwordHash, userId]
      );
    } else {
      await query(
        `UPDATE users
         SET full_name = ?, email = ?, role = ?
         WHERE id = ?`,
        [user.fullName, user.email, user.role, userId]
      );
    }

    const savedUser = await fetchUserById(userId);

    response.json({
      message: "User updated successfully.",
      user: savedUser,
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (request, response, next) => {
  try {
    const userId = parseId(request.params.id, "user");

    if (request.authUser.id === userId) {
      response.status(400).json({ message: "You cannot delete your own account while logged in." });
      return;
    }

    const result = await query("DELETE FROM users WHERE id = ?", [userId]);

    if (result.affectedRows === 0) {
      response.status(404).json({ message: "User not found." });
      return;
    }

    response.json({ message: "User deleted successfully." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/decks", requireAuth, async (request, response, next) => {
  try {
    const search = cleanText(request.query.search);
    const params = [];
    let sql = `
      SELECT d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at,
             u.full_name AS owner_name,
             COUNT(f.id) AS card_count
      FROM decks d
      INNER JOIN users u ON u.id = d.owner_id
      LEFT JOIN flashcards f ON f.deck_id = d.id
      WHERE 1 = 1
    `;

    if (!isAdmin(request.authUser)) {
      sql += " AND d.owner_id = ?";
      params.push(request.authUser.id);
    }

    if (search) {
      const like = `%${search}%`;
      sql += " AND (d.title LIKE ? OR d.topic LIKE ? OR d.description LIKE ?)";
      params.push(like, like, like);
    }

    sql += `
      GROUP BY d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at, u.full_name
      ORDER BY d.updated_at DESC
    `;

    const rows = await query(sql, params);

    response.json({ decks: rows.map(mapDeck) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/decks", requireAuth, async (request, response, next) => {
  try {
    const { deck, errors } = validateDeck(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    const result = await query(
      `INSERT INTO decks (owner_id, title, description, topic, visibility)
       VALUES (?, ?, ?, ?, ?)`,
      [request.authUser.id, deck.title, deck.description, deck.topic, deck.visibility]
    );

    const rows = await query(
      `SELECT d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at,
              u.full_name AS owner_name,
              COUNT(f.id) AS card_count
       FROM decks d
       INNER JOIN users u ON u.id = d.owner_id
       LEFT JOIN flashcards f ON f.deck_id = d.id
       WHERE d.id = ?
       GROUP BY d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at, u.full_name`,
      [result.insertId]
    );

    response.status(201).json({
      message: "Deck created successfully.",
      deck: mapDeck(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/decks/:id", requireAuth, async (request, response, next) => {
  try {
    const deckId = parseId(request.params.id, "deck");
    const { deck, errors } = validateDeck(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    await ensureDeckAccess(deckId, request.authUser);

    await query(
      `UPDATE decks
       SET title = ?, description = ?, topic = ?, visibility = ?
       WHERE id = ?`,
      [deck.title, deck.description, deck.topic, deck.visibility, deckId]
    );

    const rows = await query(
      `SELECT d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at,
              u.full_name AS owner_name,
              COUNT(f.id) AS card_count
       FROM decks d
       INNER JOIN users u ON u.id = d.owner_id
       LEFT JOIN flashcards f ON f.deck_id = d.id
       WHERE d.id = ?
       GROUP BY d.id, d.owner_id, d.title, d.description, d.topic, d.visibility, d.created_at, d.updated_at, u.full_name`,
      [deckId]
    );

    response.json({
      message: "Deck updated successfully.",
      deck: mapDeck(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/decks/:id", requireAuth, async (request, response, next) => {
  try {
    const deckId = parseId(request.params.id, "deck");
    await ensureDeckAccess(deckId, request.authUser);

    const result = await query("DELETE FROM decks WHERE id = ?", [deckId]);

    if (result.affectedRows === 0) {
      response.status(404).json({ message: "Deck not found." });
      return;
    }

    response.json({ message: "Deck deleted successfully." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/flashcards", requireAuth, async (request, response, next) => {
  try {
    const search = cleanText(request.query.search);
    const deckId = request.query.deckId ? parseId(request.query.deckId, "deck") : null;
    const params = [];
    let sql = `
      SELECT f.id, f.deck_id, f.question, f.answer, f.mastery_level, f.created_by, f.created_at, f.updated_at,
             d.title AS deck_title,
             d.topic AS deck_topic,
             u.full_name AS author_name
      FROM flashcards f
      INNER JOIN decks d ON d.id = f.deck_id
      INNER JOIN users u ON u.id = f.created_by
      WHERE 1 = 1
    `;

    if (!isAdmin(request.authUser)) {
      sql += " AND d.owner_id = ?";
      params.push(request.authUser.id);
    }

    if (deckId) {
      sql += " AND f.deck_id = ?";
      params.push(deckId);
    }

    if (search) {
      const like = `%${search}%`;
      sql += " AND (f.question LIKE ? OR f.answer LIKE ? OR d.title LIKE ? OR d.topic LIKE ?)";
      params.push(like, like, like, like);
    }

    sql += " ORDER BY f.updated_at DESC";

    const rows = await query(sql, params);

    response.json({ flashcards: rows.map(mapFlashcard) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/flashcards", requireAuth, async (request, response, next) => {
  try {
    const { flashcard, errors } = validateFlashcard(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    await ensureDeckAccess(flashcard.deckId, request.authUser);

    const result = await query(
      `INSERT INTO flashcards (deck_id, question, answer, mastery_level, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        flashcard.deckId,
        flashcard.question,
        flashcard.answer,
        flashcard.masteryLevel,
        request.authUser.id,
      ]
    );

    const rows = await query(
      `SELECT f.id, f.deck_id, f.question, f.answer, f.mastery_level, f.created_by, f.created_at, f.updated_at,
              d.title AS deck_title,
              d.topic AS deck_topic,
              u.full_name AS author_name
       FROM flashcards f
       INNER JOIN decks d ON d.id = f.deck_id
       INNER JOIN users u ON u.id = f.created_by
       WHERE f.id = ?`,
      [result.insertId]
    );

    response.status(201).json({
      message: "Flashcard created successfully.",
      flashcard: mapFlashcard(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/flashcards/:id", requireAuth, async (request, response, next) => {
  try {
    const flashcardId = parseId(request.params.id, "flashcard");
    const { flashcard, errors } = validateFlashcard(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    await ensureFlashcardAccess(flashcardId, request.authUser);
    await ensureDeckAccess(flashcard.deckId, request.authUser);

    await query(
      `UPDATE flashcards
       SET deck_id = ?, question = ?, answer = ?, mastery_level = ?
       WHERE id = ?`,
      [
        flashcard.deckId,
        flashcard.question,
        flashcard.answer,
        flashcard.masteryLevel,
        flashcardId,
      ]
    );

    const rows = await query(
      `SELECT f.id, f.deck_id, f.question, f.answer, f.mastery_level, f.created_by, f.created_at, f.updated_at,
              d.title AS deck_title,
              d.topic AS deck_topic,
              u.full_name AS author_name
       FROM flashcards f
       INNER JOIN decks d ON d.id = f.deck_id
       INNER JOIN users u ON u.id = f.created_by
       WHERE f.id = ?`,
      [flashcardId]
    );

    response.json({
      message: "Flashcard updated successfully.",
      flashcard: mapFlashcard(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/flashcards/:id", requireAuth, async (request, response, next) => {
  try {
    const flashcardId = parseId(request.params.id, "flashcard");
    await ensureFlashcardAccess(flashcardId, request.authUser);

    const result = await query("DELETE FROM flashcards WHERE id = ?", [flashcardId]);

    if (result.affectedRows === 0) {
      response.status(404).json({ message: "Flashcard not found." });
      return;
    }

    response.json({ message: "Flashcard deleted successfully." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/study-sessions", requireAuth, async (request, response, next) => {
  try {
    const params = [];
    const deckId = request.query.deckId ? parseId(request.query.deckId, "deck") : null;
    const userId = request.query.userId ? parseId(request.query.userId, "user") : null;
    let sql = `
      SELECT s.id, s.user_id, s.deck_id, s.flashcard_id, s.outcome, s.duration_minutes, s.notes, s.studied_at, s.updated_at,
             u.full_name AS student_name,
             d.title AS deck_title,
             f.question AS flashcard_question
      FROM study_sessions s
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN decks d ON d.id = s.deck_id
      LEFT JOIN flashcards f ON f.id = s.flashcard_id
      WHERE 1 = 1
    `;

    if (!isAdmin(request.authUser)) {
      sql += " AND s.user_id = ?";
      params.push(request.authUser.id);
    } else if (userId) {
      sql += " AND s.user_id = ?";
      params.push(userId);
    }

    if (deckId) {
      sql += " AND s.deck_id = ?";
      params.push(deckId);
    }

    sql += " ORDER BY s.studied_at DESC, s.updated_at DESC";

    const rows = await query(sql, params);

    response.json({ studySessions: rows.map(mapStudySession) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/study-sessions", requireAuth, async (request, response, next) => {
  try {
    const { session, errors } = validateStudySession(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    await ensureDeckAccess(session.deckId, request.authUser);

    if (session.flashcardId !== null) {
      await ensureFlashcardBelongsToDeck(session.flashcardId, session.deckId, request.authUser);
    }

    const result = await query(
      `INSERT INTO study_sessions (user_id, deck_id, flashcard_id, outcome, duration_minutes, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        request.authUser.id,
        session.deckId,
        session.flashcardId,
        session.outcome,
        session.durationMinutes,
        session.notes,
      ]
    );

    const rows = await query(
      `SELECT s.id, s.user_id, s.deck_id, s.flashcard_id, s.outcome, s.duration_minutes, s.notes, s.studied_at, s.updated_at,
              u.full_name AS student_name,
              d.title AS deck_title,
              f.question AS flashcard_question
       FROM study_sessions s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN decks d ON d.id = s.deck_id
       LEFT JOIN flashcards f ON f.id = s.flashcard_id
       WHERE s.id = ?`,
      [result.insertId]
    );

    response.status(201).json({
      message: "Study session logged successfully.",
      studySession: mapStudySession(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/study-sessions/:id", requireAuth, async (request, response, next) => {
  try {
    const sessionId = parseId(request.params.id, "study session");
    const { session, errors } = validateStudySession(request.body);

    if (errors.length > 0) {
      response.status(400).json({ message: errors.join(" ") });
      return;
    }

    await ensureStudySessionAccess(sessionId, request.authUser);
    await ensureDeckAccess(session.deckId, request.authUser);

    if (session.flashcardId !== null) {
      await ensureFlashcardBelongsToDeck(session.flashcardId, session.deckId, request.authUser);
    }

    await query(
      `UPDATE study_sessions
       SET deck_id = ?, flashcard_id = ?, outcome = ?, duration_minutes = ?, notes = ?
       WHERE id = ?`,
      [
        session.deckId,
        session.flashcardId,
        session.outcome,
        session.durationMinutes,
        session.notes,
        sessionId,
      ]
    );

    const rows = await query(
      `SELECT s.id, s.user_id, s.deck_id, s.flashcard_id, s.outcome, s.duration_minutes, s.notes, s.studied_at, s.updated_at,
              u.full_name AS student_name,
              d.title AS deck_title,
              f.question AS flashcard_question
       FROM study_sessions s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN decks d ON d.id = s.deck_id
       LEFT JOIN flashcards f ON f.id = s.flashcard_id
       WHERE s.id = ?`,
      [sessionId]
    );

    response.json({
      message: "Study session updated successfully.",
      studySession: mapStudySession(rows[0]),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/study-sessions/:id", requireAuth, async (request, response, next) => {
  try {
    const sessionId = parseId(request.params.id, "study session");
    await ensureStudySessionAccess(sessionId, request.authUser);

    const result = await query("DELETE FROM study_sessions WHERE id = ?", [sessionId]);

    if (result.affectedRows === 0) {
      response.status(404).json({ message: "Study session not found." });
      return;
    }

    response.json({ message: "Study session deleted successfully." });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (request, response) => {
  response.status(404).json({ message: "API route not found." });
});

app.get(/^\/(?!api).*/, (request, response) => {
  response.sendFile(path.join(appConfig.publicDir, "index.html"));
});

app.use((error, request, response, next) => {
  console.error(error);

  if (response.headersSent) {
    next(error);
    return;
  }

  if (error.status) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  let message = "Something went wrong on the server.";

  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    message = "Database login failed. Update your DB credentials before running the app.";
  } else if (error.code === "ER_BAD_DB_ERROR") {
    message = "Database not found. Import database/studyhub_learning_platform.sql first.";
  } else if (error.code === "ECONNREFUSED") {
    message = "MySQL is not running. Start the MySQL service and try again.";
  } else if (error.code === "ER_DUP_ENTRY") {
    message = "A duplicate value was submitted. Please check your email or unique fields.";
  }

  if (request.path.startsWith("/api")) {
    response.status(500).json({ message });
    return;
  }

  response.status(500).send("Server error.");
});

async function startServer() {
  if (!fs.existsSync(appConfig.vueDistDir)) {
    console.warn("Vue was not found in node_modules. Run npm install before opening the frontend.");
  }

  try {
    await testConnection();
    console.log("Connected to MySQL successfully.");
  } catch (error) {
    console.warn("MySQL connection could not be verified during startup.");
    console.warn("The web app will still start, but authenticated CRUD actions will fail until MySQL is configured.");

    if (dbConfig.password === "CHANGE_ME") {
      console.warn("Update your DB password using environment variables or a local .env workflow before running CRUD actions.");
    }
  }

  if (appConfig.jwtSecret === "development-only-secret-change-me") {
    console.warn("JWT_SECRET is using the development fallback. Set a strong secret for production or assessment demos.");
  }

  app.listen(appConfig.port, () => {
    console.log(`StudyHub Academy is running at http://localhost:${appConfig.port}`);
  });
}

async function shutdown() {
  try {
    await pool.end();
  } catch (error) {
    console.error("Error while closing the database pool.", error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();
