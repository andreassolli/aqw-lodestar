// Background: cross-origin fetching, the daily item catalog, context menus and
// opening tabs.
// Chrome runs this as a service worker and loads the shared files with the
// importScripts() call below. Firefox runs it as an event page instead: there
// the build script (scripts/build.mjs) lists the same files, in the same order,
// under "background.scripts" in the Firefox manifest. So this importScripts()
// line is the one place to add a shared file the background needs.
// shared/aqcloset.js calls the global fetchText() defined below.
if (typeof importScripts === 'function') {
  importScripts('shared/constants.js', 'shared/text.js', 'shared/aqcloset.js');
}

const FETCH_TIMEOUT_MS = 6000;
const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map(); // url -> { html, baseUrl, timestamp }

const MENU_ADD_TO_FARM = 'lip-add-to-farm';
const MENU_TRY_ON = 'try-on-item';
const SITE_PATTERNS = ['*://aqwwiki.wikidot.com/*', '*://account.aq.com/*', '*://aqcloset.com/*'];
const WIKI_PATTERNS = ['*://aqwwiki.wikidot.com/*'];

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
async function fetchPage(url) {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.timestamp < PAGE_CACHE_TTL_MS) return cached.page;

  const page = await timedFetch(
    url,
    async (res) => {
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const type = res.headers.get('content-type') || '';
      if (!type.includes('text/html')) return { error: `not an HTML page (${type || 'no content type'})` };
      return { html: await res.text(), baseUrl: res.url || url };
    }
  );

  if (page.html) pageCache.set(url, { page, timestamp: Date.now() });
  return page;
}

// One JSON of every wiki item, rebuilt daily by the updateItemCatalog function.
// Downloaded at most once a day and kept in storage (needs unlimitedStorage).

const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let catalogMemo = null; // { fetchedAt, updatedAt, items }

async function downloadCatalog() {
  try {
    const res = await fetch(ITEM_CATALOG_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    // Normally the browser unzips it; if the server sent raw gzip bytes, unzip here.
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const stream = isGzip ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')) : new Blob([bytes]).stream();

    const catalog = JSON.parse(await new Response(stream).text());
    return { fetchedAt: Date.now(), updatedAt: catalog.generatedAt || null, items: catalog.items || {} };
  } catch (err) {
    return { error: err.message };
  }
}

/** The catalog, refreshed when older than a day; a stale copy is used if the download fails. */
async function loadCatalog() {
  const isFresh = (c) => c && Date.now() - c.fetchedAt < CATALOG_MAX_AGE_MS;
  if (isFresh(catalogMemo)) return catalogMemo;

  const stored = (await ext.storage.local.get(STORAGE_KEYS.itemCatalog))[STORAGE_KEYS.itemCatalog];
  if (isFresh(stored)) return (catalogMemo = stored);

  const fresh = await downloadCatalog();
  if (!fresh.error) {
    await ext.storage.local.set({ [STORAGE_KEYS.itemCatalog]: fresh });
    return (catalogMemo = fresh);
  }
  if (stored) return (catalogMemo = stored);
  return { error: fresh.error };
}

/**
 * Whether a catalog item passes a list filter. All conditions given must hold:
 *   allTags: every one of these tags     anyTags: at least one of these tags
 *   noneTags: none of these tags         rarities: one of these rarity keys
 *   nameIncludes: text in the item name (any case)
 */
function matchesFilter(item, filter) {
  const tags = item.tags || [];
  const { allTags = [], anyTags = [], noneTags = [], rarities = [], nameIncludes = '' } = filter;
  return (
    allTags.every((tag) => tags.includes(tag)) &&
    (!anyTags.length || anyTags.some((tag) => tags.includes(tag))) &&
    !noneTags.some((tag) => tags.includes(tag)) &&
    (!rarities.length || rarities.includes(item.rarity)) &&
    (!nameIncludes || String(item.name || '').toLowerCase().includes(nameIncludes.toLowerCase()))
  );
}

function toListItem(path, item) {
  return {
    url: `${WIKI_ORIGIN}${path}`,
    name: item.name,
    tags: item.tags || [],
    rarity: item.rarity,
    price: item.price,
    locations: item.locations || [],
    images: item.images || [],
  };
}

const byName = (a, b) => a.name.localeCompare(b.name);

async function queryItems(filter = {}) {
  const catalog = await loadCatalog();
  if (catalog.error) return { error: `item catalog unavailable (${catalog.error})` };

  const items = Object.entries(catalog.items)
    .filter(([, item]) => matchesFilter(item, filter))
    .map(([path, item]) => toListItem(path, item))
    .sort(byName);
  return { items, updatedAt: catalog.updatedAt };
}

let catalogNameIndex = null; // { catalog, index: Map<normalized name, [path, item][]> }

/** Catalog entries by normalized name, built once per catalog. */
function catalogByName(catalog) {
  if (catalogNameIndex && catalogNameIndex.catalog === catalog) return catalogNameIndex.index;
  const index = new Map();
  for (const [path, item] of Object.entries(catalog.items)) {
    const key = normalizeItemName(item.name);
    if (!key) continue;
    if (index.has(key)) index.get(key).push([path, item]);
    else index.set(key, [[path, item]]);
  }
  catalogNameIndex = { catalog, index };
  return index;
}

/**
 * The synced inventory as list items. Inventory names have no "(AC)"-style
 * suffix, so they're matched like the owned checkmarks are: an exact name match
 * if there is one, otherwise the first catalog variant. Items the catalog doesn't
 * know still get an entry (linking to their wiki page by name).
 */
async function queryOwnedItems(filter = {}) {
  const inventory = (await ext.storage.local.get(STORAGE_KEYS.inventory))[STORAGE_KEYS.inventory];
  if (!Array.isArray(inventory) || !inventory.length) return { items: [], noInventory: true };

  const catalog = await loadCatalog();
  const index = catalog.error ? new Map() : catalogByName(catalog);
  const seen = new Set();
  const items = [];

  for (const entry of inventory) {
    const key = normalizeItemName(entry.name);
    if (!key || seen.has(key)) continue; // inventory and bank can list the same item
    seen.add(key);

    const matches = index.get(key) || [];
    const exact = matches.find(([, item]) => item.name.toLowerCase() === String(entry.name).toLowerCase()) || matches[0];
    const item = exact
      ? toListItem(...exact)
      : { url: wikiUrlFromName(entry.name), name: entry.name, tags: [], rarity: null, price: null, locations: [], images: [] };
    if (item.url && matchesFilter(item, filter)) items.push(item);
  }

  items.sort(byName);
  return { items, updatedAt: catalog.error ? null : catalog.updatedAt };
}

/** Wiki path of a farm entry's URL, as the catalog keys it: "/awescended-cutlass-ac". */
function wikiPath(url) {
  try {
    return new URL(url).pathname.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}

/** Saved farm entries kept image lists under image (newer) or wikiInfo.images (older). */
function farmEntryImages(entry) {
  if (Array.isArray(entry.image)) return entry.image;
  if (typeof entry.image === 'string' && entry.image) return [entry.image];
  return (entry.wikiInfo && entry.wikiInfo.images) || [];
}

/**
 * The farm list as list items, in the list's own order. Catalog data is used
 * where the catalog knows the page; otherwise what was saved with the entry.
 */
async function queryFarmItems(filter = {}) {
  const farm = (await ext.storage.local.get(STORAGE_KEYS.farmItems))[STORAGE_KEYS.farmItems];
  if (!Array.isArray(farm) || !farm.length) return { items: [], noFarmItems: true };

  const catalog = await loadCatalog();
  const known = catalog.error ? {} : catalog.items;
  const items = [];
  for (const entry of farm) {
    if (!entry || !entry.url) continue;
    const path = wikiPath(entry.url);
    const item = path && known[path]
      ? toListItem(path, known[path])
      : {
          url: entry.url,
          name: entry.text || path,
          tags: [],
          rarity: null,
          price: entry.price || null,
          locations: (entry.locations || []).map((location) => ({ name: location.name, paths: location.hrefs || [] })),
          images: farmEntryImages(entry),
        };
    if (matchesFilter(item, filter)) items.push(item);
  }
  return { items, updatedAt: catalog.error ? null : catalog.updatedAt };
}

let catalogExactNames = null; // { catalog, index: Map<exact name, item> }

/** Rarity and tags per { name, path } (see lookupItems in shared/messaging.js). */
async function lookupItems(entries = []) {
  const catalog = await loadCatalog();
  if (catalog.error) return { error: `item catalog unavailable (${catalog.error})` };

  if (!catalogExactNames || catalogExactNames.catalog !== catalog) {
    const index = new Map();
    for (const item of Object.values(catalog.items)) if (item.name && !index.has(item.name)) index.set(item.name, item);
    catalogExactNames = { catalog, index };
  }

  const items = entries.map(({ name, path } = {}) => {
    const item =
      (name && catalogExactNames.index.get(name)) ||
      (path && (catalog.items[path] || catalog.items[path.toLowerCase()])) ||
      null;
    return item ? { rarity: item.rarity || null, tags: item.tags || [] } : null;
  });
  return { items };
}

// Imgur blocks the UK by answering every image request with the same "not
// viewable in your region" picture, which loads like any other image. So: fetch
// a few different Imgur images, and if they're all byte-for-byte the same, it's
// that placeholder. Checked at most every 15 minutes, so switching a VPN on or
// off is picked up soon.

const IMGUR_CHECK_TTL_MS = 15 * 60 * 1000;
const IMGUR_SAMPLES = 3;
let imgurCheckPending = null;

const isImgurUrl = (url) => {
  try {
    const host = new URL(url).hostname;
    return host === 'imgur.com' || host.endsWith('.imgur.com');
  } catch {
    return false;
  }
};

async function imageFingerprint(url) {
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return null;
    const digest = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Imgur image URLs to test with: the ones the page has, then some from the catalog. */
async function imgurSamples(hints) {
  const urls = new Set((hints || []).filter(isImgurUrl));
  if (urls.size < IMGUR_SAMPLES) {
    const catalog = await loadCatalog();
    if (!catalog.error) {
      for (const item of Object.values(catalog.items)) {
        for (const image of item.images || []) if (isImgurUrl(image)) urls.add(image);
        if (urls.size >= IMGUR_SAMPLES * 3) break;
      }
    }
  }
  return [...urls].slice(0, IMGUR_SAMPLES);
}

async function runImgurCheck(hints) {
  const samples = await imgurSamples(hints);
  if (samples.length < 2) return { blocked: false, unknown: true };
  const prints = await Promise.all(samples.map(imageFingerprint));
  // Every request failing also means the images won't show.
  const blocked = prints.every((p) => p === null) || (prints.every((p) => p) && new Set(prints).size === 1);
  const result = { at: Date.now(), blocked };
  await ext.storage.local.set({ [STORAGE_KEYS.imgurCheck]: result });
  return result;
}

async function checkImgurBlocked(hints) {
  const stored = (await ext.storage.local.get(STORAGE_KEYS.imgurCheck))[STORAGE_KEYS.imgurCheck];
  if (stored && Date.now() - stored.at < IMGUR_CHECK_TTL_MS) return stored;
  // Pages opening together share one check.
  imgurCheckPending = imgurCheckPending || runImgurCheck(hints).finally(() => (imgurCheckPending = null));
  return imgurCheckPending;
}

const ITEM_SOURCES = { catalog: queryItems, inventory: queryOwnedItems, farm: queryFarmItems };

const MESSAGE_HANDLERS = {
  FETCH_PAGE: (message) => fetchPage(message.url),
  QUERY_ITEMS: (message) => (ITEM_SOURCES[message.source] || queryItems)(message.filter),
  LOOKUP_ITEMS: (message) => lookupItems(message.entries),
  FETCH_TEXT: (message) => fetchText(message.url),
  TRY_ON: (message) => openTryOn(message.name),
  CHECK_IMGUR: (message) => checkImgurBlocked(message.hints),
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

// onInstalled also fires on every update and reload, when the menus may still
// exist; removing them first avoids "duplicate id" errors.
ext.runtime.onInstalled.addListener(async () => {
  await ext.contextMenus.removeAll();
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

/** Opens the AQCloset wardrobe wearing the saved character's outfit plus this item. */
async function openTryOn(name) {
  const search = getBaseName(name); // AQCloset names have no "(AC)"-style suffix
  const item = (await Aqcloset.searchItem(search)) || (search !== name ? await Aqcloset.searchItem(name) : null);
  if (!item || !item.slot || !item.file) return { error: 'not on AQCloset' };

  const stored = await ext.storage.local.get(STORAGE_KEYS.username);
  const url = await Aqcloset.buildWardrobeUrl(stored[STORAGE_KEYS.username], item);
  await ext.tabs.create({ url });
  return { ok: true };
}

async function tryOnItem(tabId, linkUrl) {
  const name = await getLinkText(tabId, linkUrl);
  if (name) await openTryOn(name);
}

ext.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.linkUrl || !tab || !tab.id) return;

  if (info.menuItemId === MENU_ADD_TO_FARM) {
    ext.tabs.sendMessage(tab.id, { type: 'SAVE_TO_FARM', linkUrl: info.linkUrl }).catch(() => {});
  } else if (info.menuItemId === MENU_TRY_ON) {
    tryOnItem(tab.id, info.linkUrl);
  }
});
