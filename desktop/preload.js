// Gives the popup the extension API it expects as `browser`. Everything is passed
// on to main.js, which has the storage and runs background.js. Also exposes
// lodestarDesktop for app-only stuff like stay on top.

const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info');
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
const syncListeners = new Set();
const updateListeners = new Set();
ipcRenderer.on('update:status', (_event, status) => updateListeners.forEach((fn) => fn(status)));
ipcRenderer.on('sync:status', (_event, status) => syncListeners.forEach((fn) => fn(status)));
ipcRenderer.on('window:pinned', (_event, pinned) => {
  for (const listener of pinnedListeners) listener(pinned);
});

const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };

// plugin id -> channel -> listeners
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
      // Braces so nothing is returned. Electron can't pass a Set back and would throw.
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
  updates: {
    version: info.version,
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    openDownload: () => ipcRenderer.invoke('update:open-download'),
    onStatus: (fn) => {
      updateListeners.add(fn);
    },
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    startPairing: () => ipcRenderer.invoke('sync:start-pairing'),
    unpair: () => ipcRenderer.invoke('sync:unpair'),
    onStatus: (fn) => {
      syncListeners.add(fn);
    },
  },
});

// Plugins. Never return a Set or a function here, Electron can't pass those.
contextBridge.exposeInMainWorld('lodestarPlugins', {
  list: () => ipcRenderer.invoke('plugins:list'),
  pages: () => ipcRenderer.invoke('plugins:pages'),
  install: () => unwrap(ipcRenderer.invoke('plugins:install')),
  setEnabled: (id, enabled) => unwrap(ipcRenderer.invoke('plugins:set-enabled', id, enabled)),
  options: (id) => unwrap(ipcRenderer.invoke('plugins:options', id)),
  setOption: (id, key, value) => unwrap(ipcRenderer.invoke('plugins:set-option', id, key, value)),
  remove: (id) => unwrap(ipcRenderer.invoke('plugins:remove', id)),
  keep: (id) => unwrap(ipcRenderer.invoke('plugins:keep', id)),
  openFolder: () => ipcRenderer.invoke('plugins:open-folder'),
  popout: (id) => unwrap(ipcRenderer.invoke('plugins:popout', id)),
  restart: () => ipcRenderer.invoke('plugins:restart'),
  invoke: (id, channel, data) => unwrap(ipcRenderer.invoke('plugin:invoke', id, channel, data)),
  on: (id, channel, fn) => {
    if (!pluginListeners.has(id)) pluginListeners.set(id, new Map());
    const channels = pluginListeners.get(id);
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(fn);
  },
});
