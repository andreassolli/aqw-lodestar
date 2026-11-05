// Background: fetching other sites, the item catalog, right-click menus, tabs.
// Chrome loads the shared files with importScripts below. Firefox runs this as an
// event page and build.mjs copies the same list into its manifest, so add new
// shared files here and nowhere else.
if (typeof importScripts === 'function') {
  importScripts('shared/constants.js', 'shared/text.js', 'shared/item-types.js', 'shared/aqcloset.js', 'shared/sync.js');
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

async function fetchText(url) {
  const text = await timedFetch(url, (res) => (res.ok ? res.text() : null));
  return typeof text === 'string' ? text : null;
}

// Only good pages get cached so a failed one can be retried straight away.
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

// Every wiki item in one JSON, rebuilt daily. We download it once a day at most.

const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let catalogMemo = null;

async function downloadCatalog() {
  try {
    const res = await fetch(ITEM_CATALOG_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    // Usually the browser unzips it, but sometimes we get raw gzip.
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const stream = isGzip ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')) : new Blob([bytes]).stream();

    const catalog = JSON.parse(await new Response(stream).text());
    return { fetchedAt: Date.now(), updatedAt: catalog.generatedAt || null, items: catalog.items || {} };
  } catch (err) {
    return { error: err.message };
  }
}

// Refresh after a day. If the download fails, use the old copy.
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
 * Does a catalog item match a list's filter? Everything given has to match:
 *   allTags, anyTags, noneTags, rarities, nameIncludes
 *   belongsTo: { page, places } - linked from that page OR found somewhere named
 *   after one of the places
 */
function matchesFilter(item, filter, path = null, pageLinks = null) {
  const tags = item.tags || [];
  const { allTags = [], anyTags = [], noneTags = [], rarities = [], nameIncludes = '', belongsTo = null } = filter;
  return (
    allTags.every((tag) => tags.includes(tag)) &&
    (!anyTags.length || anyTags.some((tag) => tags.includes(tag))) &&
    !noneTags.some((tag) => tags.includes(tag)) &&
    (!rarities.length || rarities.includes(item.rarity)) &&
    (!nameIncludes || String(item.name || '').toLowerCase().includes(nameIncludes.toLowerCase())) &&
    (!belongsTo || belongs(item, belongsTo, path, pageLinks))
  );
}

const placePatterns = new Map();

function belongs(item, { places = [] }, path, pageLinks) {
  if (pageLinks && path && pageLinks.has(path.toLowerCase())) return true;
  if (!places.length) return false;
  const key = places.join('|');
  if (!placePatterns.has(key)) {
    const words = places.map((place) => place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    placePatterns.set(key, new RegExp(`\\b(${words.join('|')})\\b`, 'i'));
  }
  const pattern = placePatterns.get(key);
  return (item.locations || []).some((location) => pattern.test(location.name || ''));
}

// Links on pages like a staff birthday page. Cached for a day so lists open fast.
const PAGE_LINKS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const pageLinksMemo = new Map();

// All paths linked from a page, lowercased. null if we couldn't read it.
function wikiPageLinks(path) {
  if (!pageLinksMemo.has(path)) {
    pageLinksMemo.set(path, (async () => {
      const saved = ((await ext.storage.local.get(STORAGE_KEYS.pageLinks))[STORAGE_KEYS.pageLinks] || {})[path];
      if (saved && Date.now() - saved.fetchedAt < PAGE_LINKS_MAX_AGE_MS) return new Set(saved.links);
      const page = await fetchPage(`${WIKI_ORIGIN}${path}`);
      if (!page || !page.html) {
        pageLinksMemo.delete(path);
        return saved ? new Set(saved.links) : null;
      }
      const start = page.html.indexOf('id="page-content"');
      const end = page.html.indexOf('class="page-tags"', start);
      const content = start < 0 ? '' : page.html.slice(start, end < 0 ? undefined : end);
      const links = [...new Set([...content.matchAll(/href="(\/[^"#?]+)"/g)].map((m) => m[1].toLowerCase()))];
      const all = (await ext.storage.local.get(STORAGE_KEYS.pageLinks))[STORAGE_KEYS.pageLinks] || {};
      await ext.storage.local.set({ [STORAGE_KEYS.pageLinks]: { ...all, [path]: { fetchedAt: Date.now(), links } } });
      return new Set(links);
    })());
  }
  return pageLinksMemo.get(path);
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
  // Even without the page, the place names catch most items.
  const pageLinks = filter.belongsTo && filter.belongsTo.page ? await wikiPageLinks(filter.belongsTo.page) : null;

  const items = Object.entries(catalog.items)
    .filter(([path, item]) => matchesFilter(item, filter, path, pageLinks))
    .map(([path, item]) => toListItem(path, item))
    .sort(byName);
  return { items, updatedAt: catalog.updatedAt };
}

let catalogNameIndex = null;

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

// Tags only real items have. The catalog has a few event pages too ("/frostval")
// and those have none of these.
const ITEM_TYPE_TAGS = new Set(['class', 'armor', 'helm', 'back', 'pet', 'battlepet', 'ground', 'house', 'housewall', 'housefloor', 'misc', 'questitem', 'necklace',
  'sword', 'axe', 'dagger', 'gun', 'handgun', 'rifle', 'bow', 'mace', 'polearm', 'staff', 'wand', 'whip', 'gauntlet', 'scythe']);
const isCatalogItem = (item) => Boolean(item) && ((item.images || []).length > 0 || (item.tags || []).some((tag) => ITEM_TYPE_TAGS.has(tag)));

/**
 * Which wiki links are items. Goes by the path, not the text, since a map or
 * monster can have the same name as an item. A disambiguation page counts if it
 * leads to an item with that name.
 */
async function classifyLinks(entries) {
  const catalog = await loadCatalog();
  if (catalog.error) return { error: `item catalog unavailable (${catalog.error})` };
  const byName = catalogByName(catalog);
  const items = (entries || []).map(({ path, name }) => {
    const key = String(path || '').toLowerCase().replace(/\/+$/, '');
    if (!key) return false;
    if (isCatalogItem(catalog.items[key])) return true;
    const sameName = byName.get(normalizeItemName(name || '')) || [];
    return sameName.some(([itemPath, item]) => itemPath.startsWith(`${key}-`) && isCatalogItem(item));
  });
  return { items };
}

/**
 * The synced inventory as list items. Inventory names don't have "(AC)" etc, so
 * we match exactly first and fall back to the first catalog variant.
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
    if (!key || seen.has(key)) continue; // inventory and bank can both have it
    seen.add(key);

    const matches = index.get(key) || [];
    const exact = matches.find(([, item]) => item.name.toLowerCase() === String(entry.name).toLowerCase()) || matches[0];
    const item = exact
      ? toListItem(...exact)
      : { url: wikiUrlFromName(entry.name), name: entry.name, tags: [], rarity: null, price: null, locations: [], images: [] };
    // The game's own type, used when the tags don't say.
    item.inventoryType = entry.type || null;
    if (item.url && matchesFilter(item, filter)) items.push(item);
  }

  items.sort(byName);
  return { items, updatedAt: catalog.error ? null : catalog.updatedAt };
}

function wikiPath(url) {
  try {
    return new URL(url).pathname.toLowerCase().replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}

// Older farm entries kept images under wikiInfo.images.
function farmEntryImages(entry) {
  if (Array.isArray(entry.image)) return entry.image;
  if (typeof entry.image === 'string' && entry.image) return [entry.image];
  return (entry.wikiInfo && entry.wikiInfo.images) || [];
}

// The farm list in its own order, using catalog data when we have it.
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

let catalogExactNames = null;

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

// "0ac" items have both tags, those can be had without spending AC.
const isAcItem = (item) => item.tags.includes('ac') && !item.tags.includes('0ac');

// The wiki page for a name and type from the account site. Names there have no
// "(Class)" or "(AC)", so CardClasher could be either of two pages without the type.
async function findItemPageByType({ name, itemType, ac = null }) {
  const catalog = await loadCatalog();
  if (catalog.error) return null;

  const wanted = ItemTypes.fromSiteType(itemType);
  const named = catalogByName(catalog).get(normalizeItemName(name)) || [];
  const matches = wanted
    ? named.filter(([, item]) => ItemTypes.sameType(ItemTypes.itemType(item), wanted))
    : named;

  const pick =
    matches.find(([, item]) => item.name.toLowerCase() === name.toLowerCase()) ||
    (ac !== null && matches.find(([, item]) => isAcItem(item) === ac)) ||
    matches[0];
  return pick ? { path: pick[0] } : null;
}

// Imgur blocks the UK by sending the same "not available in your region" image
// for everything. So we load a few different images and if they're identical,
// it's blocked. Checked every 15 min at most so a VPN change is noticed.

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
  const blocked = prints.every((p) => p === null) || (prints.every((p) => p) && new Set(prints).size === 1);
  const result = { at: Date.now(), blocked };
  await ext.storage.local.set({ [STORAGE_KEYS.imgurCheck]: result });
  return result;
}

async function checkImgurBlocked(hints) {
  const stored = (await ext.storage.local.get(STORAGE_KEYS.imgurCheck))[STORAGE_KEYS.imgurCheck];
  if (stored && Date.now() - stored.at < IMGUR_CHECK_TTL_MS) return stored;
  imgurCheckPending = imgurCheckPending || runImgurCheck(hints).finally(() => (imgurCheckPending = null));
  return imgurCheckPending;
}

const ITEM_SOURCES = { catalog: queryItems, inventory: queryOwnedItems, farm: queryFarmItems };

// Sync with the desktop app. The app runs this file too but has no alarms,
// since it's the server.
const syncClient = ext.alarms ? LodestarSync.createClient({ ext, keys: STORAGE_KEYS }) : null;
if (syncClient) syncClient.start();

const MESSAGE_HANDLERS = {
  SYNC_STATUS: () => (syncClient ? syncClient.status() : null),
  SYNC_PAIR_LATER: (message) => syncClient.pairLater(message.code, message.mode).then(() => ({ ok: true })),
  SYNC_PAIR: () => syncClient.pairPending().then(() => ({ ok: true }), (err) => ({ error: err.message })),
  SYNC_NOW: () => syncClient.syncNow().then(() => ({ ok: true }), (err) => ({ error: err.message })),
  SYNC_UNPAIR: () => syncClient.unpair().then(() => ({ ok: true })),
  FETCH_PAGE: (message) => fetchPage(message.url),
  FIND_ITEM_PAGE: findItemPageByType,
  QUERY_ITEMS: (message) => (ITEM_SOURCES[message.source] || queryItems)(message.filter),
  LOOKUP_ITEMS: (message) => lookupItems(message.entries),
  CLASSIFY_LINKS: (message) => classifyLinks(message.entries),
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
  return true; // keeps the channel open
});

// onInstalled also fires on updates/reloads when the menus might still exist,
// so remove them first to avoid duplicate id errors.
// The tooltip used to have its own switch. If it was off, set the tooltip
// position to "off" instead.
(async () => {
  const stored = await ext.storage.local.get(STORAGE_KEYS.disabledFeatures);
  const off = stored[STORAGE_KEYS.disabledFeatures] || [];
  if (!off.includes('hoverTooltip')) return;
  await ext.storage.local.set({ [STORAGE_KEYS.tooltipPlacement]: 'off', [STORAGE_KEYS.disabledFeatures]: off.filter((id) => id !== 'hoverTooltip') });
})().catch(() => {});

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

async function openTryOn(name) {
  const search = getBaseName(name);
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
