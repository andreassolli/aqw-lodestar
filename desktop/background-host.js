// Runs the extension's background.js inside the app so the popup gets the exact
// same code as in the browser. It gets a small fake extension API: storage,
// messages, tabs.create (opens the browser) and empty context menus. fetch goes
// through Electron's net.fetch, so no CORS and it uses the system proxy.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Same files background.js imports, in the same order (like build.mjs).
function backgroundImports(source) {
  const call = source.match(/importScripts\(\s*(['"][^)]*)\)/);
  if (!call) throw new Error('background.js has no importScripts(...) call');
  return [...call[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function startBackground({ appDir, storage, openUrl, version, fetch }) {
  const messageListeners = new Set();
  const noopEvent = { addListener() {}, removeListener() {}, hasListener: () => false };

  globalThis.browser = {
    storage,
    runtime: {
      id: 'aqw-lodestar-desktop',
      getManifest: () => ({ name: 'AQW Lodestar', version }),
      getURL: (file) => `app://lodestar/${String(file).replace(/^\/+/, '')}`,
      onMessage: {
        addListener: (fn) => messageListeners.add(fn),
        removeListener: (fn) => messageListeners.delete(fn),
        hasListener: (fn) => messageListeners.has(fn),
      },
      onInstalled: noopEvent,
      onStartup: noopEvent,
    },
    tabs: {
      create: async ({ url } = {}) => {
        if (url) openUrl(url);
        return {};
      },
      query: async () => [],
      sendMessage: async () => {
        throw new Error('There are no browser tabs in the desktop app');
      },
    },
    contextMenus: {
      create() {},
      removeAll: async () => {},
      onClicked: noopEvent,
    },
  };
  if (fetch) globalThis.fetch = fetch;

  const backgroundFile = path.join(appDir, 'background.js');
  const source = fs.readFileSync(backgroundFile, 'utf8');
  // Like importScripts: every file runs in the same global scope.
  for (const file of [...backgroundImports(source), 'background.js']) {
    const full = path.join(appDir, file);
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
  }

  // First listener to answer wins, same as in the browser.
  function handleMessage(message) {
    return new Promise((resolve) => {
      let waiting = false;
      for (const listener of messageListeners) {
        let answered = false;
        const sendResponse = (response) => {
          if (answered) return;
          answered = true;
          resolve(response);
        };
        const result = listener(message, { id: 'aqw-lodestar-desktop' }, sendResponse);
        if (result === true) waiting = true;
        else if (result && typeof result.then === 'function') {
          waiting = true;
          result.then(sendResponse, () => sendResponse(null));
        }
      }
      if (!waiting) resolve(undefined);
    });
  }

  // main.js needs the key names for the sync server.
  const STORAGE_KEYS = vm.runInThisContext('STORAGE_KEYS');

  return { handleMessage, STORAGE_KEYS };
}

module.exports = { startBackground };
