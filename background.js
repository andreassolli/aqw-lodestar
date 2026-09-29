// Background: cross-origin fetching, context menus and opening tabs.
// Chrome runs this as a service worker and loads the shared files here;
// Firefox runs it as an event page and loads them from manifest "scripts".
// shared/aqcloset.js calls the global fetchText() defined below.
if (typeof importScripts === 'function') {
  importScripts('shared/constants.js', 'shared/aqcloset.js');
}

const FETCH_TIMEOUT_MS = 6000;
const MAX_FETCH_TIMEOUT_MS = 60000; // upper bound for callers asking for longer (e.g. big wiki listings)
const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map(); // url -> { html, baseUrl, timestamp }

const MENU_ADD_TO_FARM = 'lip-add-to-farm';
const MENU_TRY_ON = 'try-on-item';
const SITE_PATTERNS = ['*://aqwwiki.wikidot.com/*', '*://account.aq.com/*', '*://aqcloset.com/*'];
const WIKI_PATTERNS = ['*://aqwwiki.wikidot.com/*'];

// ---------- fetching ----------

async function timedFetch(url, read, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    return await read(res);
  } catch (err) {
    return { error: err.name === 'AbortError' ? `timed out after ${timeoutMs / 1000}s` : `network error (${err.message})` };
  } finally {
    clearTimeout(timer);
  }
}

/** Response body as text, or null on any failure. */
async function fetchText(url) {
  const text = await timedFetch(url, (res) => (res.ok ? res.text() : null));
  return typeof text === 'string' ? text : null;
}

/**
 * An HTML page as { html, baseUrl }, or { error } describing what went wrong.
 * Only successful pages are cached, so a failed request can be retried right away.
 */
async function fetchPage(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.timestamp < PAGE_CACHE_TTL_MS) return cached.page;

  const page = await timedFetch(
    url,
    async (res) => {
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const type = res.headers.get('content-type') || '';
      if (!type.includes('text/html')) return { error: `not an HTML page (${type || 'no content type'})` };
      return { html: await res.text(), baseUrl: res.url || url };
    },
    timeoutMs
  );

  if (page.html) pageCache.set(url, { page, timestamp: Date.now() });
  return page;
}

// ---------- messages from content scripts / popup ----------

const MESSAGE_HANDLERS = {
  FETCH_PAGE: (message) =>
    fetchPage(message.url, Math.min(Number(message.timeoutMs) || FETCH_TIMEOUT_MS, MAX_FETCH_TIMEOUT_MS)),
  FETCH_TEXT: (message) => fetchText(message.url),
  OPEN_WARDROBE: async (message) => {
    ext.tabs.create({ url: await Aqcloset.buildWardrobeUrl(message.username) });
  },
};

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message && MESSAGE_HANDLERS[message.type];
  if (!handler) return false;
  Promise.resolve(handler(message)).then(sendResponse, () => sendResponse(null));
  return true; // keep the channel open for the async response
});

// ---------- context menus ----------

ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.create({
    id: MENU_ADD_TO_FARM,
    title: 'Add to "Items to farm"',
    contexts: ['link'],
    documentUrlPatterns: SITE_PATTERNS,
    targetUrlPatterns: WIKI_PATTERNS,
  });
  ext.contextMenus.create({
    id: MENU_TRY_ON,
    title: 'Try on item',
    contexts: ['link'],
    documentUrlPatterns: SITE_PATTERNS,
  });
});

function getLinkText(tabId, linkUrl) {
  return ext.tabs
    .sendMessage(tabId, { type: 'GET_LINK_TEXT', linkUrl })
    .then((response) => (response && response.text) || null)
    .catch(() => null);
}

async function tryOnItem(tabId, linkUrl) {
  const name = await getLinkText(tabId, linkUrl);
  if (!name) return;

  const item = await Aqcloset.searchItem(name);
  if (!item) return;

  const stored = await ext.storage.local.get(STORAGE_KEYS.username);
  const url = await Aqcloset.buildWardrobeUrl(stored[STORAGE_KEYS.username], item);
  ext.tabs.create({ url });
}

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.linkUrl || !tab || !tab.id) return;

  if (info.menuItemId === MENU_ADD_TO_FARM) {
    ext.tabs.sendMessage(tab.id, { type: 'SAVE_TO_FARM', linkUrl: info.linkUrl }).catch(() => {});
  } else if (info.menuItemId === MENU_TRY_ON) {
    tryOnItem(tab.id, info.linkUrl);
  }
});
