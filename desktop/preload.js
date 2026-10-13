// Gives the popup and backup pages the extension API they expect, as
// `browser` (shared/constants.js picks it up as `ext`). Every call is passed to
// the main process (main.js), which holds the storage and runs background.js.
// Also exposes `lodestarDesktop` for the desktop-only controls (stay on top).

const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info'); // { version, platform }
const ROOT = 'app://lodestar/';

const storageListeners = new Set();
ipcRenderer.on('storage:changed', (_event, changes) => {
  for (const listener of storageListeners) {
    try {
      listener(changes, 'local');
    } catch (err) {
      console.error(err);
    }
  }
});

const pinnedListeners = new Set();
ipcRenderer.on('window:pinned', (_event, pinned) => {
  for (const listener of pinnedListeners) listener(pinned);
});

const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };

// Messages from plugins to their pages: plugin id -> channel -> listeners.
const pluginListeners = new Map();
ipcRenderer.on('plugin:event', (_event, { id, channel, data }) => {
  for (const listener of pluginListeners.get(id)?.get(channel) || []) {
    try {
      listener(data);
    } catch (err) {
      console.error(err);
    }
  }
});

/** Unwraps { ok, value } / { ok: false, error } from main.js into a value or a thrown Error. */
async function unwrap(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

contextBridge.exposeInMainWorld('browser', {
  storage: {
    local: {
      get: (keys = null) => ipcRenderer.invoke('storage', 'get', keys),
      set: (items) => ipcRenderer.invoke('storage', 'set', items),
      remove: (keys) => ipcRenderer.invoke('storage', 'remove', keys),
      clear: () => ipcRenderer.invoke('storage', 'clear'),
    },
    onChanged: {
      // Braces, so nothing is returned: Electron can't pass a Set back to the page
      // and would throw, stopping the rest of the calling script.
      addListener: (fn) => {
        storageListeners.add(fn);
      },
      removeListener: (fn) => {
        storageListeners.delete(fn);
      },
      hasListener: (fn) => storageListeners.has(fn),
    },
  },
  runtime: {
    id: 'aqw-lodestar-desktop',
    sendMessage: (message) => ipcRenderer.invoke('runtime:message', message),
    getURL: (file) => ROOT + String(file).replace(/^\/+/, ''),
    getManifest: () => ({ name: 'AQW Lodestar', version: info.version }),
    onMessage: noopEvent,
  },
  tabs: {
    create: ({ url } = {}) => ipcRenderer.invoke('tabs:create', url),
    query: async () => [],
    sendMessage: async () => {
      throw new Error('There are no browser tabs in the desktop app');
    },
  },
});

contextBridge.exposeInMainWorld('lodestarDesktop', {
  platform: info.platform,
  version: info.version,
  getPinned: () => ipcRenderer.invoke('window:get-pinned'),
  setPinned: (pinned) => ipcRenderer.invoke('window:set-pinned', Boolean(pinned)),
  onPinnedChange: (fn) => {
    pinnedListeners.add(fn);
  },
  importFromChrome: (id) => ipcRenderer.invoke('chrome:import', id),
});

// Plugins: managing them (Settings → Plugins) and talking to them from their pages.
// Nothing here returns a Set or a function: Electron can't pass those to the page.
contextBridge.exposeInMainWorld('lodestarPlugins', {
  list: () => ipcRenderer.invoke('plugins:list'),
  pages: () => ipcRenderer.invoke('plugins:pages'),
  install: () => unwrap(ipcRenderer.invoke('plugins:install')),
  setEnabled: (id, enabled) => unwrap(ipcRenderer.invoke('plugins:set-enabled', id, enabled)),
  remove: (id) => unwrap(ipcRenderer.invoke('plugins:remove', id)),
  keep: (id) => unwrap(ipcRenderer.invoke('plugins:keep', id)),
  openFolder: () => ipcRenderer.invoke('plugins:open-folder'),
  restart: () => ipcRenderer.invoke('plugins:restart'),
  /** Calls the handler a plugin registered with api.page.handle(channel, ...) and returns its answer. */
  invoke: (id, channel, data) => unwrap(ipcRenderer.invoke('plugin:invoke', id, channel, data)),
  /** Listens for api.page.send(channel, data) from a plugin. */
  on: (id, channel, fn) => {
    if (!pluginListeners.has(id)) pluginListeners.set(id, new Map());
    const channels = pluginListeners.get(id);
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(fn);
  },
});
