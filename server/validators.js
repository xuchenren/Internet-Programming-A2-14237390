function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeUser(payload = {}) {
  return {
    fullName: cleanText(payload.fullName),
    email: normalizeEmail(payload.email),
    password: typeof payload.password === "string" ? payload.password : "",
    role: payload.role === "admin" ? "admin" : "student",
  };
}

function validateUser(payload, options = {}) {
  const user = normalizeUser(payload);
  const errors = [];
  const passwordRequired = options.passwordRequired !== false;

  if (user.fullName.length < 2 || user.fullName.length > 80) {
    errors.push("Full name must be between 2 and 80 characters.");
  }

  if (!isValidEmail(user.email) || user.email.length > 120) {
    errors.push("Please enter a valid email address.");
  }

  if (passwordRequired && (user.password.length < 8 || user.password.length > 120)) {
    errors.push("Password must be between 8 and 120 characters.");
  }

  if (!passwordRequired && user.password && (user.password.length < 8 || user.password.length > 120)) {
    errors.push("If you update the password, it must be between 8 and 120 characters.");
  }

  return { user, errors };
}

function normalizeDeck(payload = {}) {
  return {
    title: cleanText(payload.title),
    description: cleanText(payload.description),
    topic: cleanText(payload.topic),
    visibility: payload.visibility === "shared" ? "shared" : "private",
  };
}

function validateDeck(payload) {
  const deck = normalizeDeck(payload);
  const errors = [];

  if (deck.title.length < 3 || deck.title.length > 120) {
    errors.push("Deck title must be between 3 and 120 characters.");
  }

  if (deck.description.length < 10 || deck.description.length > 800) {
    errors.push("Deck description must be between 10 and 800 characters.");
  }

  if (deck.topic.length < 2 || deck.topic.length > 80) {
    errors.push("Topic must be between 2 and 80 characters.");
  }

  return { deck, errors };
}

function normalizeFlashcard(payload = {}) {
  const masteryLevel = Number(payload.masteryLevel);

  return {
    deckId: Number(payload.deckId),
    question: cleanText(payload.question),
    answer: cleanText(payload.answer),
    masteryLevel: Number.isFinite(masteryLevel) ? masteryLevel : 3,
  };
}

function validateFlashcard(payload) {
  const flashcard = normalizeFlashcard(payload);
  const errors = [];

  if (!Number.isInteger(flashcard.deckId) || flashcard.deckId <= 0) {
    errors.push("Please choose a valid deck.");
  }

  if (flashcard.question.length < 4 || flashcard.question.length > 255) {
    errors.push("Question must be between 4 and 255 characters.");
  }

  if (flashcard.answer.length < 4 || flashcard.answer.length > 1800) {
    errors.push("Answer must be between 4 and 1800 characters.");
  }

  if (!Number.isInteger(flashcard.masteryLevel) || flashcard.masteryLevel < 1 || flashcard.masteryLevel > 5) {
    errors.push("Mastery level must be between 1 and 5.");
  }

  return { flashcard, errors };
}

function normalizeStudySession(payload = {}) {
  return {
    deckId: Number(payload.deckId),
    flashcardId: payload.flashcardId ? Number(payload.flashcardId) : null,
    outcome: cleanText(payload.outcome),
    durationMinutes: Number(payload.durationMinutes),
    notes: cleanText(payload.notes),
  };
}

function validateStudySession(payload) {
  const session = normalizeStudySession(payload);
  const errors = [];
  const allowedOutcomes = ["Needs review", "Good progress", "Mastered"];

  if (!Number.isInteger(session.deckId) || session.deckId <= 0) {
    errors.push("Please choose a valid deck.");
  }

  if (session.flashcardId !== null && (!Number.isInteger(session.flashcardId) || session.flashcardId <= 0)) {
    errors.push("Please choose a valid flashcard.");
  }

  if (!allowedOutcomes.includes(session.outcome)) {
    errors.push("Outcome must be Needs review, Good progress, or Mastered.");
  }

  if (!Number.isInteger(session.durationMinutes) || session.durationMinutes < 1 || session.durationMinutes > 180) {
    errors.push("Duration must be between 1 and 180 minutes.");
  }

  if (session.notes.length > 500) {
    errors.push("Notes must be 500 characters or fewer.");
  }

  return { session, errors };
}

module.exports = {
  cleanText,
  normalizeEmail,
  validateDeck,
  validateFlashcard,
  validateStudySession,
  validateUser,
};
