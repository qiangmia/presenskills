/* ==========================================================================
   LIVE AUDIENCE — presenter dashboard
   ========================================================================== */

import {
  DOMAINS, ALL_ITEMS, ARC_STRIP_HTML, ensureAuth, createRoom, getRoom, watchRoom, watchRaters,
  closeRoom, aggregateRaters, criterionAverage, domainSummary, rateUrl,
  normalizeRoomCode, isValidRoomCode, formatDate, formatScore
} from "./live-core.js";

const HOST_KEY = "eps-live-host-room";
const $ = (selector, root = document) => (root || document).querySelector(selector);
const $$ = (selector, root = document) => Array.from((root || document).querySelectorAll(selector));

const state = {
  user: null,
  code: "",
  room: null,
  raters: [],
  agg: aggregateRaters([]),
  isHost: false,
  unsubRoom: null,
  unsubRaters: null,
  qr: null
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

function savedRoom() {
  try { return localStorage.getItem(HOST_KEY) || ""; } catch (error) { return ""; }
}

function rememberRoom(code) {
  try { localStorage.setItem(HOST_KEY, code); } catch (error) { /* ignore */ }
}

function forgetRoom() {
  try { localStorage.removeItem(HOST_KEY); } catch (error) { /* ignore */ }
}

/* ---------- boot ---------- */
async function boot() {
  showView("loading");
  try {
    state.user = await ensureAuth();

    const params = new URLSearchParams(window.location.search);
    const urlCode = normalizeRoomCode(params.get("room") || "");
    const storedCode = normalizeRoomCode(savedRoom());
    const code = urlCode || storedCode;

    if (!code) {
      showView("setup");
      return;
    }

    if (!isValidRoomCode(code)) {
      if (urlCode) throw new Error("That room code is not valid. Use the six-character link from the presenter.");
      forgetRoom();
      showView("setup");
      return;
    }

    const room = await getRoom(code);
    if (!room) {
      if (urlCode) throw new Error("That room was not found. It may have been closed or replaced.");
      forgetRoom();
      showView("setup");
      return;
    }

    openRoom(code, room);
  } catch (error) {
    showError(error);
  }
}

function openRoom(code, room) {
  state.code = code;
  state.room = room;
  state.isHost = !!state.user && room.hostUid === state.user.uid;
  state.raters = [];
  state.agg = aggregateRaters([]);

  if (state.isHost) rememberRoom(code);
  try {
    history.replaceState(null, "", "?room=" + encodeURIComponent(code));
  } catch (error) { /* ignore */ }

  renderRoom();
  renderStats();
  renderResults();
  showView("room");
  subscribe(code);
}

function subscribe(code) {
  if (state.unsubRoom) state.unsubRoom();
  if (state.unsubRaters) state.unsubRaters();

  state.unsubRoom = watchRoom(code, room => {
    if (!room) {
      showError(new Error("This room no longer exists."));
      return;
    }
    state.room = room;
    state.isHost = !!state.user && room.hostUid === state.user.uid;
    renderStatus();
    renderRoomTitle();
  }, error => {
    $("#liveStamp").textContent = "Live updates paused — " + error.message;
  });

  state.unsubRaters = watchRaters(code, raters => {
    state.raters = raters;
    state.agg = aggregateRaters(raters);
    renderStats();
    renderResults();
  }, error => {
    $("#liveStamp").textContent = "Could not read ratings — " + error.message;
  });
}

/* ---------- room rendering ---------- */
function renderRoom() {
  renderRoomTitle();
  renderStatus();

  const url = rateUrl(state.code);
  $("#rateLink").href = url;
  $("#qrCode").textContent = state.code;
  renderQR(url);

  $("#roomTitle").value = state.room && state.room.title ? state.room.title : "";
}

function renderRoomTitle() {
  const title = state.room && state.room.title ? state.room.title : "Delivery & Deck-Sync";
  $("#roomTitleDisplay").textContent = title;
  document.title = title + " — Live Audience";
}

function renderStatus() {
  const open = !!(state.room && state.room.open !== false);
  const statusLine = $("#roomStatusLine");

  $("#roomCodeText").textContent = state.code;
  $("#roomStatusText").textContent = open ? "Open" : "Closed";
  statusLine.classList.toggle("is-closed", !open);

  const closeButton = $("#closeRoomBtn");
  closeButton.disabled = !state.isHost || !open;
  closeButton.textContent = open ? "Close room" : "Room closed";
}

function renderQR(url) {
  const box = $("#qrBox");
  if (typeof QRCode === "undefined") {
    box.innerHTML = '<span class="qr-fallback">QR code unavailable.<br>Use the audience link.</span>';
    return;
  }

  if (!state.qr) {
    box.innerHTML = "";
    state.qr = new QRCode(box, {
      text: url,
      width: 178,
      height: 178,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    state.qr.makeCode(url);
  }

  box.title = url;
  const image = box.querySelector("img");
  if (image) image.alt = "QR code for the audience rating page, room " + state.code;
}

/* ---------- stats ---------- */
function renderStats() {
  const agg = state.agg;
  const summaries = domainSummary(agg);

  $("#statRaters").textContent = agg.raterCount;
  $("#statCompleted").textContent = agg.completed;
  $("#statAverage").textContent = formatScore(agg.average);
  $("#statRatings").textContent = agg.totalRatings;
  $("#statRatingsSub").textContent = "of " + (agg.raterCount * ALL_ITEMS.length) + " possible";

  $("#waitingNote").hidden = agg.raterCount > 0;

  const stamp = $("#liveStamp");
  stamp.classList.toggle("is-live", agg.raterCount > 0);
  stamp.textContent = agg.raterCount
    ? "Live · " + agg.raterCount + (agg.raterCount === 1 ? " rater" : " raters") + " · updated " + formatDate(new Date())
    : "Waiting for the first rating…";

  $("#domainSummary").innerHTML = summaries.map(domain => (
    '<div class="domain-card">' +
      '<span>' + domain.no + " · " + escapeHTML(domain.label) + "</span>" +
      "<b>" + formatScore(domain.average) + "</b>" +
      "<small>" + (domain.total ? domain.total + " ratings · out of 5" : "No ratings yet") + "</small>" +
    "</div>"
  )).join("");
}

function renderResults() {
  const agg = state.agg;
  const summaries = domainSummary(agg);

  const html = DOMAINS.map(domain => {
    const summary = summaries.find(entry => entry.id === domain.id);
    const rows = domain.items.map(item => {
      const cell = agg.byCriterion[item.id];
      const average = criterionAverage(cell);
      const widths = [1, 2, 3, 4, 5].map(score => (
        cell.total ? (cell[score] / cell.total * 100) : 0
      ));

      return (
        '<div class="result-row">' +
          '<div class="result-copy">' +
            "<h4>" + escapeHTML(item.title) + "</h4>" +
            "<p>" + escapeHTML(item.cue) + "</p>" +
          "</div>" +
          '<div class="result-bars">' +
            '<div class="bar-track" aria-hidden="true">' +
              [1, 2, 3, 4, 5].map(score => (
                '<i class="s-' + score + '" style="width:' + widths[score - 1].toFixed(1) + '%"></i>'
              )).join("") +
            "</div>" +
            '<div class="bar-counts">' +
              [1, 2, 3, 4, 5].map(score => (
                '<span class="c-' + score + '">' + score + ':<b>' + cell[score] + "</b></span>"
              )).join("") +
            "</div>" +
          "</div>" +
          '<div class="result-avg' + (average === null ? " is-empty" : "") + '">' +
            "<b>" + formatScore(average) + "</b><span>avg /5</span>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    return (
      '<section class="result-domain">' +
        "<header><h3>" + domain.no + " · " + escapeHTML(domain.label) + "</h3>" +
          "<span>" + (summary.average === null ? "No ratings" : formatScore(summary.average) + " avg") + "</span>" +
        "</header>" +
        (domain.arc ? ARC_STRIP_HTML : "") +
        '<div class="rows">' + rows + "</div>" +
      "</section>"
    );
  }).join("");

  $("#resultsList").innerHTML = html;
}

/* ---------- actions ---------- */
async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

function flashButton(button, message) {
  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = message;
  window.setTimeout(() => { button.textContent = original; }, 1800);
}

function summaryText() {
  const agg = state.agg;
  const lines = [
    "DELIVERY & DECK-SYNC — LIVE AUDIENCE",
    "Room: " + state.code,
    "Session: " + ((state.room && state.room.title) || "Delivery & Deck-Sync"),
    "Raters: " + agg.raterCount + " · Completed: " + agg.completed + " · Class average: " + (agg.average === null ? "—" : formatScore(agg.average) + " / 5"),
    ""
  ];

  DOMAINS.forEach(domain => {
    lines.push(domain.no + " · " + domain.label);
    domain.items.forEach(item => {
      const cell = agg.byCriterion[item.id];
      const average = criterionAverage(cell);
      lines.push(
        "  " + item.title + " — 1:" + cell[1] + " · 2:" + cell[2] + " · 3:" + cell[3] +
        " · 4:" + cell[4] + " · 5:" + cell[5] + " · avg " + formatScore(average) + " / 5"
      );
    });
    lines.push("");
  });

  return lines.join("\n").trim();
}

function csvText() {
  const rows = [["Room", "Session", "Domain", "Criterion", "1", "2", "3", "4", "5", "Average /5"]];
  const session = (state.room && state.room.title) || "Delivery & Deck-Sync";
  DOMAINS.forEach(domain => {
    domain.items.forEach(item => {
      const cell = state.agg.byCriterion[item.id];
      const average = criterionAverage(cell);
      rows.push([
        state.code, session, domain.label, item.title,
        cell[1], cell[2], cell[3], cell[4], cell[5],
        average === null ? "" : formatScore(average)
      ]);
    });
  });

  return rows.map(row => row.map(value => {
    const text = String(value == null ? "" : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(",")).join("\r\n");
}

function downloadCSV() {
  const blob = new Blob([csvText()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "delivery-live-" + state.code + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showError(error) {
  showView("error");
  $("#errorMessage").textContent = error && error.message
    ? error.message
    : "Check the room link and try again.";
  $("#errorDetail").textContent = error && error.code ? "Code: " + error.code : "";
}

/* ---------- bind ---------- */
$("#createForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#createBtn");
  button.disabled = true;
  button.textContent = "Creating room…";

  try {
    const code = await createRoom($("#roomTitle").value);
    const room = await getRoom(code);
    openRoom(code, room);
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    button.textContent = "Create live room →";
  }
});

$("#copyLinkBtn").addEventListener("click", async event => {
  const button = event.currentTarget;
  try {
    await copyText(rateUrl(state.code));
    flashButton(button, "Copied");
  } catch (error) {
    flashButton(button, "Copy failed");
  }
});

$("#openRateBtn").addEventListener("click", () => {
  window.open(rateUrl(state.code), "_blank", "noopener");
});

$("#closeRoomBtn").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (!state.isHost) return;
  if (!window.confirm("Close this room? Students will no longer be able to submit ratings. Results stay visible here.")) return;

  button.disabled = true;
  try {
    await closeRoom(state.code);
  } catch (error) {
    $("#liveStamp").textContent = "Could not close the room — " + error.message;
    button.disabled = false;
  }
});

$("#newRoomBtn").addEventListener("click", async () => {
  const message = state.isHost
    ? "Start a new room with a new code? The current room will be closed."
    : "Start a new room with a new code?";
  if (!window.confirm(message)) return;

  try {
    if (state.isHost && state.room && state.room.open !== false) {
      await closeRoom(state.code);
    }
    const code = await createRoom(state.room && state.room.title ? state.room.title : "");
    const room = await getRoom(code);
    openRoom(code, room);
  } catch (error) {
    showError(error);
  }
});

$("#copyResultsBtn").addEventListener("click", async event => {
  const button = event.currentTarget;
  try {
    await copyText(summaryText());
    flashButton(button, "Copied");
  } catch (error) {
    flashButton(button, "Copy failed");
  }
});

$("#csvBtn").addEventListener("click", downloadCSV);

$("#retryBtn").addEventListener("click", () => window.location.reload());

boot();
