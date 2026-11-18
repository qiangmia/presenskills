# Presentation Skills — Delivery & Deck-Sync

A responsive, dual-purpose rehearsal checklist and live audience audit for the
Weeks 11–12 **Delivery & Presence** unit.

**Live page:** <https://qiangmia.github.io/presenskills/>

## What it is

Eighteen observable presentation criteria across four domains:

1. Audibility, pacing & time (5)
2. Eye contact & audience interaction (4)
3. Slide sync & technical readiness (5)
4. Posture, narrative & Q&A (4)

Ten of the eighteen are marked as the beginner core.

## How to use it

- **Rehearse** — tick only what you can actually do in one run.
- **Audit** — hand the page to a listener; rate each criterion from 1 to 5, and add one specific note.
- **Compare** — read the score and notes, then choose one target for the next take.

The page works in Dual, Rehearsal, and Audience views, saves progress in the
browser, and prints as a compact A4 handout (`Print / PDF` button).

## Live audience room

The **Open live dashboard** button on the checklist opens `live.html`.

1. Create a room and give it a session label.
2. Project or share the QR code / audience link.
3. Students open `rate.html?room=CODE` on their phones and rate each criterion
   from 1 to 5: **1** needs work, **3** solid, **5** exemplary. Initials are optional.
4. The dashboard updates live with rater count, completion, class average
   (out of 5), per-domain averages, and per-criterion 1–5 distributions.
5. Close the room when the class is done. The results remain visible; the
   rating page becomes read-only.

Ratings are stored in Firestore, not in the presenter's browser. A student can
change an answer until the room is closed; the dashboard replaces the old rating
rather than counting it twice. Scores are numeric 1–5; legacy Strong / Solid /
Fix values are read as 5 / 3 / 1.

### Privacy and practical notes

- A room code is the only key. Anyone with the code can open the rating page.
- Students do not need an account. Firebase anonymous auth identifies a browser,
  not a person.
- Do not put sensitive information in the session label or initials.
- The host is tied to the browser that created the room. Create the room on the
  device you will use to run the dashboard.
- Old rooms are not deleted automatically; they are tiny. Closing a room is
  enough for classroom use.
- The free Firebase Spark plan is sufficient for normal class sizes.

### Backend

- Firebase project: `presenskills`
- Firestore database: `(default)`, `asia-east1`
- Anonymous sign-in: enabled
- Authorized domain: `qiangmia.github.io`
- Firestore rules: rooms are readable/writable by authenticated users; only the
  room creator can close a room; each rater can write only their own ratings.

## Files

- `index.html` — the interactive checklist
- `live.html` — presenter live dashboard
- `rate.html` — phone rating page
- `live.css` — shared styles for the live pages
- `live-core.js` — Firebase setup, checklist model, room helpers
- `live.js` — dashboard logic
- `rate.js` — rating page logic
- `qrcode.min.js` — QR rendering ([qrcodejs](https://github.com/davidshimjs/qrcodejs), MIT)
- `delivery-deck-sync.pdf` — 4-page A4 print version
