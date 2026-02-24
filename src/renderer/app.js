// ===== STATE =====
const state = {
  currentUser: null,
  isRunning: false,
  timerStart: null,
  timerInterval: null,
  currentView: "timer",
  entries: [],
  reportRange: "this-week",
  reportEntries: [],
};

const USER_COLORS = {
  alice: "#b45309",
  bob: "#0369a1",
  carol: "#4d7c0f",
};

const PROJECT_COLORS = [
  "#b45309", "#0369a1", "#4d7c0f", "#a21caf",
  "#c2410c", "#0e7490", "#6d28d9", "#be123c",
];

// ===== DOM ELEMENTS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const loginOverlay = $("#login-overlay");
const appEl = $("#app");
const timerView = $("#timer-view");
const reportsView = $("#reports-view");
const taskInput = $("#task-input");
const projectInput = $("#project-input");
const tagInput = $("#tag-input");
const timerDisplay = $("#timer-display");
const timerBtn = $("#timer-btn");
const playIcon = $("#play-icon");
const stopIcon = $("#stop-icon");
const entriesList = $("#entries-list");
const entriesEmpty = $("#entries-empty");
const entriesLoading = $("#entries-loading");
const headerAvatar = $("#header-avatar");
const headerUsername = $("#header-username");
const userDropdown = $("#user-dropdown");
const aiInput = $("#ai-input");
const aiResponse = $("#ai-response");
const aiLoading = $("#ai-loading");
const seedBtn = $("#seed-btn");

let durationChart = null;
let projectChart = null;

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  // Login cards
  $$(".user-card").forEach((card) =>
    card.addEventListener("click", () => login(card.dataset.user))
  );
  renderCustomUserCards();

  // Custom user login
  const customInput = $("#custom-user-input");
  const customBtn = $("#custom-user-btn");
  customBtn.addEventListener("click", () => {
    const name = customInput.value.trim().toLowerCase();
    if (name) login(name);
  });
  customInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const name = customInput.value.trim().toLowerCase();
      if (name) login(name);
    }
  });

  // Nav tabs
  $$(".nav-tab").forEach((tab) =>
    tab.addEventListener("click", () => switchView(tab.dataset.view))
  );

  // User menu
  $("#user-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", () =>
    userDropdown.classList.add("hidden")
  );
  $("#logout-btn").addEventListener("click", logout);

  // Timer
  timerBtn.addEventListener("click", toggleTimer);
  taskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && taskInput.value.trim()) toggleTimer();
  });

  // Report shortcuts
  $$(".shortcut-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      $$(".shortcut-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.reportRange = btn.dataset.range;
      loadReport();
    })
  );

  // AI query
  $("#ai-send-btn").addEventListener("click", sendAiQuery);
  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendAiQuery();
  });

  seedBtn.addEventListener("click", handleSeedData);
});

const BUILTIN_USERS = ["alice", "bob", "carol"];

function getCustomUsers() {
  try {
    return JSON.parse(localStorage.getItem("customUsers") || "[]");
  } catch { return []; }
}

function saveCustomUser(userId) {
  if (BUILTIN_USERS.includes(userId)) return;
  const users = getCustomUsers();
  if (!users.includes(userId)) {
    users.push(userId);
    localStorage.setItem("customUsers", JSON.stringify(users));
  }
}

function removeCustomUser(userId) {
  const users = getCustomUsers().filter((u) => u !== userId);
  localStorage.setItem("customUsers", JSON.stringify(users));
  renderCustomUserCards();
  renderUserDropdown();
}

function renderCustomUserCards() {
  const container = document.getElementById("custom-user-cards");
  if (!container) return;
  container.innerHTML = "";
  const users = getCustomUsers();
  users.forEach((userId) => {
    const wrapper = document.createElement("div");
    wrapper.className = "user-card-wrapper";
    const btn = document.createElement("button");
    btn.className = "user-card";
    btn.innerHTML = `<div class="avatar" style="background: ${getUserColor(userId)}">${userId[0].toUpperCase()}</div><span>${userId.charAt(0).toUpperCase() + userId.slice(1)}</span>`;
    btn.addEventListener("click", () => login(userId));
    const removeBtn = document.createElement("button");
    removeBtn.className = "user-card-remove";
    removeBtn.innerHTML = "×";
    removeBtn.title = "Remove user";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeCustomUser(userId);
    });
    wrapper.appendChild(btn);
    wrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
  });
}

function renderUserDropdown() {
  const list = document.getElementById("user-dropdown-list");
  if (!list) return;
  list.innerHTML = "";
  const allUsers = [...BUILTIN_USERS, ...getCustomUsers()];
  allUsers
    .filter((u) => u !== state.currentUser)
    .forEach((userId) => {
      const btn = document.createElement("button");
      btn.className = "dropdown-item";
      const color = USER_COLORS[userId] || getUserColor(userId);
      btn.innerHTML = `<div class="avatar-xs" style="--avatar-color: ${color}">${userId[0].toUpperCase()}</div> ${userId.charAt(0).toUpperCase() + userId.slice(1)}`;
      btn.addEventListener("click", () => login(userId));
      list.appendChild(btn);
    });
}

// ===== USER MANAGEMENT =====
function login(userId) {
  state.currentUser = userId;
  const color = USER_COLORS[userId] || getUserColor(userId);

  // Persist custom users
  saveCustomUser(userId);

  loginOverlay.classList.add("hidden");
  appEl.classList.remove("hidden");

  headerAvatar.textContent = userId[0].toUpperCase();
  headerAvatar.style.background = color;
  headerUsername.textContent = userId.charAt(0).toUpperCase() + userId.slice(1);
  userDropdown.classList.add("hidden");

  renderUserDropdown();

  // Clear AI section
  aiInput.value = "";
  aiResponse.innerHTML = "";
  aiResponse.classList.add("hidden");

  // Clear custom input
  $("#custom-user-input").value = "";

  // Reset timer
  if (state.isRunning) stopTimerSilent();

  fetchEntries();
  if (state.currentView === "reports") loadReport();
}

function getUserColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 40%)`;
}

function logout() {
  if (state.isRunning) stopTimerSilent();
  state.currentUser = null;
  state.entries = [];
  appEl.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
  userDropdown.classList.add("hidden");
  aiResponse.innerHTML = "";
  aiResponse.classList.add("hidden");
  aiInput.value = "";
  renderCustomUserCards();
}

// ===== VIEW SWITCHING =====
function switchView(view) {
  state.currentView = view;
  $$(".nav-tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === view)
  );
  timerView.classList.toggle("hidden", view !== "timer");
  reportsView.classList.toggle("hidden", view !== "reports");

  if (view === "reports") loadReport();
}

// ===== TIMER =====
function toggleTimer() {
  if (state.isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  const desc = taskInput.value.trim();
  if (!desc) {
    taskInput.focus();
    taskInput.style.outline = "2px solid var(--timer-active)";
    setTimeout(() => (taskInput.style.outline = ""), 1500);
    return;
  }

  state.isRunning = true;
  state.timerStart = new Date();

  timerBtn.classList.add("running");
  timerDisplay.classList.add("running");
  playIcon.classList.add("hidden");
  stopIcon.classList.remove("hidden");
  taskInput.readOnly = true;
  taskInput.style.opacity = "0.7";

  state.timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

async function stopTimer() {
  if (!state.isRunning) return;

  const stopTime = new Date();
  const duration = Math.round((stopTime - state.timerStart) / 1000);

  const entry = {
    userId: state.currentUser,
    description: taskInput.value.trim(),
    project: projectInput.value.trim() || undefined,
    tag: tagInput.value.trim() || undefined,
    startTime: state.timerStart.toISOString(),
    stopTime: stopTime.toISOString(),
    duration,
  };

  stopTimerSilent();

  // Save via MCP
  try {
    // Optimistically add to local list immediately
    const optimisticEntry = { ...entry, id: "pending-" + Date.now() };
    state.entries.unshift(optimisticEntry);
    renderEntries();

    taskInput.value = "";
    projectInput.value = "";
    tagInput.value = "";

    const result = await window.api.saveEntry(entry);
    if (!result.success) {
      console.error("Failed to save entry:", result.error);
    }
    // Refresh in background to sync IDs, but don't show loading
    window.api.queryEntries(state.currentUser).then((entries) => {
      if (entries && entries.length) {
        state.entries = entries;
        renderEntries();
      }
    }).catch(() => {});
  } catch (err) {
    console.error("Save error:", err);
  }
}

function stopTimerSilent() {
  state.isRunning = false;
  state.timerStart = null;
  clearInterval(state.timerInterval);
  state.timerInterval = null;

  timerBtn.classList.remove("running");
  timerDisplay.classList.remove("running");
  timerDisplay.textContent = "0:00:00";
  playIcon.classList.remove("hidden");
  stopIcon.classList.add("hidden");
  taskInput.readOnly = false;
  taskInput.style.opacity = "1";
}

function updateTimerDisplay() {
  if (!state.timerStart) return;
  const elapsed = Math.round((Date.now() - state.timerStart.getTime()) / 1000);
  timerDisplay.textContent = formatDuration(elapsed);
}

// ===== ENTRIES =====
async function fetchEntries() {
  if (!state.currentUser) return;

  entriesLoading.classList.remove("hidden");
  entriesEmpty.classList.add("hidden");
  entriesList.innerHTML = "";

  try {
    const entries = await window.api.queryEntries(state.currentUser);
    state.entries = entries || [];
    renderEntries();
  } catch (err) {
    console.error("Fetch error:", err);
    state.entries = [];
    renderEntries();
  } finally {
    entriesLoading.classList.add("hidden");
  }
}

async function handleSeedData() {
  if (!state.currentUser) return;
  seedBtn.disabled = true;
  seedBtn.textContent = "Loading...";
  try {
    const result = await window.api.seedData(state.currentUser);
    if (result.success) {
      await fetchEntries();
    } else {
      seedBtn.textContent = "Failed — try again";
      seedBtn.disabled = false;
    }
  } catch (err) {
    console.error("Seed error:", err);
    seedBtn.textContent = "Failed — try again";
    seedBtn.disabled = false;
  }
}

function renderEntries() {
  entriesList.innerHTML = "";

  if (!state.entries.length) {
    seedBtn.textContent = "Load sample data";
    seedBtn.disabled = false;
    entriesEmpty.classList.remove("hidden");
    return;
  }
  entriesEmpty.classList.add("hidden");

  const groups = groupByDay(state.entries);
  groups.forEach(([date, dayEntries]) => {
    const totalSec = dayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
    const group = document.createElement("div");
    group.className = "day-group";

    group.innerHTML = `
      <div class="day-header">
        <div class="day-title">${formatDateLabel(date)}</div>
        <div class="day-total">${formatDuration(totalSec)}</div>
      </div>
    `;

    dayEntries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "entry-row";
      const projectColor = entry.project ? getProjectColor(entry.project) : null;
      if (projectColor) row.style.borderLeftColor = projectColor;
      const projectHtml = entry.project
        ? `<div class="entry-project"><div class="project-dot" style="background:${getProjectColor(entry.project)}"></div>${entry.project}</div>`
        : "";
      const tagHtml = entry.tag
        ? `<div class="entry-tag">${entry.tag}</div>`
        : "";

      row.innerHTML = `
        <div class="entry-desc">${escapeHtml(entry.description)}</div>
        ${projectHtml}
        ${tagHtml}
        <div class="entry-time">${formatTimeRange(entry.startTime, entry.stopTime)}</div>
        <div class="entry-duration">${formatDuration(entry.duration || 0)}</div>
      `;
      group.appendChild(row);
    });

    entriesList.appendChild(group);
  });
}

// ===== REPORTS =====
async function loadReport() {
  if (!state.currentUser) return;

  const range = getDateRange(state.reportRange);
  $("#date-label").textContent = formatRangeLabel(state.reportRange, range);

  try {
    const entries = await window.api.queryEntries(
      state.currentUser,
      range.start,
      range.end
    );
    state.reportEntries = entries || [];
    renderSummary();
    renderCharts(range);
  } catch (err) {
    console.error("Report error:", err);
  }
}

function renderSummary() {
  const entries = state.reportEntries;
  const totalSec = entries.reduce((s, e) => s + (e.duration || 0), 0);
  const days = new Set(entries.map((e) => e.startTime?.split("T")[0])).size || 1;
  const avgHours = (totalSec / 3600 / days).toFixed(2);

  $("#total-hours").textContent = formatDuration(totalSec);
  $("#avg-hours").textContent = avgHours;
  $("#entry-count").textContent = entries.length;
}

function renderCharts(range) {
  const entries = state.reportEntries;
  renderDurationChart(entries, range);
  renderProjectChart(entries);
}

function renderDurationChart(entries, range) {
  const ctx = $("#duration-chart");
  if (durationChart) durationChart.destroy();

  const days = getDaysInRange(range.start, range.end);
  const durationByDay = {};
  days.forEach((d) => (durationByDay[d] = 0));
  entries.forEach((e) => {
    const day = e.startTime?.split("T")[0];
    if (day && durationByDay[day] !== undefined) {
      durationByDay[day] += e.duration || 0;
    }
  });

  const labels = days.map((d) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short" }) +
      " " + dt.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
  });
  const data = days.map((d) => durationByDay[d] / 60); // minutes

  durationChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Duration (m)",
        data,
        backgroundColor: "#d97706",
        borderRadius: 4,
        maxBarThickness: 48,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatDuration(Math.round(ctx.raw * 60)),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => {
              const h = Math.floor(v / 60);
              return h > 0 ? h + "h" : v + "m";
            },
            font: { family: "DM Sans", size: 11 },
            color: "#a8a29e",
          },
          grid: { color: "#f0ece7" },
        },
        x: {
          ticks: { font: { family: "DM Sans", size: 11 }, color: "#78716c" },
          grid: { display: false },
        },
      },
    },
  });
}

function renderProjectChart(entries) {
  const ctx = $("#project-chart");
  if (projectChart) projectChart.destroy();

  const byProject = {};
  entries.forEach((e) => {
    const p = e.project || "(no project)";
    byProject[p] = (byProject[p] || 0) + (e.duration || 0);
  });

  const sorted = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([p]) => p);
  const data = sorted.map(([, d]) => d / 3600);
  const colors = labels.map((p) => getProjectColor(p));

  projectChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            boxWidth: 10,
            padding: 12,
            font: { family: "DM Sans", size: 12 },
            color: "#57534e",
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(0) : 0;
              return `${ctx.label}: ${ctx.raw.toFixed(1)}h (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ===== AI QUERY =====
async function sendAiQuery() {
  const question = aiInput.value.trim();
  if (!question || !state.currentUser) return;

  aiResponse.innerHTML = "";
  aiResponse.classList.remove("hidden");
  aiLoading.classList.remove("hidden");
  $("#ai-send-btn").disabled = true;

  let streamedText = "";

  try {
    // Start the query — streaming chunks arrive via separate event
    const responsePromise = window.api.aiQuery(question, state.currentUser);

    // Wait for the full response (chunks are rendered progressively below)
    const response = await responsePromise;

    // Final render with the complete response (in case deltas were missed)
    aiResponse.innerHTML = marked.parse(response);
  } catch (err) {
    aiResponse.textContent = "Error: " + err.message;
  } finally {
    aiLoading.classList.add("hidden");
    $("#ai-send-btn").disabled = false;
  }
}

// Progressive streaming: render chunks as they arrive
if (window.api.onAiStreamChunk) {
  let streamBuffer = "";
  window.api.onAiStreamChunk((chunk) => {
    streamBuffer += chunk;
    aiResponse.innerHTML = marked.parse(streamBuffer);
    aiResponse.classList.remove("hidden");
    aiLoading.classList.add("hidden");
  });
  window.api.onAiStreamDone(() => {
    streamBuffer = "";
  });
}

// ===== UTILITIES =====
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTimeRange(start, stop) {
  if (!start || !stop) return "";
  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };
  return `${fmt(start)} – ${fmt(stop)}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatRangeLabel(shortcut, range) {
  const names = {
    today: "Today",
    yesterday: "Yesterday",
    "this-week": "This Week",
    "last-week": "Last Week",
  };
  const start = new Date(range.start);
  const end = new Date(new Date(range.end).getTime() - 86400000);
  const fmt = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${names[shortcut]} · ${fmt(start)} – ${fmt(end)}`;
}

function getDateRange(shortcut) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (shortcut) {
    case "today":
      return {
        start: today.toISOString(),
        end: new Date(today.getTime() + 86400000).toISOString(),
      };
    case "yesterday": {
      const y = new Date(today.getTime() - 86400000);
      return { start: y.toISOString(), end: today.toISOString() };
    }
    case "this-week": {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const sun = new Date(mon.getTime() + 7 * 86400000);
      return { start: mon.toISOString(), end: sun.toISOString() };
    }
    case "last-week": {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
      const sun = new Date(mon.getTime() + 7 * 86400000);
      return { start: mon.toISOString(), end: sun.toISOString() };
    }
    default:
      return {
        start: today.toISOString(),
        end: new Date(today.getTime() + 86400000).toISOString(),
      };
  }
}

function getDaysInRange(startISO, endISO) {
  const days = [];
  const current = new Date(startISO);
  const end = new Date(endISO);
  while (current < end) {
    days.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function groupByDay(entries) {
  const groups = {};
  entries.forEach((entry) => {
    // Group by local date, not UTC
    const d = new Date(entry.startTime);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
  });
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function getProjectColor(project) {
  if (!project || project === "(no project)") return "#a8a29e";
  let hash = 0;
  for (let i = 0; i < project.length; i++) {
    hash = project.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
