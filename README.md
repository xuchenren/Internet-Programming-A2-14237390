# StudyHub Academy

StudyHub Academy is a single-page learning platform built for Assignment 2. It extends the Assignment 1 flashcard idea into a fuller real-world workflow with authentication, role-based access, live search, and cross-user learning history. The app is designed for students who want to create study decks, manage flashcards, and log revision sessions, while admins can supervise all user accounts and review platform-wide study activity.

## Why This Project Fits The Assignment

- Uses a modern frontend library: Vue 3.
- Behaves like a single-page application with one main HTML file and dynamic in-page updates.
- Connects a frontend, backend, and MySQL database.
- Covers CRUD across four conceptual entities:
  - `users`
  - `decks`
  - `flashcards`
  - `study_sessions`
- Includes security features such as password hashing, signed JWT-style session tokens, and role-based access control.

## Technical Stack

- Frontend: Vue 3 (browser ESM build)
- Styling: Custom responsive CSS
- Backend: Node.js with Express
- Database: MySQL
- Security: Node `crypto` password hashing and signed tokens
- Data exports: SQL, JSON, and CSV seed files

## Main Features

- Register and log in without leaving the page
- Role-based experiences for `student` and `admin`
- Create, edit, delete, and view study decks
- Create, edit, delete, and view flashcards
- Live search that filters flashcards instantly as the user types
- Study session logging with outcome, duration, and notes
- Admin dashboard for managing users and viewing all learning history
- Friendly validation and error messages when requests fail
- Responsive layout for desktop and mobile screens

## Security Features

- Passwords are hashed before being stored in the database
- Authenticated requests require a signed bearer token
- Admin-only routes are protected on both the frontend and backend
- Sensitive configuration is expected through environment variables rather than hardcoded real credentials

## Demo Accounts

These accounts are seeded in `database/studyhub_learning_platform.sql`.

- Admin
  - Email: `admin@studyhub.test`
  - Password: `StudyHub!2026`
- Student
  - Email: `mia@studyhub.test`
  - Password: `StudyHub!2026`
- Student
  - Email: `liam@studyhub.test`
  - Password: `StudyHub!2026`

## Folder Structure

- `public/`
  - `index.html`: single-page application entry file
  - `app.js`: Vue application logic, UI state, and API calls
  - `styles.css`: responsive styles and visual design system
- `server/`
  - `config.js`: app and database configuration
  - `db.js`: MySQL pool and helper functions
  - `security.js`: password hashing and token signing
  - `auth.js`: authentication and role middleware
  - `validators.js`: payload cleaning and validation helpers
- `database/`
  - `studyhub_learning_platform.sql`: database schema plus seed data
  - `demo_accounts.json`: demo login reference
  - `decks_seed.json`, `flashcards_seed.json`, `flashcards_seed.csv`, `study_sessions_seed.csv`: export examples
- `.env.example`
  - example local environment variables
- `server.js`
  - Express server, static delivery, API routes, and error handling

## How To Run

1. Make sure MySQL Server and Node.js are installed.
2. Create a local environment file or set environment variables using `.env.example` as the reference.
3. Import `database/studyhub_learning_platform.sql` into MySQL.
4. Open a terminal in this project folder.
5. Run `npm install`.
6. Run `npm start`.
7. Open `http://localhost:3000` in your browser.

## Environment Variables

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`

## API Coverage

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Users

- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`

### Decks

- `GET /api/decks`
- `POST /api/decks`
- `PUT /api/decks/:id`
- `DELETE /api/decks/:id`

### Flashcards

- `GET /api/flashcards`
- `POST /api/flashcards`
- `PUT /api/flashcards/:id`
- `DELETE /api/flashcards/:id`

### Study Sessions

- `GET /api/study-sessions`
- `POST /api/study-sessions`
- `PUT /api/study-sessions/:id`
- `DELETE /api/study-sessions/:id`

## Interface / Technical Rationale

- Vue was chosen instead of manual DOM updates from Assignment 1 because the app now has more screens, role states, and concurrent forms, which are easier to manage with reactive state.
- The single-page layout avoids unnecessary reloads and keeps search, filters, and editing states fluid.
- Separate `decks` and `study_sessions` entities make the flashcard system feel more realistic than a single-table CRUD demo.
- Admin-only account management demonstrates role-based security beyond a simple user login.

## Workload Allocation

This repository is currently prepared as an individual submission structure.

- Application architecture, backend routes, database schema, frontend UI, and documentation are all implemented in this project as one cohesive submission.
- If you later convert this to a group submission, add each member's name/student ID and list the files they authored or primarily maintained in this section.

## Notes For Assessment Demo

- Show login as both a student and an admin.
- Demonstrate CRUD for decks, flashcards, and study sessions.
- Show live search filtering flashcards while typing.
- Show the admin page managing users and reviewing all users' study history.
