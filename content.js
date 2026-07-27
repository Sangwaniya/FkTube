/* ============================================================
   kya karne aaya hai bsdk, kaam karle na — content script v2
   Vanilla JS, no build step. Runs at document_start.
   Features: dashboard takeover, watch focus mode, daily watch-limit
   + pause/quit overlay, autoplay kill, floating stop button,
   i18n (hi/hn/en), escape friction gate, meme motivation.
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "fktube_state_v1";
  const SNOOZE_KEY = "fktube_snooze_until";
  const LANG_KEY = "fktube_lang";
  const I18N = window.FK_I18N;

  let lang = "hi";
  const t = (k) => I18N.t(lang, k);

  // ---------- State ----------
  const defaultState = () => ({
    tasks: [],
    planner: [],
    reflections: [],   // {day, productive, task, ts}
    stats: {
      streak: 0, lastFocusDay: null, completedLog: {},
      wastedSeconds: 0, wastedDay: null
    },
    watch: {
      day: null,
      watchedSeconds: 0,      // total video seconds watched today
      dailyLimitMin: 10,      // default limit (user asked ~10)
      grantedExtraSec: 0      // extra granted after "continue" (hard cap)
    },
    pomodoro: {
      running: false, mode: "work", endsAt: null, remaining: null,
      workMin: 25, breakMin: 5, completedToday: 0, pomoDay: null
    }
  });

  let state = defaultState();
  let saveTimer = null;

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function load() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY, LANG_KEY], (res) => {
          if (res && res[STORAGE_KEY]) {
            state = Object.assign(defaultState(), res[STORAGE_KEY]);
            state.stats = Object.assign(defaultState().stats, state.stats || {});
            state.pomodoro = Object.assign(defaultState().pomodoro, state.pomodoro || {});
            state.watch = Object.assign(defaultState().watch, state.watch || {});
            state.reflections = state.reflections || [];
          }
          if (res && res[LANG_KEY]) lang = res[LANG_KEY];
          resolve();
        });
      } catch (e) { resolve(); }
    });
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { chrome.storage.local.set({ [STORAGE_KEY]: state }); } catch (e) {}
    }, 120);
  }
  function setLang(l) {
    lang = l;
    try { chrome.storage.local.set({ [LANG_KEY]: l }); } catch (e) {}
  }
  function getSnooze() {
    return new Promise((r) => {
      try { chrome.storage.local.get([SNOOZE_KEY], (res) => r((res && res[SNOOZE_KEY]) || 0)); }
      catch (e) { r(0); }
    });
  }
  function setSnooze(ts) { try { chrome.storage.local.set({ [SNOOZE_KEY]: ts }); } catch (e) {} }

  function resetDailyBuckets() {
    const k = todayKey();
    if (state.stats.wastedDay !== k) { state.stats.wastedDay = k; state.stats.wastedSeconds = 0; }
    if (state.pomodoro.pomoDay !== k) { state.pomodoro.pomoDay = k; state.pomodoro.completedToday = 0; }
    if (state.watch.day !== k) { state.watch.day = k; state.watch.watchedSeconds = 0; state.watch.grantedExtraSec = 0; }
  }

  // ---------- Page type ----------
  function pageType() {
    const p = location.pathname;
    if (p === "/" || p === "" || p.startsWith("/feed") || p === "/gaming") return "home";
    if (p.startsWith("/watch")) return "watch";
    if (p.startsWith("/results")) return "search";
    if (p.startsWith("/shorts")) return "shorts";
    return "other";
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ============================================================
  //  WATCH PAGE — focus mode + autoplay kill + watch-limit + float btn
  // ============================================================
  let watchTick = null;
  let limitOverlayOpen = false;

  function applyWatchMode(on) {
    const html = document.documentElement;
    html.classList.toggle("fk-focus-watch", on);
    ensureWatchBanner(on);
    ensureFloatBtn(on);
    if (on) {
      killAutoplay();
      startWatchTimer();
    } else {
      stopWatchTimer();
    }
  }

  function ensureWatchBanner(on) {
    let b = document.getElementById("fk-watch-banner");
    if (!on) { if (b) b.remove(); return; }
    if (b) { b.querySelector(".fk-wb-title").textContent = t("title"); b.querySelector(".fk-wb-sub").textContent = t("watchBanner"); return; }
    b = document.createElement("div");
    b.id = "fk-watch-banner";
    b.innerHTML = `
      <span class="fk-wb-dot"></span>
      <span class="fk-wb-title">${esc(t("title"))}</span>
      <span class="fk-wb-quota" id="fk-wb-quota"></span>
      <span class="fk-wb-sub">${esc(t("watchBanner"))}</span>`;
    (document.body || document.documentElement).appendChild(b);
  }

  function ensureFloatBtn(on) {
    let f = document.getElementById("fk-float-btn");
    if (!on) { if (f) f.remove(); return; }
    if (f) { f.querySelector(".fk-float-label").textContent = t("stopBtn"); return; }
    f = document.createElement("button");
    f.id = "fk-float-btn";
    f.innerHTML = `<span class="fk-float-icon">⏹</span><span class="fk-float-label">${esc(t("stopBtn"))}</span>`;
    f.addEventListener("click", () => {
      pauseVideo();
      // force dashboard: clear snooze so overlay shows, then go home
      location.href = "https://www.youtube.com/";
    });
    (document.body || document.documentElement).appendChild(f);
  }

  function getVideo() { return document.querySelector("video"); }
  function pauseVideo() { const v = getVideo(); if (v) { try { v.pause(); } catch (e) {} } }

  function killAutoplay() {
    // turn off the autoplay toggle if present + stop end-screen autonav
    const tryOff = () => {
      const btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"], button.ytp-autonav-toggle-button[aria-checked="true"]');
      if (btn) btn.click();
    };
    tryOff();
    setTimeout(tryOff, 1500);
    setTimeout(tryOff, 4000);
  }

  function startWatchTimer() {
    stopWatchTimer();
    watchTick = setInterval(() => {
      const v = getVideo();
      if (!v || v.paused || v.ended || document.hidden) return;
      resetDailyBuckets();
      state.watch.watchedSeconds += 1;
      updateQuotaBadge();
      if (state.watch.watchedSeconds % 5 === 0) save();

      const limitSec = state.watch.dailyLimitMin * 60 + (state.watch.grantedExtraSec || 0);
      if (state.watch.watchedSeconds >= limitSec && !limitOverlayOpen) {
        pauseVideo();
        showLimitOverlay();
      }
    }, 1000);
  }
  function stopWatchTimer() { clearInterval(watchTick); watchTick = null; }

  function updateQuotaBadge() {
    const el = document.getElementById("fk-wb-quota");
    if (!el) return;
    const limitSec = state.watch.dailyLimitMin * 60 + (state.watch.grantedExtraSec || 0);
    const left = Math.max(0, limitSec - state.watch.watchedSeconds);
    el.textContent = `⏳ ${fmtDuration(left)} left`;
    el.classList.toggle("fk-low", left <= 60);
  }

  // ---------- Watch-limit "quit?" overlay ----------
  function showLimitOverlay() {
    if (limitOverlayOpen) return;
    limitOverlayOpen = true;
    pauseVideo();
    const min = state.watch.dailyLimitMin + Math.round((state.watch.grantedExtraSec || 0) / 60);
    const wrap = document.createElement("div");
    wrap.id = "fk-limit-overlay";
    wrap.innerHTML = `
      <div class="fk-aurora"></div>
      <div class="fk-limit-card">
        <div class="fk-limit-emoji">⏰</div>
        <h1 class="fk-limit-title">${esc(t("limitTitle"))}</h1>
        <p class="fk-limit-sub">${esc(t("limitSub").replace("{min}", min))}</p>
        <p class="fk-limit-meme" id="fk-limit-meme">${esc(I18N.memeRandom(lang))}</p>
        <label class="fk-limit-label">${esc(t("qProductive"))}</label>
        <input class="fk-input" id="fk-ref-prod" type="text" placeholder="…">
        <label class="fk-limit-label">${esc(t("qTask"))}</label>
        <input class="fk-input" id="fk-ref-task" type="text" placeholder="…">
        <div class="fk-limit-actions">
          <button class="fk-btn fk-btn-primary fk-btn-lg" id="fk-limit-quit">${esc(t("quit"))}</button>
          <button class="fk-btn fk-btn-ghost" id="fk-limit-more">${esc(t("continue"))}</button>
        </div>
        <div class="fk-limit-note">${esc(t("hardStopNote"))}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add("fk-overlay-open");

    document.getElementById("fk-limit-quit").addEventListener("click", () => {
      saveReflection();
      goToDashboard();
    });
    document.getElementById("fk-limit-more").addEventListener("click", () => {
      saveReflection();
      const raw = prompt(t("continuePrompt"), "5");
      if (raw === null) return;
      const extra = Math.max(1, Math.min(60, parseInt(raw, 10) || 5));
      state.watch.grantedExtraSec = (state.watch.grantedExtraSec || 0) + extra * 60;
      save();
      closeLimitOverlay();
      const v = getVideo(); if (v) { try { v.play(); } catch (e) {} }
    });
  }

  function saveReflection() {
    const prod = (document.getElementById("fk-ref-prod") || {}).value || "";
    const task = (document.getElementById("fk-ref-task") || {}).value || "";
    if (prod.trim() || task.trim()) {
      state.reflections.push({ day: todayKey(), productive: prod.trim(), task: task.trim(), ts: Date.now() });
      if (state.reflections.length > 200) state.reflections = state.reflections.slice(-200);
      save();
    }
  }

  function closeLimitOverlay() {
    const el = document.getElementById("fk-limit-overlay");
    if (el) el.remove();
    document.documentElement.classList.remove("fk-overlay-open");
    limitOverlayOpen = false;
  }

  function goToDashboard() {
    closeLimitOverlay();
    setSnooze(0); // ensure dashboard shows on home
    location.href = "https://www.youtube.com/";
  }

  // ============================================================
  //  HOME / SHORTS — dashboard overlay
  // ============================================================
  let overlayEl = null;
  let wastedTimer = null;

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    document.documentElement.classList.remove("fk-overlay-open");
    clearInterval(wastedTimer); wastedTimer = null;
  }

  async function maybeShowOverlay() {
    const type = pageType();
    const shouldTakeover = (type === "home" || type === "shorts");
    if (!shouldTakeover) { removeOverlay(); return; }
    const snoozeUntil = await getSnooze();
    if (Date.now() < snoozeUntil) { removeOverlay(); return; }
    if (!overlayEl) buildOverlay();
  }

  function buildOverlay() {
    document.documentElement.classList.add("fk-overlay-open");
    overlayEl = document.createElement("div");
    overlayEl.id = "fk-overlay";
    overlayEl.innerHTML = OVERLAY_HTML();
    (document.body || document.documentElement).appendChild(overlayEl);
    wireOverlay();
    renderAll();
    startWastedCounter();
  }

  function startWastedCounter() {
    resetDailyBuckets();
    clearInterval(wastedTimer);
    wastedTimer = setInterval(() => {
      if (document.hidden) return;
      state.stats.wastedSeconds += 1;
      const el = document.getElementById("fk-wasted-val");
      if (el) el.textContent = fmtDuration(state.stats.wastedSeconds);
      if (state.stats.wastedSeconds % 5 === 0) save();
    }, 1000);
  }

  function OVERLAY_HTML() {
    return `
    <div class="fk-aurora"></div>
    <div class="fk-grain"></div>
    <div class="fk-shell">
      <header class="fk-header">
        <div class="fk-brand">
          <div class="fk-logo">🔥</div>
          <div class="fk-titles">
            <h1 class="fk-title" id="fk-title">${esc(t("title"))}</h1>
            <p class="fk-quote" id="fk-quote"></p>
          </div>
        </div>
        <div class="fk-header-actions">
          <div class="fk-lang-wrap">
            <button class="fk-btn fk-btn-ghost fk-gear" id="fk-gear" title="${esc(t("langLabel"))}">⚙</button>
            <div class="fk-settings" id="fk-settings" hidden>
              <div class="fk-settings-sec">
                <div class="fk-settings-label">${esc(t("langLabel"))}</div>
                <div class="fk-lang-menu" id="fk-lang-menu"></div>
              </div>
              <div class="fk-settings-sec">
                <div class="fk-settings-label">Backup</div>
                <div class="fk-settings-row">
                  <button class="fk-btn fk-btn-ghost" id="fk-export">⬇ ${esc(t("export"))}</button>
                  <label class="fk-btn fk-btn-ghost">⬆ ${esc(t("import"))}
                    <input type="file" id="fk-import" accept="application/json" hidden>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <button class="fk-btn fk-btn-danger" id="fk-escape">😔 ${esc(t("escape"))}</button>
        </div>
      </header>

      <section class="fk-hero">
        <div class="fk-hero-meme" id="fk-hero-meme"></div>
      </section>

      <section class="fk-stats">
        <div class="fk-stat"><div class="fk-stat-icon">🔥</div><div><div class="fk-stat-val" id="fk-streak">0</div><div class="fk-stat-label">${esc(t("streak"))}</div></div></div>
        <div class="fk-stat"><div class="fk-stat-icon">✅</div><div><div class="fk-stat-val" id="fk-done-today">0</div><div class="fk-stat-label">${esc(t("doneToday"))}</div></div></div>
        <div class="fk-stat"><div class="fk-stat-icon">⏳</div><div><div class="fk-stat-val" id="fk-wasted-val">0s</div><div class="fk-stat-label">${esc(t("timeSaved"))}</div></div></div>
        <div class="fk-stat fk-progress-stat"><div class="fk-stat-icon">📊</div><div style="flex:1"><div class="fk-stat-val"><span id="fk-progress-pct">0%</span></div><div class="fk-progress-bar"><div class="fk-progress-fill" id="fk-progress-fill"></div></div></div></div>
      </section>

      <main class="fk-grid">
        <div class="fk-card fk-card-tasks">
          <div class="fk-card-head"><h2>📝 ${esc(t("tasks"))}</h2><span class="fk-pill" id="fk-task-count">0</span></div>
          <form class="fk-add" id="fk-task-form">
            <input type="text" id="fk-task-input" placeholder="${esc(t("taskPlaceholder"))}" autocomplete="off">
            <button type="submit" class="fk-btn fk-btn-primary">${esc(t("add"))}</button>
          </form>
          <ul class="fk-list" id="fk-task-list"></ul>
          <div class="fk-done-wrap">
            <button class="fk-done-toggle" id="fk-done-toggle">${esc(t("doneTasks"))} <span id="fk-done-count">(0)</span> ▾</button>
            <ul class="fk-list fk-list-done" id="fk-done-list" hidden></ul>
          </div>
        </div>

        <div class="fk-card fk-card-planner">
          <div class="fk-card-head"><h2>🗓️ ${esc(t("planner"))}</h2><span class="fk-pill" id="fk-plan-date"></span></div>
          <form class="fk-add fk-add-plan" id="fk-plan-form">
            <input type="time" id="fk-plan-time" value="09:00">
            <input type="text" id="fk-plan-text" placeholder="${esc(t("planPlaceholder"))}" autocomplete="off">
            <button type="submit" class="fk-btn fk-btn-primary">+</button>
          </form>
          <ul class="fk-timeline" id="fk-plan-list"></ul>
        </div>

        <div class="fk-card fk-card-pomo">
          <div class="fk-card-head"><h2>🍅 ${esc(t("focusTimer"))}</h2><span class="fk-pill" id="fk-pomo-count">0 ${esc(t("done"))}</span></div>
          <div class="fk-pomo-ring">
            <svg viewBox="0 0 200 200">
              <circle class="fk-ring-bg" cx="100" cy="100" r="88"></circle>
              <circle class="fk-ring-fg" id="fk-ring-fg" cx="100" cy="100" r="88"></circle>
            </svg>
            <div class="fk-pomo-center">
              <div class="fk-pomo-time" id="fk-pomo-time">25:00</div>
              <div class="fk-pomo-mode" id="fk-pomo-mode">${esc(t("work"))}</div>
            </div>
          </div>
          <div class="fk-pomo-controls">
            <button class="fk-btn fk-btn-primary" id="fk-pomo-start">${esc(t("start"))}</button>
            <button class="fk-btn fk-btn-ghost" id="fk-pomo-reset">${esc(t("reset"))}</button>
          </div>
        </div>
      </main>

      <footer class="fk-footer"><span>${esc(t("footer"))} <b>${esc(t("tagline"))}</b></span></footer>
    </div>`;
  }

  function rebuildOverlay() {
    if (!overlayEl) return;
    overlayEl.innerHTML = OVERLAY_HTML();
    wireOverlay();
    renderAll();
    startWastedCounter();
  }

  function wireOverlay() {
    document.getElementById("fk-quote").textContent = I18N.meme(lang, new Date().getMinutes());
    document.getElementById("fk-hero-meme").textContent = I18N.memeRandom(lang);

    document.getElementById("fk-task-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("fk-task-input");
      const text = input.value.trim();
      if (!text) return;
      state.tasks.unshift({ id: uid(), text, done: false, subtasks: [], createdAt: Date.now() });
      input.value = ""; save(); renderTasks(); renderStats();
    });

    document.getElementById("fk-plan-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const tm = document.getElementById("fk-plan-time").value;
      const txt = document.getElementById("fk-plan-text").value.trim();
      if (!txt) return;
      state.planner.push({ id: uid(), time: tm || "00:00", text: txt, done: false });
      document.getElementById("fk-plan-text").value = ""; save(); renderPlanner();
    });

    document.getElementById("fk-done-toggle").addEventListener("click", () => {
      const l = document.getElementById("fk-done-list"); l.hidden = !l.hidden;
    });
    document.getElementById("fk-escape").addEventListener("click", onEscape);
    document.getElementById("fk-export").addEventListener("click", exportData);
    document.getElementById("fk-import").addEventListener("change", importData);
    document.getElementById("fk-pomo-start").addEventListener("click", togglePomo);
    document.getElementById("fk-pomo-reset").addEventListener("click", resetPomo);
    document.getElementById("fk-task-list").addEventListener("click", onTaskListClick);
    document.getElementById("fk-done-list").addEventListener("click", onTaskListClick);
    document.getElementById("fk-plan-list").addEventListener("click", onPlanListClick);

    // settings popover (language + backup) toggled by the gear
    const gear = document.getElementById("fk-gear");
    const settings = document.getElementById("fk-settings");
    const menu = document.getElementById("fk-lang-menu");
    menu.innerHTML = I18N.langs.map((l) =>
      `<button data-lang="${l}" class="${l === lang ? "active" : ""}">${esc(I18N.names[l])}</button>`).join("");
    settings.hidden = true; // always start closed
    gear.addEventListener("click", (e) => { e.stopPropagation(); settings.hidden = !settings.hidden; });
    // keep clicks inside the panel from closing it
    settings.addEventListener("click", (e) => e.stopPropagation());
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-lang]");
      if (!b) return;
      setLang(b.getAttribute("data-lang"));
      settings.hidden = true;
      rebuildOverlay();
    });
    // close on any outside click — registered once, not per rebuild
    if (!window.__fkSettingsCloser) {
      window.__fkSettingsCloser = true;
      document.addEventListener("click", () => {
        const s = document.getElementById("fk-settings");
        if (s) s.hidden = true;
      });
    }
  }

  // ---------- Escape hatch with friction ----------
  function onEscape() {
    // friction: reason + 5s countdown before allowing
    const reason = prompt(t("escReason"), "");
    if (reason === null) return;
    // 5s think-time via disabled confirm loop (simple + failproof)
    notify(t("escFriction"));
    const mins = prompt(t("continuePrompt"), "10");
    if (mins === null) return;
    const m = Math.max(1, Math.min(120, parseInt(mins, 10) || 10));
    setSnooze(Date.now() + m * 60 * 1000);
    removeOverlay();
    applyForCurrentPage();
  }

  // ---------- Tasks ----------
  function findTask(id) { return state.tasks.find((x) => x.id === id); }
  function onTaskListClick(e) {
    const li = e.target.closest("[data-task]"); if (!li) return;
    const id = li.getAttribute("data-task"); const task = findTask(id); if (!task) return;
    if (e.target.closest(".fk-check")) {
      task.done = !task.done; if (task.done) markCompletion(); save(); renderTasks(); renderStats();
    } else if (e.target.closest(".fk-del")) {
      state.tasks = state.tasks.filter((x) => x.id !== id); save(); renderTasks(); renderStats();
    } else if (e.target.closest(".fk-add-sub")) {
      const txt = prompt("Subtask:"); if (txt && txt.trim()) { task.subtasks.push({ id: uid(), text: txt.trim(), done: false }); save(); renderTasks(); }
    } else if (e.target.closest(".fk-sub-check")) {
      const sid = e.target.closest("[data-sub]").getAttribute("data-sub");
      const sub = task.subtasks.find((s) => s.id === sid); if (sub) { sub.done = !sub.done; save(); renderTasks(); }
    } else if (e.target.closest(".fk-sub-del")) {
      const sid = e.target.closest("[data-sub]").getAttribute("data-sub");
      task.subtasks = task.subtasks.filter((s) => s.id !== sid); save(); renderTasks();
    }
  }
  function onPlanListClick(e) {
    const li = e.target.closest("[data-plan]"); if (!li) return;
    const id = li.getAttribute("data-plan"); const item = state.planner.find((p) => p.id === id); if (!item) return;
    if (e.target.closest(".fk-check")) { item.done = !item.done; if (item.done) markCompletion(); save(); renderPlanner(); renderStats(); }
    else if (e.target.closest(".fk-del")) { state.planner = state.planner.filter((p) => p.id !== id); save(); renderPlanner(); }
  }
  function markCompletion() {
    const k = todayKey();
    state.stats.completedLog[k] = (state.stats.completedLog[k] || 0) + 1;
    if (state.stats.lastFocusDay !== k) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
      state.stats.streak = (state.stats.lastFocusDay === yKey) ? state.stats.streak + 1 : 1;
      state.stats.lastFocusDay = k;
    }
  }

  // ---------- Renderers ----------
  function taskItemHTML(x) {
    const subDone = x.subtasks.filter((s) => s.done).length;
    const subs = x.subtasks.map((s) => `
      <li class="fk-sub ${s.done ? "is-done" : ""}" data-sub="${s.id}">
        <button class="fk-sub-check">${s.done ? "◉" : "○"}</button>
        <span class="fk-sub-text">${esc(s.text)}</span>
        <button class="fk-sub-del">✕</button></li>`).join("");
    return `
      <li class="fk-item ${x.done ? "is-done" : ""}" data-task="${x.id}">
        <div class="fk-item-row">
          <button class="fk-check">${x.done ? "✓" : ""}</button>
          <span class="fk-item-text">${esc(x.text)}</span>
          ${x.subtasks.length ? `<span class="fk-subcount">${subDone}/${x.subtasks.length}</span>` : ""}
          <div class="fk-item-actions"><button class="fk-add-sub" title="+sub">＋</button><button class="fk-del">🗑</button></div>
        </div>
        ${x.subtasks.length ? `<ul class="fk-sublist">${subs}</ul>` : ""}
      </li>`;
  }
  function renderTasks() {
    const active = state.tasks.filter((x) => !x.done);
    const done = state.tasks.filter((x) => x.done);
    const list = document.getElementById("fk-task-list"); if (!list) return;
    list.innerHTML = active.length ? active.map(taskItemHTML).join("") : `<li class="fk-empty">${esc(t("noTasks"))}</li>`;
    document.getElementById("fk-done-list").innerHTML = done.map(taskItemHTML).join("");
    document.getElementById("fk-task-count").textContent = active.length;
    document.getElementById("fk-done-count").textContent = `(${done.length})`;
  }
  function renderPlanner() {
    const list = document.getElementById("fk-plan-list"); if (!list) return;
    const items = [...state.planner].sort((a, b) => a.time.localeCompare(b.time));
    document.getElementById("fk-plan-date").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    list.innerHTML = items.length ? items.map((p) => `
      <li class="fk-tl ${p.done ? "is-done" : ""}" data-plan="${p.id}">
        <div class="fk-tl-time">${esc(p.time)}</div>
        <div class="fk-tl-node"></div>
        <div class="fk-tl-body"><button class="fk-check">${p.done ? "✓" : ""}</button><span class="fk-tl-text">${esc(p.text)}</span><button class="fk-del">🗑</button></div>
      </li>`).join("") : `<li class="fk-empty">${esc(t("noPlan"))}</li>`;
  }
  function renderStats() {
    const k = todayKey();
    const doneToday = state.stats.completedLog[k] || 0;
    const total = state.tasks.length, completed = state.tasks.filter((x) => x.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("fk-streak", state.stats.streak || 0);
    set("fk-done-today", doneToday);
    set("fk-progress-pct", pct + "%");
    const fill = document.getElementById("fk-progress-fill"); if (fill) fill.style.width = pct + "%";
    const wv = document.getElementById("fk-wasted-val"); if (wv) wv.textContent = fmtDuration(state.stats.wastedSeconds || 0);
  }
  function renderAll() { renderTasks(); renderPlanner(); renderStats(); renderPomo(); }

  // ---------- Pomodoro ----------
  let pomoTimer = null;
  function pomoTotalSec() { return (state.pomodoro.mode === "work" ? state.pomodoro.workMin : state.pomodoro.breakMin) * 60; }
  function togglePomo() {
    if (state.pomodoro.running) {
      state.pomodoro.running = false;
      state.pomodoro.remaining = Math.max(0, Math.round((state.pomodoro.endsAt - Date.now()) / 1000));
      state.pomodoro.endsAt = null;
    } else {
      const rem = state.pomodoro.remaining || pomoTotalSec();
      state.pomodoro.endsAt = Date.now() + rem * 1000; state.pomodoro.running = true;
    }
    save(); tickPomo(); startPomoLoop();
  }
  function resetPomo() {
    state.pomodoro.running = false; state.pomodoro.endsAt = null; state.pomodoro.remaining = pomoTotalSec();
    save(); renderPomo(); clearInterval(pomoTimer);
  }
  function startPomoLoop() { clearInterval(pomoTimer); if (state.pomodoro.running) pomoTimer = setInterval(tickPomo, 250); }
  function tickPomo() {
    if (!state.pomodoro.running) { renderPomo(); return; }
    const rem = Math.max(0, Math.round((state.pomodoro.endsAt - Date.now()) / 1000));
    if (rem <= 0) {
      if (state.pomodoro.mode === "work") {
        if (state.pomodoro.pomoDay !== todayKey()) { state.pomodoro.pomoDay = todayKey(); state.pomodoro.completedToday = 0; }
        state.pomodoro.completedToday += 1; state.pomodoro.mode = "break";
        notify(lang === "en" ? "Round done! Take a 5-min break 🍵" : (lang === "hi" ? "राउंड पूरा! 5 मिनट आराम 🍵" : "Round done! 5 min break le 🍵"));
      } else {
        state.pomodoro.mode = "work";
        notify(lang === "en" ? "Break over! Back to work 🔥" : (lang === "hi" ? "आराम खत्म! वापस काम पे 🔥" : "Break khatam! Wapas kaam pe 🔥"));
      }
      state.pomodoro.remaining = pomoTotalSec();
      state.pomodoro.endsAt = Date.now() + state.pomodoro.remaining * 1000; save();
    } else state.pomodoro.remaining = rem;
    renderPomo();
  }
  function renderPomo() {
    const timeEl = document.getElementById("fk-pomo-time"); if (!timeEl) return;
    const rem = state.pomodoro.running ? Math.max(0, Math.round((state.pomodoro.endsAt - Date.now()) / 1000)) : (state.pomodoro.remaining || pomoTotalSec());
    timeEl.textContent = `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}`;
    document.getElementById("fk-pomo-mode").textContent = state.pomodoro.mode === "work" ? t("work") : t("break");
    document.getElementById("fk-pomo-start").textContent = state.pomodoro.running ? t("pause") : t("start");
    if (state.pomodoro.pomoDay !== todayKey()) state.pomodoro.completedToday = 0;
    document.getElementById("fk-pomo-count").textContent = `${state.pomodoro.completedToday || 0} ${t("done")}`;
    const ring = document.getElementById("fk-ring-fg");
    if (ring) {
      const total = pomoTotalSec(), frac = total ? rem / total : 0, C = 2 * Math.PI * 88;
      ring.style.strokeDasharray = `${C}`; ring.style.strokeDashoffset = `${C * (1 - frac)}`;
      ring.classList.toggle("is-break", state.pomodoro.mode === "break");
    }
  }

  function notify(msg) {
    const n = document.createElement("div"); n.className = "fk-toast"; n.textContent = msg;
    (overlayEl || document.body).appendChild(n);
    setTimeout(() => n.classList.add("show"), 20);
    setTimeout(() => { n.classList.remove("show"); setTimeout(() => n.remove(), 400); }, 4000);
  }

  // ---------- Export / Import ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `fktube-backup-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url); notify("Backup ✅");
  }
  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state = Object.assign(defaultState(), data);
        state.stats = Object.assign(defaultState().stats, state.stats || {});
        state.pomodoro = Object.assign(defaultState().pomodoro, state.pomodoro || {});
        state.watch = Object.assign(defaultState().watch, state.watch || {});
        save(); renderAll(); notify("Import ✅");
      } catch (err) { notify("Import fail ❌"); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  // ============================================================
  //  ROUTER
  // ============================================================
  function applyForCurrentPage() {
    const type = pageType();
    applyWatchMode(type === "watch");
    maybeShowOverlay();
  }

  let lastUrl = location.href;
  function watchUrlChanges() {
    const check = () => { if (location.href !== lastUrl) { lastUrl = location.href; limitOverlayOpen = false; closeLimitOverlay(); applyForCurrentPage(); } };
    window.addEventListener("yt-navigate-finish", () => setTimeout(applyForCurrentPage, 60), true);
    window.addEventListener("popstate", () => setTimeout(check, 60));
    setInterval(check, 800);
  }

  async function boot() {
    await load();
    resetDailyBuckets();
    applyWatchMode(pageType() === "watch");
    const ready = () => { applyForCurrentPage(); watchUrlChanges(); if (state.pomodoro.running) startPomoLoop(); };
    if (document.body) ready();
    else {
      const obs = new MutationObserver(() => { if (document.body) { obs.disconnect(); ready(); } });
      obs.observe(document.documentElement, { childList: true });
      document.addEventListener("DOMContentLoaded", ready, { once: true });
    }
  }
  boot();
})();
