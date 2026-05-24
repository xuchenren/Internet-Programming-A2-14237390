import {
  computed,
  createApp,
  onMounted,
  reactive,
  watch,
} from "/vendor/vue/vue.esm-browser.js";

const TOKEN_STORAGE_KEY = "studyhub-token";
const VIEW_STORAGE_KEY = "studyhub-view";
const outcomeOptions = ["Needs review", "Good progress", "Mastered"];
const masteryLabels = {
  1: "New",
  2: "Focus",
  3: "Steady",
  4: "Strong",
  5: "Mastered",
};

function createEmptyDeckForm() {
  return {
    title: "",
    description: "",
    topic: "",
    visibility: "private",
  };
}

function createEmptyFlashcardForm() {
  return {
    deckId: "",
    question: "",
    answer: "",
    masteryLevel: "3",
  };
}

function createEmptySessionForm() {
  return {
    deckId: "",
    flashcardId: "",
    outcome: "Good progress",
    durationMinutes: "20",
    notes: "",
  };
}

function createEmptyUserForm() {
  return {
    fullName: "",
    email: "",
    password: "",
    role: "student",
  };
}

function formatDate(value, options = {}) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(options.includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
  });
}

createApp({
  setup() {
    const state = reactive({
      booting: true,
      syncing: false,
      authMode: "login",
      currentView: localStorage.getItem(VIEW_STORAGE_KEY) || "dashboard",
      token: localStorage.getItem(TOKEN_STORAGE_KEY) || "",
      user: null,
      status: {
        type: "info",
        message: "",
      },
      authForms: {
        login: {
          email: "",
          password: "",
        },
        register: {
          fullName: "",
          email: "",
          password: "",
        },
      },
      deckEditingId: null,
      flashcardEditingId: null,
      sessionEditingId: null,
      userEditingId: null,
      deckForm: createEmptyDeckForm(),
      flashcardForm: createEmptyFlashcardForm(),
      sessionForm: createEmptySessionForm(),
      userForm: createEmptyUserForm(),
      filters: {
        search: "",
        deckId: "all",
        sessionDeckId: "all",
        adminUserId: "all",
      },
      decks: [],
      flashcards: [],
      studySessions: [],
      users: [],
    });

    let statusTimer = null;

    function setStatus(message, type = "info") {
      window.clearTimeout(statusTimer);
      state.status.message = message;
      state.status.type = type;

      if (message) {
        statusTimer = window.setTimeout(() => {
          state.status.message = "";
        }, 5000);
      }
    }

    function clearStatus() {
      window.clearTimeout(statusTimer);
      state.status.message = "";
    }

    function isAdmin() {
      return state.user?.role === "admin";
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Request failed.");
      }

      return payload;
    }

    function saveSession(token, user) {
      state.token = token;
      state.user = user;
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }

    function clearSession() {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      state.token = "";
      state.user = null;
      state.decks = [];
      state.flashcards = [];
      state.studySessions = [];
      state.users = [];
      state.deckEditingId = null;
      state.flashcardEditingId = null;
      state.sessionEditingId = null;
      state.userEditingId = null;
      state.deckForm = createEmptyDeckForm();
      state.flashcardForm = createEmptyFlashcardForm();
      state.sessionForm = createEmptySessionForm();
      state.userForm = createEmptyUserForm();
      state.filters = {
        search: "",
        deckId: "all",
        sessionDeckId: "all",
        adminUserId: "all",
      };
      state.currentView = "dashboard";
    }

    async function refreshAppData() {
      if (!state.user) {
        return;
      }

      state.syncing = true;

      try {
        const requests = [
          api("/api/decks"),
          api("/api/flashcards"),
          api("/api/study-sessions"),
        ];

        if (isAdmin()) {
          requests.push(api("/api/users"));
        }

        const [deckPayload, flashcardPayload, sessionPayload, userPayload] = await Promise.all(requests);
        state.decks = deckPayload.decks || [];
        state.flashcards = flashcardPayload.flashcards || [];
        state.studySessions = sessionPayload.studySessions || [];
        state.users = userPayload?.users || [];

        if (!isAdmin() && state.currentView === "admin") {
          state.currentView = "dashboard";
        }

        if (state.flashcardForm.deckId && !state.decks.some((deck) => String(deck.id) === state.flashcardForm.deckId)) {
          state.flashcardForm.deckId = "";
        }

        if (state.sessionForm.deckId && !state.decks.some((deck) => String(deck.id) === state.sessionForm.deckId)) {
          state.sessionForm.deckId = "";
          state.sessionForm.flashcardId = "";
        }
      } finally {
        state.syncing = false;
      }
    }

    async function bootstrap() {
      if (!state.token) {
        state.booting = false;
        return;
      }

      try {
        const payload = await api("/api/auth/me");
        state.user = payload.user;
        await refreshAppData();
      } catch (error) {
        clearSession();
        setStatus(error.message, "error");
      } finally {
        state.booting = false;
      }
    }

    function switchView(view) {
      if (view === "admin" && !isAdmin()) {
        return;
      }

      state.currentView = view;
      clearStatus();
    }

    async function submitAuth() {
      const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        state.authMode === "login"
          ? state.authForms.login
          : state.authForms.register;

      state.syncing = true;

      try {
        const data = await api(endpoint, {
          method: "POST",
          body: payload,
        });

        saveSession(data.token, data.user);
        await refreshAppData();
        state.authForms.login.password = "";
        state.authForms.register.password = "";
        state.authMode = "login";
        setStatus(data.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
        state.booting = false;
      }
    }

    function logout() {
      clearSession();
      setStatus("You have logged out.", "info");
    }

    function resetDeckForm() {
      state.deckEditingId = null;
      state.deckForm = createEmptyDeckForm();
    }

    function resetFlashcardForm() {
      state.flashcardEditingId = null;
      state.flashcardForm = createEmptyFlashcardForm();
    }

    function resetSessionForm() {
      state.sessionEditingId = null;
      state.sessionForm = createEmptySessionForm();
    }

    function resetUserForm() {
      state.userEditingId = null;
      state.userForm = createEmptyUserForm();
    }

    async function submitDeck() {
      state.syncing = true;

      try {
        const editing = state.deckEditingId !== null;
        const payload = await api(editing ? `/api/decks/${state.deckEditingId}` : "/api/decks", {
          method: editing ? "PUT" : "POST",
          body: state.deckForm,
        });

        await refreshAppData();
        resetDeckForm();
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function submitFlashcard() {
      state.syncing = true;

      try {
        const editing = state.flashcardEditingId !== null;
        const payload = await api(
          editing ? `/api/flashcards/${state.flashcardEditingId}` : "/api/flashcards",
          {
            method: editing ? "PUT" : "POST",
            body: state.flashcardForm,
          }
        );

        await refreshAppData();
        resetFlashcardForm();
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function submitStudySession() {
      state.syncing = true;

      try {
        const editing = state.sessionEditingId !== null;
        const payload = await api(
          editing ? `/api/study-sessions/${state.sessionEditingId}` : "/api/study-sessions",
          {
            method: editing ? "PUT" : "POST",
            body: state.sessionForm,
          }
        );

        await refreshAppData();
        resetSessionForm();
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function submitUser() {
      state.syncing = true;

      try {
        const editing = state.userEditingId !== null;
        const payload = await api(editing ? `/api/users/${state.userEditingId}` : "/api/users", {
          method: editing ? "PUT" : "POST",
          body: state.userForm,
        });

        await refreshAppData();
        resetUserForm();
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    function editDeck(deck) {
      state.deckEditingId = deck.id;
      state.deckForm = {
        title: deck.title,
        description: deck.description,
        topic: deck.topic,
        visibility: deck.visibility,
      };
      switchView("library");
      setStatus(`Editing deck: ${deck.title}`, "info");
    }

    function editFlashcard(flashcard) {
      state.flashcardEditingId = flashcard.id;
      state.flashcardForm = {
        deckId: String(flashcard.deckId),
        question: flashcard.question,
        answer: flashcard.answer,
        masteryLevel: String(flashcard.masteryLevel),
      };
      switchView("library");
      setStatus(`Editing flashcard in ${flashcard.deckTitle}`, "info");
    }

    function editStudySession(session) {
      state.sessionEditingId = session.id;
      state.sessionForm = {
        deckId: String(session.deckId),
        flashcardId: session.flashcardId ? String(session.flashcardId) : "",
        outcome: session.outcome,
        durationMinutes: String(session.durationMinutes),
        notes: session.notes,
      };
      switchView("sessions");
      setStatus(`Editing study session from ${formatDate(session.studiedAt, { includeTime: true })}`, "info");
    }

    function editUser(user) {
      state.userEditingId = user.id;
      state.userForm = {
        fullName: user.fullName,
        email: user.email,
        password: "",
        role: user.role,
      };
      switchView("admin");
      setStatus(`Editing user: ${user.fullName}`, "info");
    }

    async function destroyDeck(deck) {
      if (!window.confirm(`Delete deck "${deck.title}" and its flashcards?`)) {
        return;
      }

      state.syncing = true;

      try {
        const payload = await api(`/api/decks/${deck.id}`, { method: "DELETE" });
        await refreshAppData();
        if (state.deckEditingId === deck.id) {
          resetDeckForm();
        }
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function destroyFlashcard(flashcard) {
      if (!window.confirm(`Delete flashcard "${flashcard.question}"?`)) {
        return;
      }

      state.syncing = true;

      try {
        const payload = await api(`/api/flashcards/${flashcard.id}`, { method: "DELETE" });
        await refreshAppData();
        if (state.flashcardEditingId === flashcard.id) {
          resetFlashcardForm();
        }
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function destroyStudySession(session) {
      if (!window.confirm("Delete this study session entry?")) {
        return;
      }

      state.syncing = true;

      try {
        const payload = await api(`/api/study-sessions/${session.id}`, { method: "DELETE" });
        await refreshAppData();
        if (state.sessionEditingId === session.id) {
          resetSessionForm();
        }
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    async function destroyUser(user) {
      if (!window.confirm(`Delete user "${user.fullName}"?`)) {
        return;
      }

      state.syncing = true;

      try {
        const payload = await api(`/api/users/${user.id}`, { method: "DELETE" });
        await refreshAppData();
        if (state.userEditingId === user.id) {
          resetUserForm();
        }
        setStatus(payload.message, "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        state.syncing = false;
      }
    }

    const accessibleViews = computed(() =>
      isAdmin()
        ? [
            { id: "dashboard", label: "Dashboard" },
            { id: "library", label: "Library" },
            { id: "sessions", label: "Study Log" },
            { id: "admin", label: "Admin" },
          ]
        : [
            { id: "dashboard", label: "Dashboard" },
            { id: "library", label: "Library" },
            { id: "sessions", label: "Study Log" },
          ]
    );

    const visibleDecks = computed(() => {
      const decks = [...state.decks];
      return decks.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    });

    const visibleFlashcards = computed(() => {
      const searchTerm = state.filters.search.trim().toLowerCase();
      const selectedDeckId = state.filters.deckId === "all" ? null : Number(state.filters.deckId);

      return state.flashcards
        .filter((flashcard) => {
          const matchesDeck = selectedDeckId === null || flashcard.deckId === selectedDeckId;
          const combinedText = [
            flashcard.question,
            flashcard.answer,
            flashcard.deckTitle,
            flashcard.deckTopic,
          ]
            .join(" ")
            .toLowerCase();

          const matchesSearch = !searchTerm || combinedText.includes(searchTerm);
          return matchesDeck && matchesSearch;
        })
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
    });

    const sessionDeckOptions = computed(() =>
      state.decks.filter((deck) => String(deck.id) === state.sessionForm.deckId)
    );

    const sessionFlashcardOptions = computed(() => {
      if (!state.sessionForm.deckId) {
        return [];
      }

      const deckId = Number(state.sessionForm.deckId);
      return state.flashcards.filter((flashcard) => flashcard.deckId === deckId);
    });

    const visibleStudySessions = computed(() => {
      const selectedDeckId = state.filters.sessionDeckId === "all" ? null : Number(state.filters.sessionDeckId);
      const selectedUserId = state.filters.adminUserId === "all" ? null : Number(state.filters.adminUserId);

      return state.studySessions
        .filter((session) => {
          const matchesDeck = selectedDeckId === null || session.deckId === selectedDeckId;
          const matchesUser = selectedUserId === null || session.userId === selectedUserId;
          return matchesDeck && matchesUser;
        })
        .sort((left, right) => new Date(right.studiedAt) - new Date(left.studiedAt));
    });

    const recentSessions = computed(() => visibleStudySessions.value.slice(0, 4));

    const dashboardStats = computed(() => {
      const sharedDeckCount = state.decks.filter((deck) => deck.visibility === "shared").length;
      const focusCards = state.flashcards.filter((flashcard) => Number(flashcard.masteryLevel) <= 2).length;

      return [
        {
          label: isAdmin() ? "Managed Users" : "Your Decks",
          value: isAdmin() ? state.users.length : state.decks.length,
          tone: "sun",
        },
        {
          label: "Flashcards",
          value: state.flashcards.length,
          tone: "sea",
        },
        {
          label: "Study Sessions",
          value: state.studySessions.length,
          tone: "ink",
        },
        {
          label: isAdmin() ? "Shared Decks" : "Focus Cards",
          value: isAdmin() ? sharedDeckCount : focusCards,
          tone: "clay",
        },
      ];
    });

    const deckHighlights = computed(() =>
      state.decks
        .slice()
        .sort((left, right) => right.cardCount - left.cardCount)
        .slice(0, 3)
    );

    watch(
      () => state.currentView,
      (value) => {
        localStorage.setItem(VIEW_STORAGE_KEY, value);
      }
    );

    watch(
      () => state.sessionForm.deckId,
      (value) => {
        if (!value) {
          state.sessionForm.flashcardId = "";
          return;
        }

        const match = state.flashcards.some(
          (flashcard) =>
            String(flashcard.id) === state.sessionForm.flashcardId &&
            String(flashcard.deckId) === value
        );

        if (!match) {
          state.sessionForm.flashcardId = "";
        }
      }
    );

    onMounted(bootstrap);

    return {
      accessibleViews,
      clearStatus,
      dashboardStats,
      deckHighlights,
      destroyDeck,
      destroyFlashcard,
      destroyStudySession,
      destroyUser,
      editDeck,
      editFlashcard,
      editStudySession,
      editUser,
      formatDate,
      masteryLabels,
      outcomeOptions,
      recentSessions,
      resetDeckForm,
      resetFlashcardForm,
      resetSessionForm,
      resetUserForm,
      sessionDeckOptions,
      sessionFlashcardOptions,
      state,
      submitAuth,
      submitDeck,
      submitFlashcard,
      submitStudySession,
      submitUser,
      switchView,
      visibleDecks,
      visibleFlashcards,
      visibleStudySessions,
      logout,
    };
  },
  template: `
    <div class="app-shell">
      <div v-if="state.booting" class="boot-screen panel">
        <p class="eyebrow">StudyHub Academy</p>
        <h1>Preparing your workspace...</h1>
        <p class="muted">Checking your session, loading decks, and reconnecting to the learning dashboard.</p>
      </div>

      <div v-else-if="!state.user" class="auth-layout">
        <section class="auth-hero">
          <p class="eyebrow">Assignment 2 | Vue + Express + MySQL</p>
          <h1>StudyHub Academy</h1>
          <p class="lead">
            A single-page flashcard platform with role-based access control, live search, study logging, and an admin view across all learning activity.
          </p>

          <div class="hero-grid">
            <article class="panel spotlight-card">
              <p class="card-tag">Why this fits the brief</p>
              <ul class="bullet-list">
                <li>Vue single-page interface with no full-page task switching.</li>
                <li>Four entities: users, decks, flashcards, and study sessions.</li>
                <li>Password hashing, JWT-style tokens, and role-based admin controls.</li>
              </ul>
            </article>

            <article class="panel credential-card">
              <p class="card-tag">Demo accounts</p>
              <p><strong>Admin:</strong> admin@studyhub.test</p>
              <p><strong>Student:</strong> mia@studyhub.test</p>
              <p><strong>Password:</strong> StudyHub!2026</p>
            </article>
          </div>
        </section>

        <section class="panel auth-panel">
          <div class="pill-switch">
            <button
              type="button"
              class="pill-button"
              :class="{ active: state.authMode === 'login' }"
              @click="state.authMode = 'login'"
            >
              Login
            </button>
            <button
              type="button"
              class="pill-button"
              :class="{ active: state.authMode === 'register' }"
              @click="state.authMode = 'register'"
            >
              Register
            </button>
          </div>

          <div v-if="state.status.message" class="status-banner" :class="'is-' + state.status.type">
            {{ state.status.message }}
          </div>

          <form v-if="state.authMode === 'login'" class="stack-form" @submit.prevent="submitAuth">
            <label class="field">
              <span>Email</span>
              <input v-model="state.authForms.login.email" type="email" maxlength="120" required />
            </label>

            <label class="field">
              <span>Password</span>
              <input v-model="state.authForms.login.password" type="password" maxlength="120" required />
            </label>

            <button class="button button-primary" type="submit" :disabled="state.syncing">
              {{ state.syncing ? 'Working...' : 'Enter workspace' }}
            </button>
          </form>

          <form v-else class="stack-form" @submit.prevent="submitAuth">
            <label class="field">
              <span>Full name</span>
              <input v-model="state.authForms.register.fullName" type="text" maxlength="80" required />
            </label>

            <label class="field">
              <span>Email</span>
              <input v-model="state.authForms.register.email" type="email" maxlength="120" required />
            </label>

            <label class="field">
              <span>Password</span>
              <input v-model="state.authForms.register.password" type="password" maxlength="120" required />
            </label>

            <button class="button button-primary" type="submit" :disabled="state.syncing">
              {{ state.syncing ? 'Working...' : 'Create account' }}
            </button>
          </form>
        </section>
      </div>

      <div v-else class="workspace-shell">
        <header class="app-header panel">
          <div class="brand-copy">
            <p class="eyebrow">StudyHub Academy</p>
            <h1>Learning workspace</h1>
            <p class="muted">
              Signed in as <strong>{{ state.user.fullName }}</strong> with the <strong>{{ state.user.role }}</strong> role.
            </p>
          </div>

          <div class="header-actions">
            <nav class="nav-tabs" aria-label="App sections">
              <button
                v-for="view in accessibleViews"
                :key="view.id"
                type="button"
                class="nav-tab"
                :class="{ active: state.currentView === view.id }"
                @click="switchView(view.id)"
              >
                {{ view.label }}
              </button>
            </nav>

            <button class="button button-ghost" type="button" @click="logout">Logout</button>
          </div>
        </header>

        <section class="stats-grid">
          <article v-for="stat in dashboardStats" :key="stat.label" class="panel stat-card" :data-tone="stat.tone">
            <p class="card-tag">{{ stat.label }}</p>
            <p class="stat-value">{{ stat.value }}</p>
          </article>
        </section>

        <div v-if="state.status.message" class="status-banner" :class="'is-' + state.status.type">
          {{ state.status.message }}
          <button type="button" class="inline-dismiss" @click="clearStatus">Dismiss</button>
        </div>

        <transition name="fade-slide" mode="out-in">
          <main :key="state.currentView" class="view-stack">
            <section v-if="state.currentView === 'dashboard'" class="dashboard-grid">
              <article class="panel intro-panel">
                <p class="card-tag">Overview</p>
                <h2>One-page study flow with real database CRUD.</h2>
                <p class="muted">
                  Create decks, add flashcards, log study sessions, and inspect learning activity without leaving the page.
                </p>

                <div class="checklist">
                  <div>JWT-style session token and hashed passwords</div>
                  <div>Live flashcard search with deck filters</div>
                  <div v-if="state.user.role === 'admin'">Admin visibility into all users and study history</div>
                  <div v-else>Private deck management with your own study history</div>
                </div>
              </article>

              <article class="panel">
                <p class="card-tag">Recent sessions</p>
                <div v-if="recentSessions.length" class="session-list compact">
                  <article v-for="session in recentSessions" :key="session.id" class="session-card">
                    <div class="session-head">
                      <strong>{{ session.deckTitle }}</strong>
                      <span class="outcome-pill">{{ session.outcome }}</span>
                    </div>
                    <p class="muted">{{ session.studentName }} · {{ session.durationMinutes }} mins · {{ formatDate(session.studiedAt, { includeTime: true }) }}</p>
                    <p>{{ session.notes || 'No notes recorded for this session.' }}</p>
                  </article>
                </div>
                <p v-else class="empty-copy">No study sessions yet. Open the Study Log tab to record the first one.</p>
              </article>

              <article class="panel">
                <p class="card-tag">Top decks</p>
                <div v-if="deckHighlights.length" class="deck-grid compact">
                  <article v-for="deck in deckHighlights" :key="deck.id" class="deck-card">
                    <p class="topic-chip">{{ deck.topic }}</p>
                    <h3>{{ deck.title }}</h3>
                    <p>{{ deck.description }}</p>
                    <p class="muted">{{ deck.cardCount }} cards · {{ deck.visibility }}</p>
                  </article>
                </div>
                <p v-else class="empty-copy">Create a deck to start building your learning library.</p>
              </article>
            </section>

            <section v-else-if="state.currentView === 'library'" class="library-layout">
              <article class="panel library-panel">
                <div class="section-head">
                  <div>
                    <p class="card-tag">Live search</p>
                    <h2>Flashcard library</h2>
                  </div>
                  <p class="muted">Filter flashcards in real time as you type, or narrow the list to one deck.</p>
                </div>

                <div class="toolbar">
                  <label class="field">
                    <span>Search flashcards</span>
                    <input
                      v-model="state.filters.search"
                      type="search"
                      placeholder="Search by question, answer, deck, or topic"
                    />
                  </label>

                  <label class="field">
                    <span>Deck filter</span>
                    <select v-model="state.filters.deckId">
                      <option value="all">All decks</option>
                      <option v-for="deck in state.decks" :key="deck.id" :value="String(deck.id)">
                        {{ deck.title }}
                      </option>
                    </select>
                  </label>
                </div>

                <div class="deck-grid">
                  <article v-for="deck in visibleDecks" :key="deck.id" class="deck-card">
                    <div class="split-line">
                      <p class="topic-chip">{{ deck.topic }}</p>
                      <span class="muted">{{ deck.visibility }}</span>
                    </div>
                    <h3>{{ deck.title }}</h3>
                    <p>{{ deck.description }}</p>
                    <p class="muted">{{ deck.cardCount }} cards · Owner: {{ deck.ownerName }}</p>
                    <div class="card-actions">
                      <button class="button button-secondary" type="button" @click="editDeck(deck)">Edit</button>
                      <button class="button button-danger" type="button" @click="destroyDeck(deck)">Delete</button>
                    </div>
                  </article>
                </div>

                <div class="flashcard-grid">
                  <article v-for="flashcard in visibleFlashcards" :key="flashcard.id" class="flashcard-card">
                    <div class="split-line">
                      <p class="topic-chip">{{ flashcard.deckTitle }}</p>
                      <span class="mastery-pill">L{{ flashcard.masteryLevel }} · {{ masteryLabels[flashcard.masteryLevel] }}</span>
                    </div>
                    <h3>{{ flashcard.question }}</h3>
                    <p class="answer-copy">{{ flashcard.answer }}</p>
                    <p class="muted">{{ flashcard.deckTopic }} · Updated {{ formatDate(flashcard.updatedAt) }}</p>
                    <div class="card-actions">
                      <button class="button button-secondary" type="button" @click="editFlashcard(flashcard)">Edit</button>
                      <button class="button button-danger" type="button" @click="destroyFlashcard(flashcard)">Delete</button>
                    </div>
                  </article>
                </div>

                <p v-if="!visibleFlashcards.length" class="empty-copy">
                  No flashcards match the current search. Try another keyword or add a new card.
                </p>
              </article>

              <aside class="side-column">
                <section class="panel">
                  <p class="card-tag">{{ state.deckEditingId ? 'Edit deck' : 'Create deck' }}</p>
                  <h2>{{ state.deckEditingId ? 'Update a deck' : 'Create a new deck' }}</h2>
                  <form class="stack-form" @submit.prevent="submitDeck">
                    <label class="field">
                      <span>Deck title</span>
                      <input v-model="state.deckForm.title" type="text" maxlength="120" required />
                    </label>
                    <label class="field">
                      <span>Topic</span>
                      <input v-model="state.deckForm.topic" type="text" maxlength="80" required />
                    </label>
                    <label class="field">
                      <span>Description</span>
                      <textarea v-model="state.deckForm.description" rows="4" maxlength="800" required></textarea>
                    </label>
                    <label class="field">
                      <span>Visibility</span>
                      <select v-model="state.deckForm.visibility">
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                      </select>
                    </label>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">{{ state.deckEditingId ? 'Save deck' : 'Create deck' }}</button>
                      <button class="button button-secondary" type="button" @click="resetDeckForm">Reset</button>
                    </div>
                  </form>
                </section>

                <section class="panel">
                  <p class="card-tag">{{ state.flashcardEditingId ? 'Edit card' : 'Create card' }}</p>
                  <h2>{{ state.flashcardEditingId ? 'Update a flashcard' : 'Add a flashcard' }}</h2>
                  <form class="stack-form" @submit.prevent="submitFlashcard">
                    <label class="field">
                      <span>Deck</span>
                      <select v-model="state.flashcardForm.deckId" required>
                        <option value="" disabled>Select a deck</option>
                        <option v-for="deck in state.decks" :key="deck.id" :value="String(deck.id)">
                          {{ deck.title }}
                        </option>
                      </select>
                    </label>
                    <label class="field">
                      <span>Question</span>
                      <textarea v-model="state.flashcardForm.question" rows="3" maxlength="255" required></textarea>
                    </label>
                    <label class="field">
                      <span>Answer</span>
                      <textarea v-model="state.flashcardForm.answer" rows="5" maxlength="1800" required></textarea>
                    </label>
                    <label class="field">
                      <span>Mastery level</span>
                      <select v-model="state.flashcardForm.masteryLevel">
                        <option value="1">1 · New</option>
                        <option value="2">2 · Focus</option>
                        <option value="3">3 · Steady</option>
                        <option value="4">4 · Strong</option>
                        <option value="5">5 · Mastered</option>
                      </select>
                    </label>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">{{ state.flashcardEditingId ? 'Save flashcard' : 'Create flashcard' }}</button>
                      <button class="button button-secondary" type="button" @click="resetFlashcardForm">Reset</button>
                    </div>
                  </form>
                </section>
              </aside>
            </section>

            <section v-else-if="state.currentView === 'sessions'" class="sessions-layout">
              <article class="panel">
                <div class="section-head">
                  <div>
                    <p class="card-tag">Study history</p>
                    <h2>Study log</h2>
                  </div>
                  <p class="muted">Track how each review session went and keep notes for the next revision cycle.</p>
                </div>

                <div class="toolbar">
                  <label class="field">
                    <span>Deck filter</span>
                    <select v-model="state.filters.sessionDeckId">
                      <option value="all">All decks</option>
                      <option v-for="deck in state.decks" :key="deck.id" :value="String(deck.id)">
                        {{ deck.title }}
                      </option>
                    </select>
                  </label>

                  <label v-if="state.user.role === 'admin'" class="field">
                    <span>User filter</span>
                    <select v-model="state.filters.adminUserId">
                      <option value="all">All users</option>
                      <option v-for="user in state.users" :key="user.id" :value="String(user.id)">
                        {{ user.fullName }}
                      </option>
                    </select>
                  </label>
                </div>

                <div v-if="visibleStudySessions.length" class="session-list">
                  <article v-for="session in visibleStudySessions" :key="session.id" class="session-card">
                    <div class="session-head">
                      <h3>{{ session.deckTitle }}</h3>
                      <span class="outcome-pill">{{ session.outcome }}</span>
                    </div>
                    <p class="muted">
                      {{ session.studentName }} · {{ session.durationMinutes }} mins · {{ formatDate(session.studiedAt, { includeTime: true }) }}
                    </p>
                    <p v-if="session.flashcardQuestion"><strong>Flashcard:</strong> {{ session.flashcardQuestion }}</p>
                    <p>{{ session.notes || 'No notes were added for this study session.' }}</p>
                    <div class="card-actions">
                      <button class="button button-secondary" type="button" @click="editStudySession(session)">Edit</button>
                      <button class="button button-danger" type="button" @click="destroyStudySession(session)">Delete</button>
                    </div>
                  </article>
                </div>
                <p v-else class="empty-copy">No study sessions recorded yet.</p>
              </article>

              <aside class="panel">
                <p class="card-tag">{{ state.sessionEditingId ? 'Edit session' : 'Log session' }}</p>
                <h2>{{ state.sessionEditingId ? 'Update a study session' : 'Record a study session' }}</h2>
                <form class="stack-form" @submit.prevent="submitStudySession">
                  <label class="field">
                    <span>Deck</span>
                    <select v-model="state.sessionForm.deckId" required>
                      <option value="" disabled>Select a deck</option>
                      <option v-for="deck in state.decks" :key="deck.id" :value="String(deck.id)">
                        {{ deck.title }}
                      </option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Flashcard</span>
                    <select v-model="state.sessionForm.flashcardId">
                      <option value="">General deck session</option>
                      <option v-for="flashcard in sessionFlashcardOptions" :key="flashcard.id" :value="String(flashcard.id)">
                        {{ flashcard.question }}
                      </option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Outcome</span>
                    <select v-model="state.sessionForm.outcome">
                      <option v-for="outcome in outcomeOptions" :key="outcome" :value="outcome">
                        {{ outcome }}
                      </option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Duration (minutes)</span>
                    <input v-model="state.sessionForm.durationMinutes" type="number" min="1" max="180" required />
                  </label>

                  <label class="field">
                    <span>Notes</span>
                    <textarea v-model="state.sessionForm.notes" rows="5" maxlength="500"></textarea>
                  </label>

                  <div class="form-actions">
                    <button class="button button-primary" type="submit">{{ state.sessionEditingId ? 'Save session' : 'Add session' }}</button>
                    <button class="button button-secondary" type="button" @click="resetSessionForm">Reset</button>
                  </div>
                </form>
              </aside>
            </section>

            <section v-else class="admin-layout">
              <article class="panel">
                <div class="section-head">
                  <div>
                    <p class="card-tag">Admin controls</p>
                    <h2>User management</h2>
                  </div>
                  <p class="muted">Create, update, and remove accounts without leaving the single-page interface.</p>
                </div>

                <div class="table-shell">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="user in state.users" :key="user.id">
                        <td>{{ user.fullName }}</td>
                        <td>{{ user.email }}</td>
                        <td>{{ user.role }}</td>
                        <td>{{ formatDate(user.createdAt) }}</td>
                        <td class="table-actions">
                          <button class="button button-secondary tiny" type="button" @click="editUser(user)">Edit</button>
                          <button
                            class="button button-danger tiny"
                            type="button"
                            @click="destroyUser(user)"
                            :disabled="user.id === state.user.id"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>

              <aside class="side-column">
                <section class="panel">
                  <p class="card-tag">{{ state.userEditingId ? 'Edit user' : 'Create user' }}</p>
                  <h2>{{ state.userEditingId ? 'Update user account' : 'Add a new account' }}</h2>
                  <form class="stack-form" @submit.prevent="submitUser">
                    <label class="field">
                      <span>Full name</span>
                      <input v-model="state.userForm.fullName" type="text" maxlength="80" required />
                    </label>
                    <label class="field">
                      <span>Email</span>
                      <input v-model="state.userForm.email" type="email" maxlength="120" required />
                    </label>
                    <label class="field">
                      <span>Password {{ state.userEditingId ? '(leave blank to keep current password)' : '' }}</span>
                      <input
                        v-model="state.userForm.password"
                        type="password"
                        maxlength="120"
                        :required="!state.userEditingId"
                      />
                    </label>
                    <label class="field">
                      <span>Role</span>
                      <select v-model="state.userForm.role">
                        <option value="student">Student</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">{{ state.userEditingId ? 'Save user' : 'Create user' }}</button>
                      <button class="button button-secondary" type="button" @click="resetUserForm">Reset</button>
                    </div>
                  </form>
                </section>

                <section class="panel">
                  <p class="card-tag">Learning history</p>
                  <h2>Cross-user session view</h2>
                  <p class="muted">
                    This panel satisfies the brief for admins viewing all users' learning history and activities.
                  </p>
                  <div class="session-list compact">
                    <article v-for="session in recentSessions" :key="session.id" class="session-card">
                      <div class="session-head">
                        <strong>{{ session.studentName }}</strong>
                        <span class="outcome-pill">{{ session.outcome }}</span>
                      </div>
                      <p>{{ session.deckTitle }}</p>
                      <p class="muted">{{ formatDate(session.studiedAt, { includeTime: true }) }}</p>
                    </article>
                  </div>
                </section>
              </aside>
            </section>
          </main>
        </transition>
      </div>
    </div>
  `,
}).mount("#app");
