// The desktop app's stand-in for the extension's storage.local: the same
// get / set / remove calls and onChanged events, kept as one JSON file per key
// in the app's data folder (so the big item catalog doesn't get rewritten every
// time a setting changes).
//
// Mac:     ~/Library/Application Support/AQW Lodestar/storage/
// Windows: %APPDATA%\AQW Lodestar\storage\

const fs = require('node:fs');
const path = require('node:path');

function createStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (key) => path.join(dir, `${encodeURIComponent(key)}.json`);
  const data = new Map();
  const listeners = new Set();

  // Load everything once; it's small apart from the catalog, which the popup reads anyway.
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      data.set(decodeURIComponent(name.slice(0, -5)), JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch (err) {
      console.warn(`Skipping unreadable storage file ${name}: ${err.message}`);
    }
  }

  // Write to a temporary file, then rename, so a crash mid-write never leaves half a file.
  function persist(key) {
    const file = fileFor(key);
    if (!data.has(key)) {
      fs.rm(file, { force: true }, () => {});
      return;
    }
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data.get(key)));
    fs.renameSync(temp, file);
  }

  const clone = (value) => (value === undefined ? undefined : structuredClone(value));

  function emit(changes) {
    if (!Object.keys(changes).length) return;
    for (const listener of listeners) {
      try {
        listener(changes, 'local');
      } catch (err) {
        console.error(err);
      }
    }
  }

  /** Same arguments as chrome.storage.local.get: null, a key, a list of keys, or { key: default }. */
  async function get(keys) {
    const result = {};
    if (keys === null || keys === undefined) {
      for (const [key, value] of data) result[key] = clone(value);
    } else if (typeof keys === 'string') {
      if (data.has(keys)) result[keys] = clone(data.get(keys));
    } else if (Array.isArray(keys)) {
      for (const key of keys) if (data.has(key)) result[key] = clone(data.get(key));
    } else if (typeof keys === 'object') {
      for (const [key, fallback] of Object.entries(keys)) result[key] = data.has(key) ? clone(data.get(key)) : fallback;
    }
    return result;
  }

  async function set(items) {
    const changes = {};
    for (const [key, value] of Object.entries(items || {})) {
      if (value === undefined) continue;
      changes[key] = { oldValue: data.get(key), newValue: clone(value) };
      data.set(key, clone(value));
      persist(key);
    }
    emit(changes);
  }

  async function remove(keys) {
    const changes = {};
    for (const key of [].concat(keys)) {
      if (!data.has(key)) continue;
      changes[key] = { oldValue: data.get(key) };
      data.delete(key);
      persist(key);
    }
    emit(changes);
  }

  async function clear() {
    await remove([...data.keys()]);
  }

  return {
    local: { get, set, remove, clear },
    onChanged: {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      hasListener: (fn) => listeners.has(fn),
    },
  };
}

module.exports = { createStorage };
