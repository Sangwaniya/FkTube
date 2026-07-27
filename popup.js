/* Popup logic — i18n aware */
const STORAGE_KEY = "fktube_state_v1";
const SNOOZE_KEY = "fktube_snooze_until";
const LANG_KEY = "fktube_lang";

let lang = "hi";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderLangButtons() {
  const wrap = document.getElementById("langbtns");
  wrap.innerHTML = "";
  FK_I18N.langs.forEach((l) => {
    const b = document.createElement("button");
    b.textContent = FK_I18N.names[l];
    if (l === lang) b.classList.add("active");
    b.addEventListener("click", () => {
      lang = l;
      chrome.storage.local.set({ [LANG_KEY]: l });
      renderAll();
    });
    wrap.appendChild(b);
  });
}

function renderAll() {
  const t = (k) => FK_I18N.t(lang, k);
  document.documentElement.lang = lang === "en" ? "en" : "hi";
  document.getElementById("title").textContent = t("title");
  document.getElementById("meme").textContent = FK_I18N.memeRandom(lang);
  document.getElementById("l-streak").textContent = t("streak");
  document.getElementById("l-done").textContent = t("doneToday");
  document.getElementById("l-pending").textContent = t("tasks");
  document.getElementById("open-yt").textContent = "▶ " + (lang === "en" ? "Open dashboard" : lang === "hi" ? "डैशबोर्ड खोलो" : "Dashboard kholo");
  document.getElementById("end-snooze").textContent = lang === "en" ? "End snooze — back to focus 🔥" : lang === "hi" ? "स्नूज़ खत्म — वापस फोकस 🔥" : "Snooze khatam — wapas focus 🔥";
  document.getElementById("foot").innerHTML = `${t("footer")} <b>${t("tagline")}</b>`;
  renderLangButtons();
  refreshStats();
}

function refreshStats() {
  chrome.storage.local.get([STORAGE_KEY, SNOOZE_KEY], (res) => {
    const st = res[STORAGE_KEY] || {};
    const stats = st.stats || {};
    const tasks = st.tasks || [];
    const pending = tasks.filter((x) => !x.done).length;
    const doneToday = (stats.completedLog && stats.completedLog[todayKey()]) || 0;
    document.getElementById("s-streak").textContent = stats.streak || 0;
    document.getElementById("s-done").textContent = doneToday;
    document.getElementById("s-tasks").textContent = pending;

    const snoozeUntil = res[SNOOZE_KEY] || 0;
    const statusEl = document.getElementById("status");
    const endBtn = document.getElementById("end-snooze");
    if (Date.now() < snoozeUntil) {
      const mins = Math.ceil((snoozeUntil - Date.now()) / 60000);
      statusEl.textContent = (lang === "en" ? `😔 Snooze on — ${mins} min left.` : lang === "hi" ? `😔 स्नूज़ ऑन — ${mins} मिनट बाकी।` : `😔 Snooze on — ${mins} min baaki.`);
      statusEl.classList.add("snoozed");
      endBtn.hidden = false;
    } else {
      statusEl.textContent = (lang === "en" ? "Focus mode active ✅" : lang === "hi" ? "फोकस मोड चालू ✅" : "Focus mode active ✅");
      statusEl.classList.remove("snoozed");
      endBtn.hidden = true;
    }
  });
}

document.getElementById("open-yt").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.youtube.com/" });
});
document.getElementById("end-snooze").addEventListener("click", () => {
  chrome.storage.local.set({ [SNOOZE_KEY]: 0 }, () => {
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => tabs.forEach((t) => chrome.tabs.reload(t.id)));
    window.close();
  });
});

chrome.storage.local.get([LANG_KEY], (res) => {
  lang = res[LANG_KEY] || "hi";
  renderAll();
});
