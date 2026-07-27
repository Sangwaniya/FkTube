/* ============================================================
   Background service worker
   - Keyword-heuristic adult blocking (catches sites not in rules.json)
   - Static domain blocking is handled by declarativeNetRequest (rules.json)
   ============================================================ */

// URL keyword heuristics. Kept conservative to avoid false positives.
// Matches whole-word-ish tokens in hostname or path.
const ADULT_KEYWORDS = [
  "porn", "xxx", "xnxx", "hentai", "camgirl", "camsex", "sexcam",
  "nsfw", "escort", "fuck", "milf", "bdsm", "cumshot", "creampie",
  "onlyfans", "rule34", "javhd", "brazzers", "redtube", "xvideos",
  "xhamster", "erotic", "nudes", "sexvideo", "adultvideo"
];

// Words that commonly cause false positives — require stronger signal.
// e.g. "sex" appears in "essex", "sussex", "middlesex", "sextet", "sexton"
const SAFE_HOST_ALLOW = [
  "essex", "sussex", "middlesex", "wessex", "sextant", "sexton",
  "scunthorpe", "analytics", "analysis", "therapist", "grape",
  "expertsexchange", "penistone", "assess", "class", "assassin",
  "cockburn", "shitake"
];

function isAdultUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch (e) { return false; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const hay = host + " " + path;

  // never touch our own pages / extension pages / common safe hosts
  if (url.protocol.startsWith("chrome") || url.protocol === "chrome-extension:") return false;
  if (host.endsWith("google.com") || host.endsWith("youtube.com") ||
      host.endsWith("wikipedia.org") || host.endsWith("github.com")) return false;

  for (const safe of SAFE_HOST_ALLOW) {
    if (host.includes(safe)) return false;
  }

  // strong tokens: block outright
  const strong = ["porn", "xxx", "xnxx", "hentai", "xvideos", "xhamster",
                  "redtube", "brazzers", "camsex", "sexcam", "camgirl", "rule34",
                  "javhd", "milfporn", "nsfw"];
  for (const kw of strong) {
    if (host.includes(kw)) return true;
  }

  // weaker tokens: need it in host to trigger (path-only is too noisy)
  for (const kw of ADULT_KEYWORDS) {
    if (host.includes(kw)) return true;
  }
  return false;
}

function blockTab(tabId, offendingUrl) {
  const target = chrome.runtime.getURL(
    "block.html?d=" + encodeURIComponent(new URL(offendingUrl).hostname)
  );
  chrome.tabs.update(tabId, { url: target });
}

// Watch navigations (heuristic layer on top of DNR static list)
chrome.webNavigation && chrome.webNavigation.onBeforeNavigate
  ? chrome.webNavigation.onBeforeNavigate.addListener((d) => {
      if (d.frameId !== 0) return;
      if (isAdultUrl(d.url)) blockTab(d.tabId, d.url);
    })
  : null;

// Fallback: also check on committed navigations / tab updates
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && isAdultUrl(info.url)) {
    blockTab(tabId, info.url);
  }
});
