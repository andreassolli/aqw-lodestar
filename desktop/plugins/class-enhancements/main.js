// Class Enhancements: the class guide from aqw.app (each class's enhancements
// and consumables, in general and per boss). Runs in Lodestar's main process
// only to download the guide: aqw.app doesn't allow other sites to read it from
// a page, and here it can also be kept for when the app is offline.
//
// The guide is read from DATA_URL, a JSON list of classes in the shape
// aqw.app's class page uses (see README.md):
//   [{ name, generalLoadout: {sword, class, helm, cloak, elixir, tonic, consumable},
//      bossLoadouts: { "<boss>": {...same...} } }, ...]
// ({ classes: [...] } works too.)

const fs = require('node:fs');
const path = require('node:path');

const DATA_URL = 'https://aqw.app/api/classes.json';
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // download again after this long
const LOADOUT_KEYS = ['sword', 'class', 'helm', 'cloak', 'elixir', 'tonic', 'consumable'];

/** A loadout with every field a string ("" when missing). */
function cleanLoadout(loadout) {
  const result = {};
  for (const key of LOADOUT_KEYS) result[key] = loadout && loadout[key] != null ? String(loadout[key]) : '';
  return result;
}

/** The classes in the downloaded JSON, checked and tidied; throws if it isn't the guide. */
function parseClasses(json) {
  const list = Array.isArray(json) ? json : json && (json.classes || json.data);
  if (!Array.isArray(list)) throw new Error('the class guide had an unexpected format');
  const classes = [];
  for (const entry of list) {
    if (!entry || !entry.name) continue;
    const bossLoadouts = {};
    for (const [boss, loadout] of Object.entries(entry.bossLoadouts || {})) {
      // The website names bosses after its sheet files (src/data/sheets/<boss>.csv),
      // so the standard sheet may come as "standard".
      bossLoadouts[/^standard$/i.test(boss.trim()) ? 'Standard' : boss] = cleanLoadout(loadout);
    }
    classes.push({ name: String(entry.name), generalLoadout: cleanLoadout(entry.generalLoadout), bossLoadouts });
  }
  if (!classes.length) throw new Error('the class guide had no classes');
  return classes;
}

let api;
let cachePath;
let pending = null; // one download at a time

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function download() {
  // Electron's net.fetch goes through the same network settings (proxies) as the app.
  const doFetch = api.electron?.net?.fetch ? (url, init) => api.electron.net.fetch(url, init) : fetch;
  const response = await doFetch(`${DATA_URL}?_=${Date.now()}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`aqw.app answered ${response.status}`);
  const classes = parseClasses(await response.json());
  const cache = { fetchedAt: Date.now(), classes };
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  } catch (err) {
    api.log("couldn't keep the class guide:", err.message);
  }
  return cache;
}

/**
 * The guide: the kept copy while it's fresh, otherwise downloaded again. When
 * aqw.app can't be reached, the kept copy is used however old it is (stale: true).
 */
async function getClasses({ refresh = false } = {}) {
  const cache = readCache();
  if (cache && !refresh && Date.now() - cache.fetchedAt < MAX_AGE_MS) return { ...cache, stale: false };
  try {
    pending = pending || download();
    return { ...(await pending), stale: false };
  } catch (err) {
    if (cache) return { ...cache, stale: true, error: err.message };
    throw err;
  } finally {
    pending = null;
  }
}

module.exports = {
  activate(pluginApi) {
    api = pluginApi;
    cachePath = path.join(api.dataDir, 'classes.json');
    api.page.handle('classes', (options) => getClasses(options || {}));
  },
  deactivate() {},
  // For tests.
  _parseClasses: parseClasses,
};
