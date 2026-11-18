/* ==========================================================================
   LIVE AUDIENCE — shared Firebase + checklist data
   Used by live.html (presenter dashboard) and rate.html (audience phone)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* Firebase web API keys are public identifiers, not server secrets.
   This key is restricted to the project's GitHub Pages and localhost origins,
   and to the Firebase APIs used here. Access to data is enforced by Firestore
   security rules. See README.md for the security model. */
const firebaseConfig = {
  apiKey: "AIzaSyA7QbQvZOxe4H8VIXl6_viXjsNXhV6-_dw",
  authDomain: "presenskills.firebaseapp.com",
  projectId: "presenskills",
  storageBucket: "presenskills.firebasestorage.app",
  messagingSenderId: "958453984504",
  appId: "1:958453984504:web:eda8282508aef26b72df0d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------- checklist model ---------- */
export const DOMAINS = [
  {
    id: "vocal", no: "01", label: "Audibility, pacing & time",
    items: [
      { id: "vocal-1", title: "Back-row audibility & volume projection", cue: "Can you hear every word at the back?" },
      { id: "vocal-2", title: "End-of-sentence clarity", cue: "Do the last words land, or trail off?" },
      { id: "vocal-3", title: "Controlled pacing & 1.5-second pauses", cue: "Steady pace with clean pauses, not fillers." },
      { id: "vocal-4", title: "Time balance across sections", cue: "Sections fit the limit; the close is not rushed." },
      { id: "vocal-5", title: "Vocal stress & pitch variety", cue: "Pitch and stress vary with the point." }
    ]
  },
  {
    id: "connection", no: "02", label: "Eye contact & interaction",
    items: [
      { id: "conn-1", title: "Sustained eye contact: one thought, one look", cue: "Holds one listener for a full sentence." },
      { id: "conn-2", title: "Direct audience interaction", cue: "Invites a response, question, or show of hands." },
      { id: "conn-3", title: "Facial warmth & emotional congruence", cue: "Expressions match the message." },
      { id: "conn-4", title: "Real-time audience calibration", cue: "Reads the room and adjusts." }
    ]
  },
  {
    id: "sync", no: "03", label: "Slide sync & pre-flight",
    items: [
      { id: "sync-1", title: "Technical & environmental readiness", cue: "Tech checked; phone silent; standing clear." },
      { id: "sync-2", title: "No back-turning, zero slide-reading", cue: "Faces the audience; does not read the slide." },
      { id: "sync-3", title: "Touch–turn–talk choreography", cue: "Touch, turn, then talk." },
      { id: "sync-4", title: "Guide → interpret → connect", cue: "Points to the visual, explains it, links it." },
      { id: "sync-5", title: "Clicker timing & visual reveal", cue: "Advances on the beat, not late." }
    ]
  },
  {
    id: "physical", no: "04", label: "Posture, narrative & Q&A",
    items: [
      { id: "phys-1", title: "Grounded stance & open posture", cue: "Planted feet, open posture, no swaying." },
      { id: "phys-2", title: "Purposeful gestures, no podium leaning", cue: "Gestures support the point; no podium lean." },
      { id: "phys-3", title: "High-impact hook & crisp close", cue: "Clean hook and a decisive close." },
      { id: "phys-4", title: "PREP Q&A defense under pressure", cue: "Pauses, answers Point-first, stays under 45s." }
    ]
  }
];

export const ALL_ITEMS = DOMAINS.flatMap(domain =>
  domain.items.map(item => ({ ...item, domain: domain.id, domainLabel: domain.label }))
);

export const MAX_RATINGS = ALL_ITEMS.length;
export const RATING_VALUES = [1, 2, 3, 4, 5];
export const RATING_LABELS = {
  1: "Needs work",
  2: "Developing",
  3: "Solid",
  4: "Strong",
  5: "Exemplary"
};

const LEGACY_RATING_MAP = { strong: 5, solid: 3, fix: 1 };

export function normalizeScore(value) {
  if (typeof value === "string" && value in LEGACY_RATING_MAP) {
    return LEGACY_RATING_MAP[value];
  }
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
}

export function formatScore(value) {
  return value == null ? "—" : value.toFixed(1);
}

export function itemById(id) {
  return ALL_ITEMS.find(item => item.id === id) || null;
}

/* ---------- auth ---------- */
let authPromise = null;

export function ensureAuth() {
  if (authPromise) return authPromise;

  authPromise = new Promise((resolve, reject) => {
    let settled = false;
    let signingIn = false;

    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(user);
        return;
      }
      if (signingIn) return;
      signingIn = true;
      signInAnonymously(auth).catch(error => {
        if (settled) return;
        settled = true;
        unsubscribe();
        reject(error);
      });
    }, error => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(error);
    });
  });

  authPromise.catch(() => { authPromise = null; });
  return authPromise;
}

/* ---------- room helpers ---------- */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function isValidRoomCode(value) {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}

export function rateUrl(code) {
  const url = new URL("rate.html", window.location.href);
  url.searchParams.set("room", code);
  return url.href;
}

export async function createRoom(title) {
  const user = await ensureAuth();
  const cleanTitle = String(title || "").trim().slice(0, 80);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = newRoomCode();
    const ref = doc(db, "rooms", code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    try {
      await setDoc(ref, {
        hostUid: user.uid,
        open: true,
        title: cleanTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return code;
    } catch (error) {
      if (error.code === "permission-denied") continue;
      throw error;
    }
  }

  throw new Error("Could not create a room code. Please try again.");
}

export async function getRoom(code) {
  const snap = await getDoc(doc(db, "rooms", code));
  return snap.exists() ? { code, ...snap.data() } : null;
}

export function watchRoom(code, callback, onError) {
  return onSnapshot(doc(db, "rooms", code), snap => {
    callback(snap.exists() ? { code, ...snap.data() } : null);
  }, onError);
}

export function watchRaters(code, callback, onError) {
  return onSnapshot(collection(db, "rooms", code, "raters"), snap => {
    const raters = snap.docs.map(entry => ({ id: entry.id, ...entry.data() }));
    const changes = snap.docChanges().map(change => ({ type: change.type, id: change.doc.id }));
    callback(raters, changes);
  }, onError);
}

export async function closeRoom(code) {
  await ensureAuth();
  await updateDoc(doc(db, "rooms", code), {
    open: false,
    updatedAt: serverTimestamp()
  });
}

export async function loadMyRatings(code) {
  const user = await ensureAuth();
  const snap = await getDoc(doc(db, "rooms", code, "raters", user.uid));
  if (!snap.exists()) return { initials: "", ratings: {} };
  const data = snap.data();
  return { initials: data.initials || "", ratings: data.ratings || {} };
}

export async function saveRatings(code, initials, ratings) {
  const user = await ensureAuth();
  const cleanRatings = {};
  ALL_ITEMS.forEach(item => {
    const score = normalizeScore(ratings[item.id]);
    if (score !== null) cleanRatings[item.id] = score;
  });

  await setDoc(doc(db, "rooms", code, "raters", user.uid), {
    initials: String(initials || "").trim().slice(0, 24),
    ratings: cleanRatings,
    updatedAt: serverTimestamp()
  });

  return user.uid;
}

/* ---------- aggregation ---------- */
export function aggregateRaters(raters) {
  const byCriterion = {};
  ALL_ITEMS.forEach(item => {
    byCriterion[item.id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: 0, points: 0 };
  });

  let completed = 0;
  let raterCount = 0;
  let totalRatings = 0;
  let totalPoints = 0;

  raters.forEach(rater => {
    const ratings = rater.ratings || {};
    const ratedIds = ALL_ITEMS
      .map(item => item.id)
      .filter(id => normalizeScore(ratings[id]) !== null);

    if (ratedIds.length) raterCount += 1;
    if (ratedIds.length === MAX_RATINGS) completed += 1;

    ratedIds.forEach(id => {
      const score = normalizeScore(ratings[id]);
      const cell = byCriterion[id];
      cell[score] += 1;
      cell.total += 1;
      cell.points += score;
      totalRatings += 1;
      totalPoints += score;
    });
  });

  return {
    byCriterion,
    raterCount,
    completed,
    totalRatings,
    totalPoints,
    average: totalRatings ? totalPoints / totalRatings : null
  };
}

export function criterionAverage(cell) {
  if (!cell || !cell.total) return null;
  return cell.points / cell.total;
}

export function domainSummary(agg) {
  return DOMAINS.map(domain => {
    let total = 0;
    let points = 0;
    domain.items.forEach(item => {
      const cell = agg.byCriterion[item.id];
      total += cell.total;
      points += cell.points;
    });
    return {
      id: domain.id,
      label: domain.label,
      no: domain.no,
      total,
      average: total ? points / total : null
    };
  });
}

export function formatDate(value) {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}
