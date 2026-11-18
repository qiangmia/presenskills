/* ==========================================================================
   LIVE AUDIENCE — phone rating page
   ========================================================================== */

import {
  DOMAINS, ALL_ITEMS, MAX_RATINGS, RATING_LABELS, ensureAuth, getRoom,
  watchRoom, loadMyRatings, saveRatings, normalizeRoomCode, isValidRoomCode, normalizeScore
} from "./live-core.js";

const $ = (selector, root = document) => (root || document).querySelector(selector);
const $$ = (selector, root = document) => Array.from((root || document).querySelectorAll(selector));

const state = {
  user: null,
  code: "",
  room: null,
  ratings: {},
  initials: "",
  closed: false,
  saving: false,
  pending: false,
  saveTimer: null,
  unsubRoom: null
};

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

function showView(name) {
  $$("[data-view]").forEach(view => {
    view.hidden = view.dataset.view !== name;
  });
}

function storageKey() {
  return "eps-live-rating-" + state.code;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return { initials: "", ratings: {} };
    const parsed = JSON.parse(raw);
    return {
      initials: typeof parsed.initials === "string" ? parsed.initials : "",
      ratings: parsed.ratings && typeof parsed.ratings === "object" ? parsed.ratings : {}
    };
  } catch (error) {
    return { initials: "", ratings: {} };
  }
}

function writeLocal() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      initials: state.initials,
      ratings: state.ratings
    }));
  } catch (error) { /* ignore */ }
}

function normalizeRatings(source) {
  const clean = {};
  ALL_ITEMS.forEach(item => {
    const score = normalizeScore(source && source[item.id]);
    if (score !== null) clean[item.id] = score;
  });
  return clean;
}

function setSaveState(text, isError) {
  const element = $("#saveState");
  element.textContent = text || "";
  element.classList.toggle("is-error", !!isError);
}

function ratedCount() {
  return ALL_ITEMS.filter(item => normalizeScore(state.ratings[item.id]) !== null).length;
}

/* ---------- rendering ---------- */
function renderRateList() {
  const html = DOMAINS.map(domain => {
    const items = domain.items.map(item => {
      const buttons = [1, 2, 3, 4, 5].map(score => (
        '<button class="rate-btn" type="button" data-id="' + item.id + '" data-score="' + score + '"' +
          ' aria-pressed="' + (state.ratings[item.id] === score ? "true" : "false") + '"' +
          ' aria-label="' + score + " — " + RATING_LABELS[score] + '"' +
          ' title="' + score + " — " + RATING_LABELS[score] + '"' +
          (state.closed ? " disabled" : "") + ">" +
          score +
        "</button>"
      )).join("");

      return (
        '<article class="rate-item" data-id="' + item.id + '">' +
          '<div class="rate-copy">' +
            "<h3>" + escapeHTML(item.title) + "</h3>" +
            "<p>" + escapeHTML(item.cue) + "</p>" +
          "</div>" +
          '<div class="rate-buttons" role="group" aria-label="Rate ' + escapeHTML(item.title) + '">' +
            buttons +
          "</div>" +
        "</article>"
      );
    }).join("");

    return (
      '<section class="rate-domain" data-domain="' + domain.id + '">' +
        "<header>" +
          '<span class="no">' + domain.no + "</span>" +
          "<h2>" + escapeHTML(domain.label) + "</h2>" +
          "<small>0 / " + domain.items.length + "</small>" +
        "</header>" +
        '<div class="items">' + items + "</div>" +
      "</section>"
    );
  }).join("");

  $("#rateList").innerHTML = html;
}

function renderProgress() {
  const rated = ratedCount();
  const percent = Math.round(rated / MAX_RATINGS * 100);

  $("#ratedLabel").textContent = rated + " / " + MAX_RATINGS + " rated";
  $("#ratedBar").style.width = percent + "%";
  $("#ratedPct").textContent = percent + "%";
  $("#doneNote").hidden = rated < MAX_RATINGS || state.closed;

  $$(".rate-domain").forEach(section => {
    const domain = DOMAINS.find(entry => entry.id === section.dataset.domain);
    if (!domain) return;
    const count = domain.items.filter(item => normalizeScore(state.ratings[item.id]) !== null).length;
    const label = section.querySelector("small");
    if (label) label.textContent = count + " / " + domain.items.length;
  });
}

function updateButtons(id) {
  $$(".rate-btn").forEach(button => {
    if (button.dataset.id !== id) return;
    button.setAttribute("aria-pressed", state.ratings[id] === normalizeScore(button.dataset.score) ? "true" : "false");
  });
}

function updateClosed() {
  $("#closedNote").hidden = !state.closed;
  $$(".rate-btn").forEach(button => {
    button.disabled = state.closed;
  });
  if (state.closed) {
    $("#doneNote").hidden = true;
    setSaveState("Room closed", true);
  }
}

/* ---------- saving ---------- */
function scheduleSave(delay) {
  if (state.closed) return;
  writeLocal();
  if (state.saveTimer) window.clearTimeout(state.saveTimer);
  setSaveState("Saving…");
  state.saveTimer = window.setTimeout(saveNow, typeof delay === "number" ? delay : 350);
}

async function saveNow() {
  if (state.closed) return;
  if (state.saving) {
    state.pending = true;
    return;
  }

  state.saving = true;
  const ratings = { ...state.ratings };
  const initials = state.initials;

  setSaveState("Saving…");
  try {
    await saveRatings(state.code, initials, ratings);
    writeLocal();
    setSaveState("Saved");
  } catch (error) {
    if (error.code === "permission-denied") {
      state.closed = true;
      updateClosed();
      setSaveState("Room closed — last change not saved", true);
    } else {
      setSaveState("Not saved — check connection", true);
    }
  } finally {
    state.saving = false;
    if (state.pending && !state.closed) {
      state.pending = false;
      saveNow();
    }
  }
}

/* ---------- boot ---------- */
async function boot() {
  showView("loading");

  try {
    const code = normalizeRoomCode(new URLSearchParams(window.location.search).get("room") || "");
    if (!code) {
      throw new Error("No room code. Scan the QR code on the presenter's screen or open the full link.");
    }
    if (!isValidRoomCode(code)) {
      throw new Error("That room code is not valid. Check the link and try again.");
    }

    state.code = code;
    $("#roomChip").textContent = code;
    $("#roomCodeLabel").textContent = code;

    state.user = await ensureAuth();

    const room = await getRoom(code);
    if (!room) {
      throw new Error("That room was not found. Ask the presenter for a new link.");
    }

    state.room = room;
    state.closed = room.open === false;
    if (room.title) {
      $("#roomTitleText").textContent = room.title;
      document.title = "Rate — " + room.title;
    } else {
      document.title = "Rate — Room " + code;
    }

    const local = readLocal();
    const remote = await loadMyRatings(code).catch(() => ({ initials: "", ratings: {} }));
    const localRatings = normalizeRatings(local.ratings);
    const remoteRatings = normalizeRatings(remote.ratings);
    const hasRemote = Object.keys(remoteRatings).length > 0;

    state.ratings = hasRemote ? remoteRatings : localRatings;
    state.initials = remote.initials || local.initials || "";
    $("#initialsInput").value = state.initials;

    renderRateList();
    renderProgress();
    updateClosed();
    showView("rate");

    if (!state.closed) {
      setSaveState(Object.keys(state.ratings).length ? "Saved" : "Ready");
    }

    if (!hasRemote && Object.keys(localRatings).length && !state.closed) {
      scheduleSave(0);
    }

    state.unsubRoom = watchRoom(code, current => {
      state.room = current;
      state.closed = !current || current.open === false;
      if (current && current.title) {
        $("#roomTitleText").textContent = current.title;
      }
      updateClosed();
    }, () => {
      setSaveState("Live status unavailable", true);
    });
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  showView("error");
  $("#errorMessage").textContent = error && error.message
    ? error.message
    : "Check the room link and try again.";
  $("#errorDetail").textContent = error && error.code ? "Code: " + error.code : "";
}

/* ---------- bind ---------- */
$("#rateList").addEventListener("click", event => {
  const button = event.target.closest(".rate-btn");
  if (!button || state.closed) return;

  const id = button.dataset.id;
  const score = normalizeScore(button.dataset.score);
  if (score === null) return;

  if (state.ratings[id] === score) {
    delete state.ratings[id];
  } else {
    state.ratings[id] = score;
  }

  updateButtons(id);
  renderProgress();
  scheduleSave();
});

$("#initialsInput").addEventListener("input", event => {
  if (!state.code) return;
  state.initials = event.target.value.slice(0, 24);
  if (!state.closed) scheduleSave(500);
});

$("#retryBtn").addEventListener("click", () => window.location.reload());

boot();
