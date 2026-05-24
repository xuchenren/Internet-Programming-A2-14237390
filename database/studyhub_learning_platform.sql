DROP DATABASE IF EXISTS studyhub_learning_platform;
CREATE DATABASE studyhub_learning_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studyhub_learning_platform;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'student') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE decks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(800) NOT NULL,
  topic VARCHAR(80) NOT NULL,
  visibility ENUM('private', 'shared') NOT NULL DEFAULT 'private',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_decks_owner
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE flashcards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deck_id INT NOT NULL,
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  mastery_level TINYINT UNSIGNED NOT NULL DEFAULT 3,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_flashcards_deck
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  CONSTRAINT fk_flashcards_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE study_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  deck_id INT NOT NULL,
  flashcard_id INT NULL,
  outcome ENUM('Needs review', 'Good progress', 'Mastered') NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 15,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  studied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_deck
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcards(id) ON DELETE SET NULL
);

INSERT INTO users (full_name, email, password_hash, role) VALUES
('Avery Chen', 'admin@studyhub.test', 'd41b7f8ebc21e51a5244fa59042a9f2d:a53dd1ff7edd2300460d5e8162c2e1d6385cc720d92f057d361a82d0559d47447e2598b3c1ceedf56ebc2d79f09d6d19c1902233bbd0abbca26c70c97f8c5362', 'admin'),
('Mia Patel', 'mia@studyhub.test', '203dc36cf1b8733bf51a5a54f0527a15:07d6349e69dcfc70bade2398bb1e7e91ba86d8103d5e68331aeb5600313d2b4fc7ac3f9b94711a38f41e722881f1bfc5fe07fa766e95dc2314b721afe38a2850', 'student'),
('Liam Nguyen', 'liam@studyhub.test', '2a67ef9fcc3d2f0098d2fdc2a2dc1c99:ebfc02b8766436443d2fc26467559c53551d88eb756588c471fe3436f1c855e9a0eddfe70ab2a1edf9f3d3210bed612b846c27e6f45347cbebb48e4bbd7c1edc', 'student');

INSERT INTO decks (owner_id, title, description, topic, visibility) VALUES
(2, 'JavaScript Interview Essentials', 'Core frontend revision deck covering browser events, component lifecycles, and application security for technical interview prep.', 'Frontend', 'shared'),
(2, 'Database Revision Sprint', 'Short-answer cards for SQL design, relationships, indexing, and transactions while preparing for lab quizzes.', 'Data Systems', 'private'),
(3, 'UX Writing Warmups', 'Practice prompts for concise interface copy, accessibility wording, and tone consistency in product design.', 'UX Writing', 'shared');

INSERT INTO flashcards (deck_id, question, answer, mastery_level, created_by) VALUES
(1, 'What is event delegation in JavaScript?', 'Event delegation attaches one listener to a parent element and reacts to bubbled events from matching child elements.', 2, 2),
(1, 'Why is the cleanup function in useEffect important?', 'It prevents stale subscriptions, duplicate listeners, and memory leaks when a component rerenders or unmounts.', 3, 2),
(2, 'What does a foreign key do in a relational database?', 'A foreign key links a child row to a parent row and helps preserve referential integrity between tables.', 4, 2),
(2, 'Why are transactions useful in database-backed apps?', 'Transactions group related queries so they either all succeed together or all roll back together after an error.', 2, 2),
(3, 'What makes a button label more accessible?', 'A good button label uses an action verb, avoids ambiguity, and stays understandable without surrounding context.', 5, 3),
(1, 'What is JWT commonly used for in a web application?', 'JWT is commonly used to carry signed session claims so the server can verify authentication and role data on later requests.', 3, 2),
(3, 'What is microcopy in interface design?', 'Microcopy is the short text around controls, feedback, and forms that helps users understand what to do next.', 4, 3);

INSERT INTO study_sessions (user_id, deck_id, flashcard_id, outcome, duration_minutes, notes, studied_at) VALUES
(2, 1, 1, 'Needs review', 25, 'Still mixing up bubbling and capturing in explanations.', '2026-05-20 18:30:00'),
(2, 2, 4, 'Good progress', 30, 'Transaction examples make more sense after the lab practice.', '2026-05-21 20:15:00'),
(2, 1, 2, 'Mastered', 18, 'Comfortable explaining cleanup with real React examples now.', '2026-05-22 19:10:00'),
(3, 3, 5, 'Good progress', 22, 'Good reminder to prefer specific button labels over generic wording.', '2026-05-22 21:40:00'),
(2, 1, 6, 'Good progress', 27, 'JWT flow is clear, but I still want to review expiry handling.', '2026-05-23 09:05:00');
