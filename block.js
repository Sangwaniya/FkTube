/* Block page logic — reads lang, renders motivational content */
const LANG_KEY = "fktube_lang";

function paramHost() {
  const p = new URLSearchParams(location.search).get("d");
  return p ? decodeURIComponent(p) : "";
}

function render(lang) {
  const t = (k) => FK_I18N.t(lang, k);
  document.documentElement.lang = lang === "en" ? "en" : "hi";
  document.getElementById("t-title").textContent = t("blockTitle");
  document.getElementById("t-sub").textContent = t("blockSub");
  document.getElementById("t-line").textContent = t("blockLine");
  document.getElementById("t-meme").textContent = t("blockMeme");
  document.getElementById("t-btn").textContent = t("blockBtn");
  const host = paramHost();
  document.getElementById("host").textContent = host ? "blocked: " + host : "";

  // language switcher
  const wrap = document.getElementById("lang");
  wrap.innerHTML = "";
  FK_I18N.langs.forEach((l) => {
    const b = document.createElement("button");
    b.textContent = FK_I18N.names[l];
    if (l === lang) b.classList.add("active");
    b.addEventListener("click", () => {
      chrome.storage.local.set({ [LANG_KEY]: l });
      render(l);
    });
    wrap.appendChild(b);
  });
}

document.getElementById("t-btn").addEventListener("click", () => {
  // go somewhere productive instead
  location.href = "https://www.google.com/";
});

chrome.storage.local.get([LANG_KEY], (res) => {
  render(res[LANG_KEY] || "hi");
});

// wire button after render too (handler above targets the element which persists)
