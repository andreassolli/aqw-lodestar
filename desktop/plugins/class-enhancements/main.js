// Class Enhancements: the class guide from aqw.app. This part only downloads
// it, since aqw.app doesn't let pages read it, and keeps a copy for offline.
//
// DATA_URL is a list of classes like aqw.app's class page uses:
//   [{ name, generalLoadout: {sword, class, helm, cloak, elixir, tonic, consumable},
//      bossLoadouts: { "<boss>": {...} } }]

const fs = require('node:fs');
const path = require('node:path');

const DATA_URL = 'https://aqw.app/api/classes.json';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LOADOUT_KEYS = ['sword', 'class', 'helm', 'cloak', 'elixir', 'tonic', 'consumable'];

function cleanLoadout(loadout) {
  const result = {};
  for (const key of LOADOUT_KEYS) result[key] = loadout && loadout[key] != null ? String(loadout[key]) : '';
  return result;
}

// Checks and tidies the downloaded JSON. Throws if it's not the guide.
function parseClasses(json) {
  const list = Array.isArray(json) ? json : json && (json.classes || json.data);
  if (!Array.isArray(list)) throw new Error('the class guide had an unexpected format');
  const classes = [];
  for (const entry of list) {
    if (!entry || !entry.name) continue;
    const bossLoadouts = {};
    for (const [boss, loadout] of Object.entries(entry.bossLoadouts || {})) {
      // The site names bosses after its sheet files, so standard can be "standard".
      bossLoadouts[/^standard$/i.test(boss.trim()) ? 'Standard' : boss] = cleanLoadout(loadout);
    }
    classes.push({ name: String(entry.name), generalLoadout: cleanLoadout(entry.generalLoadout), bossLoadouts });
  }
  if (!classes.length) throw new Error('the class guide had no classes');
  return classes;
}

let api;
let cachePath;
let pending = null;

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function download() {
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

// The saved copy while it's fresh, otherwise download again. If aqw.app is down
// use the saved copy no matter how old.
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
  _parseClasses: parseClasses,
};
