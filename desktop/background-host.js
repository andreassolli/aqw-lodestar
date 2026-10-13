// Runs the extension's own background.js in the app's main process, so the
// popup's requests (wiki pages, the boost calendar, Check bag, try-on) are
// handled by exactly the same code as in the browser.
//
// background.js expects the extension API as a global `browser`/`chrome`; this
// gives it a small stand-in: storage (storage.js), runtime messages, tabs.create
// (opens the default browser) and no-op context menus (there are no web pages
// to right-click in the app). Its fetch() goes through Electron's network stack
// (net.fetch), which uses the system proxy and has no CORS limits, just like an
// extension background.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/** The files background.js loads with importScripts(), in order (same rule as scripts/build.mjs). */
function backgroundImports(source) {
  const call = source.match(/importScripts\(\s*(['"][^)]*)\)/);
  if (!call) throw new Error('background.js has no importScripts(...) call');
  return [...call[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/**
 * @param {object} options
 * @param {string} options.appDir      folder holding background.js and shared/ (desktop/app)
 * @param {object} options.storage     from storage.js
 * @param {(url: string) => void} options.openUrl  opens a link (in the default browser)
 * @param {string} options.version
 * @param {typeof fetch} [options.fetch]  fetch to use (Electron's net.fetch in the app)
 * @returns {{ handleMessage(message: any): Promise<any> }}
 */
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
  // Like importScripts(): each file runs as a plain script in the same global
  // scope, so what one defines is visible to the next.
  for (const file of [...backgroundImports(source), 'background.js']) {
    const full = path.join(appDir, file);
    vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
  }

  /** Delivers a message the way the browser does: the first listener that answers wins. */
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

  return { handleMessage };
}

module.exports = { startBackground };
