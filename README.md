# 🔥 FkTube — *kya timepas kar rha hai yaawr, kaam karle na*

A Chrome/Edge/Brave extension that turns **YouTube** and **Instagram** into a **task list + daily planner**, enforces a **daily watch-time limit**, and **blocks adult sites** — so you actually get un-addicted and get your work done.

> *Kaam pehle, timepass baad me.* · काम पहले, टाइमपास बाद में। 💪

---

## 📦 Installation

This is an **unpacked** extension (no Web Store needed). It works on any Chromium browser — **Chrome, Edge, Brave, Opera**.

### Step 1 — Get the code

**Option A · Download ZIP (easiest)**
1. Go to <https://github.com/Sangwaniya/FkTube>
2. Click the green **`< > Code`** button → **Download ZIP**.
3. **Extract** the ZIP somewhere permanent (e.g. `Documents/FkTube`). ⚠️ Don't delete this folder later — the browser loads the extension from here.

**Option B · Clone with git**
```bash
git clone https://github.com/Sangwaniya/FkTube.git
```

### Step 2 — Load it into your browser

<details open>
<summary><b>Chrome / Brave / Opera</b></summary>

1. Open `chrome://extensions` (type it in the address bar and press Enter).
2. Turn on **Developer mode** (toggle, top-right corner).
3. Click **Load unpacked**.
4. Select the extracted **`FkTube`** folder (the one containing `manifest.json`).
5. Done ✅ — you'll see the extension appear.
</details>

<details>
<summary><b>Microsoft Edge</b></summary>

1. Open `edge://extensions`.
2. Turn on **Developer mode** (left sidebar).
3. Click **Load unpacked**.
4. Select the extracted **`FkTube`** folder.
5. Done ✅
</details>

### Step 3 — Approve permissions & pin it
- The browser will ask to approve permissions (it needs access to all sites so it can block adult content). Accept them.
- Click the **puzzle-piece 🧩 icon** in the toolbar → **pin** "FkTube" for quick access to stats & snooze.

### Step 4 — Use it
Open **youtube.com** or **instagram.com** — you'll be greeted by your task dashboard instead of the feed. 🎯

> **Updating later:** pull/download the new code, then go to `chrome://extensions` and click the **↻ reload** icon on the FkTube card.

---

## ✨ Features

### Works the same on YouTube **and** Instagram

**YouTube**
- **Homepage / Shorts** → replaced with a liquid-glass dashboard: big meme-motivation headline, tasks + subtasks, done list, today's planner (timeline), Pomodoro ring, and stats (🔥 streak · ✅ done today · ⏳ time saved · 📊 progress).
- **Video pages** → keeps player + title + description + comments; hides suggestions, related, search, top nav, end-screen cards, live chat. **Autoplay is turned off.**

**Instagram**
- **Home feed, Reels (`/reels/`), Explore (`/explore/`)** → replaced with the task dashboard.
- **Single posts (`/p/…`), reels opened directly (`/reel/…`), stories** → focus mode + the daily watch-time limit.
- **DMs (`/direct/`) and profiles** → left usable (messaging & checking a specific person is usually intentional).

### Daily watch-time limit
Default **10 min total/day**, shared across YouTube + Instagram. When you hit it, the video **pauses** and a full glass overlay appears:
- Asks *"what productive thing did you do?"* + *"which task did you complete?"* (saved as reflections).
- **Quit** → back to the task dashboard.
- **Continue** → asks how many more minutes, then **hard-stops** after that. No infinite escape.

### Anti-distraction extras
- **Floating "Stop, back to work" button** (bottom-right, liquid glass) → pauses & returns you to tasks anytime.
- **Escape hatch** with friction → asks *why* + a think-prompt before snoozing the block for X minutes.

### 🛡️ Adult-site blocking (works on ALL sites)
- **90+ known adult domains** hard-blocked via `declarativeNetRequest` (instant, private, no network calls).
- **Keyword heuristics** catch unknown sites (conservative, with a false-positive allowlist for words like *essex/analysis*).
- Blocked pages show a **motivational block screen** instead.

### 🌐 Languages
- **हिंदी (Devanagari)** — default · **Hinglish** · **English**.
- Switch anytime via the **⚙ gear** on the dashboard, the popup, or the block page. Your choice is saved.

### 📈 Productivity
- Pomodoro (25/5) with a live ring · daily streak · "time saved" counter · progress % · **export/import** JSON backup (in the ⚙ gear panel).

---

## 🔒 Privacy

Everything is stored **locally in your browser** (`chrome.storage.local`). No data is sent anywhere — no servers, no analytics, no accounts. The adult blocklist is bundled in the extension, so blocking happens entirely on-device.

---

## 🔧 Tuning / Customization

**Change the daily watch limit:** edit `state.watch.dailyLimitMin` in `content.js` (currently `10`), then reload the extension.

**Video page hides too much / too little:** YouTube & Instagram rename elements sometimes. Edit the `WATCH PAGE FOCUS MODE` block in `content.css` — Inspect the element, grab its id/tag, add it to the `display:none` list, reload.

**Add / remove blocked domains:** edit `rules.json` (each entry is one rule; keep `id` unique). Or add keywords in `background.js` → `ADULT_KEYWORDS`. Reload after editing.

---

## 🗂️ Project structure
```
manifest.json   MV3 config (DNR + all-urls host perms)
i18n.js         3-language strings + memes (shared)
content.js      dashboard, watch focus, watch-limit, autoplay kill, float btn
content.css     liquid-glass styling
background.js   adult keyword-heuristic blocking (service worker)
rules.json      adult-domain blocklist (declarativeNetRequest)
block.html/js   motivational block page
popup.html/js   toolbar popup
icons/          extension icons (PNG)
gen-icons.js    regenerate icons (node gen-icons.js)
```

## 🧩 Tech
Vanilla JS + CSS, **Manifest V3**, zero dependencies, no build step. Just load unpacked.

---

## 🤝 Contributing
Issues and PRs welcome. If a site changes its layout and something breaks, open an issue with the page URL and a screenshot.

## 📄 License
MIT — see [LICENSE](LICENSE).

---
*Made to save your time.* 🔥
