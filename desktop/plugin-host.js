// Plugins for the desktop app: extra features that aren't part of the base
// download, installed separately from Settings → Plugins.
//
// A plugin is a folder with a plugin.json (see desktop/README.md, "Writing a
// plugin"). It can have:
//   - "main": a script that runs in the app's main process (full Node and
//     Electron access), with activate(api) / deactivate() functions;
//   - "page": an HTML fragment, CSS and a script, shown as a tab in the popup.
//
// Installed plugins live in <app data>/plugins/<id>/. When running from source
// (npm start), desktop/plugins/<id>/ is loaded too, so plugins can be developed
// in the repository. Installing, removing, enabling and disabling all take
// effect on the next start: a running plugin can't be unloaded safely, and on
// Windows its native files can't even be deleted while it's loaded. So new
// installs wait in plugins/.staged/ and removals are noted in plugins.json, and
// both are applied before anything loads.
//
// This file uses only Node; main.js passes in what it needs from Electron.

const fs = require('node:fs');
const path = require('node:path');
const { readZip } = require('./zip');

/** Bumped when the api passed to plugins changes in a way old plugins can't handle. */
const API_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}$/;
const PLATFORM_NAMES = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };

/**
 * @param {object} options
 * @param {string} options.pluginsDir   installed plugins (<app data>/plugins)
 * @param {string} options.dataDir      plugin data folders (<app data>/plugin-data)
 * @param {string[]} [options.devDirs]  extra folders of plugins (desktop/plugins when running from source)
 * @param {string} options.appVersion
 * @param {string} options.electronVersion
 * @param {string} [options.platform]
 * @param {string} [options.arch]
 */
function createPluginHost({ pluginsDir, dataDir, devDirs = [], appVersion, electronVersion, platform = process.platform, arch = process.arch }) {
  const stagedDir = path.join(pluginsDir, '.staged');
  const stateFile = path.join(pluginsDir, 'plugins.json');
  fs.mkdirSync(pluginsDir, { recursive: true });

  const plugins = new Map(); // id -> record (see scan)
  const pageHandlers = new Map(); // id -> Map(channel -> handler)
  const quitHandlers = [];

  function readState() {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return { disabled: state.disabled || [], remove: state.remove || [] };
    } catch {
      return { disabled: [], remove: [] };
    }
  }

  function writeState(state) {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  function readManifest(dir) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    if (!ID_PATTERN.test(manifest.id || '')) throw new Error('plugin.json needs an "id" of lowercase letters, digits and dashes');
    if (!manifest.name) throw new Error('plugin.json needs a "name"');
    return manifest;
  }

  /** Why a plugin can't run here, or null if it can. */
  function incompatibility(manifest) {
    if ((manifest.apiVersion || 1) > API_VERSION) return 'needs a newer version of Lodestar';
    const build = manifest.build;
    if (!build) return null; // not built for a platform: plain JavaScript, runs anywhere
    if (build.platform && build.platform !== platform) {
      return `built for ${PLATFORM_NAMES[build.platform] || build.platform}; download the ${PLATFORM_NAMES[platform] || platform} version`;
    }
    if (build.arch && build.arch !== arch) return `built for ${build.arch} processors; this computer needs the ${arch} version`;
    // Native modules only load in the Electron version they were built for (by major version).
    if (build.native && build.electron && build.electron.split('.')[0] !== electronVersion.split('.')[0]) {
      return `built for an older Lodestar (Electron ${build.electron}); download the version made for this one`;
    }
    return null;
  }

  /** Applies installs and removals waiting from the last session. */
  function applyPending() {
    const state = readState();
    for (const id of state.remove) fs.rmSync(path.join(pluginsDir, id), { recursive: true, force: true });
    if (fs.existsSync(stagedDir)) {
      for (const id of fs.readdirSync(stagedDir)) {
        if (!ID_PATTERN.test(id)) continue;
        const target = path.join(pluginsDir, id);
        fs.rmSync(target, { recursive: true, force: true });
        fs.renameSync(path.join(stagedDir, id), target);
      }
      fs.rmSync(stagedDir, { recursive: true, force: true });
    }
    if (state.remove.length) writeState({ ...state, remove: [] });
  }

  /** Finds every plugin folder and reads its plugin.json. */
  function scan() {
    plugins.clear();
    const state = readState();
    const sources = [
      ...devDirs.map((dir) => [dir, 'development']),
      [pluginsDir, 'installed'],
    ];
    for (const [root, source] of sources) {
      let names = [];
      try {
        names = fs.readdirSync(root);
      } catch {
        continue;
      }
      for (const name of names) {
        const dir = path.join(root, name);
        if (name.startsWith('.') || !fs.existsSync(path.join(dir, 'plugin.json'))) continue;
        let manifest;
        try {
          manifest = readManifest(dir);
        } catch (err) {
          plugins.set(`invalid:${dir}`, { id: name, name, dir, source, status: 'error', error: err.message, manifest: null });
          continue;
        }
        if (plugins.has(manifest.id)) continue; // the development copy wins over an installed one
        const problem = incompatibility(manifest);
        const enabled = !state.disabled.includes(manifest.id);
        plugins.set(manifest.id, {
          id: manifest.id,
          name: manifest.name,
          dir,
          source,
          manifest,
          enabled,
          status: problem ? 'incompatible' : enabled ? 'not-loaded' : 'disabled',
          error: problem,
          module: null,
        });
      }
    }
  }

  /** The folder a plugin keeps its own files in, created on first use. */
  function dataDirFor(id) {
    const dir = path.join(dataDir, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function settingsFor(id) {
    const file = path.join(dataDirFor(id), 'settings.json');
    let values = {};
    try {
      values = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      values = {};
    }
    return {
      get: (key, fallback) => (key in values ? values[key] : fallback),
      set: (key, value) => {
        values[key] = value;
        fs.writeFileSync(file, JSON.stringify(values, null, 2));
      },
      all: () => ({ ...values }),
    };
  }

  /**
   * Starts every enabled, compatible plugin that has a "main" script.
   * @param {object} options
   * @param {(record: object) => object} [options.extraApi]  what main.js adds to each plugin's api
   * @param {(id: string, channel: string, data: any) => void} [options.sendToPages]  delivers page.send()
   */
  function loadAll({ extraApi = () => ({}), sendToPages = () => {} } = {}) {
    for (const record of plugins.values()) {
      if (record.status !== 'not-loaded') continue;
      const { manifest } = record;
      if (!manifest.main) {
        record.status = 'running'; // a page-only plugin
        continue;
      }
      const handlers = new Map();
      pageHandlers.set(record.id, handlers);
      const api = {
        id: record.id,
        version: manifest.version || '0.0.0',
        dir: record.dir,
        appVersion,
        apiVersion: API_VERSION,
        get dataDir() {
          return dataDirFor(record.id);
        },
        settings: settingsFor(record.id),
        log: (...args) => console.log(`[plugin ${record.id}]`, ...args),
        page: {
          // Answers lodestarPlugins.invoke(id, channel, data) from the plugin's page.
          handle: (channel, handler) => handlers.set(channel, handler),
          // Delivered to lodestarPlugins.on(id, channel, ...) in the plugin's page.
          send: (channel, data) => sendToPages(record.id, channel, data),
        },
        onQuit: (fn) => quitHandlers.push([record.id, fn]),
        ...extraApi(record),
      };
      try {
        const entry = path.join(record.dir, manifest.main);
        const mod = require(entry);
        record.module = mod;
        if (typeof mod.activate === 'function') {
          const result = mod.activate(api);
          if (result && typeof result.catch === 'function') {
            result.catch((err) => {
              record.status = 'error';
              record.error = err.message;
              console.error(`[plugin ${record.id}] failed to start:`, err);
            });
          }
        }
        record.status = 'running';
      } catch (err) {
        record.status = 'error';
        record.error = err.message;
        console.error(`[plugin ${record.id}] failed to start:`, err);
      }
    }
  }

  /** Lets running plugins clean up (close windows, stop capture) before the app quits. */
  function deactivateAll() {
    for (const [id, fn] of quitHandlers) {
      try {
        fn();
      } catch (err) {
        console.error(`[plugin ${id}] onQuit failed:`, err);
      }
    }
    for (const record of plugins.values()) {
      if (record.status === 'running' && record.module && typeof record.module.deactivate === 'function') {
        try {
          record.module.deactivate();
        } catch (err) {
          console.error(`[plugin ${record.id}] deactivate failed:`, err);
        }
      }
    }
  }

  /** A message from a plugin's page, passed to the handler the plugin registered. */
  async function handlePageMessage(id, channel, data) {
    const handler = pageHandlers.get(id)?.get(channel);
    if (!handler) throw new Error(`plugin ${id} has no handler for "${channel}"`);
    return handler(data);
  }

  /** Everything Settings shows, in a form that can be sent to the page. */
  function list() {
    const state = readState();
    const stagedIds = (fs.existsSync(stagedDir) ? fs.readdirSync(stagedDir) : []).filter((id) => ID_PATTERN.test(id));
    return [...plugins.values()].map((record) => ({
      id: record.id,
      name: record.name,
      version: record.manifest?.version || '',
      description: record.manifest?.description || '',
      source: record.source,
      enabled: record.enabled ?? false,
      status: record.status,
      error: record.error || null,
      hasPage: Boolean(record.manifest?.page),
      pendingRemoval: state.remove.includes(record.id),
      pendingUpdate: stagedIds.includes(record.id),
    })).concat(
      // Installed this session, not loaded until the next start.
      stagedIds
        .filter((id) => !plugins.has(id))
        .map((id) => {
          let manifest = {};
          try {
            manifest = readManifest(path.join(stagedDir, id));
          } catch {
            manifest = { name: id };
          }
          return { id, name: manifest.name, version: manifest.version || '', description: manifest.description || '', source: 'installed', enabled: true, status: 'pending', error: null, hasPage: Boolean(manifest.page), pendingRemoval: false, pendingUpdate: true };
        })
    );
  }

  /** The pages of running plugins, for the popup's tab row. */
  function pages() {
    return [...plugins.values()]
      .filter((record) => record.status === 'running' && record.manifest.page)
      .map((record) => {
        const page = record.manifest.page;
        // Root-relative, so they resolve against the popup's own address (app://lodestar/).
        const url = (file) => (file ? `/plugins/${record.id}/${file.replace(/^\.?\/+/, '')}` : null);
        return {
          id: record.id,
          title: page.title || record.name,
          icon: page.icon ? url(page.icon) : null,
          html: url(page.html),
          css: url(page.css),
          script: url(page.script),
        };
      });
  }

  /** The file behind app://lodestar/plugins/<id>/<file>, or null (unknown plugin, or outside its folder). */
  function resolveFile(id, file) {
    const record = plugins.get(id);
    if (!record || record.status !== 'running') return null;
    const full = path.normalize(path.join(record.dir, file));
    return full.startsWith(record.dir + path.sep) ? full : null;
  }

  /**
   * Installs a plugin from a zip, ready for the next start. The zip may have
   * plugin.json at the top or inside one folder (as macOS's "Compress" makes).
   * @returns {{ id: string, name: string, version: string, replaces: boolean }}
   */
  function installZip(buffer) {
    let files = readZip(buffer).filter((file) => !file.name.startsWith('__MACOSX/') && !file.name.endsWith('.DS_Store'));
    if (!files.some((file) => file.name === 'plugin.json')) {
      const top = new Set(files.map((file) => file.name.split('/')[0]));
      const [folder] = top;
      if (top.size === 1 && files.some((file) => file.name === `${folder}/plugin.json`)) {
        files = files.map((file) => ({ ...file, name: file.name.slice(folder.length + 1) }));
      } else {
        throw new Error('this zip has no plugin.json, so it isn\'t a Lodestar plugin');
      }
    }

    const manifest = JSON.parse(files.find((file) => file.name === 'plugin.json').data.toString('utf8'));
    if (!ID_PATTERN.test(manifest.id || '') || !manifest.name) throw new Error('its plugin.json is missing an id or name');
    const problem = incompatibility(manifest);
    if (problem) throw new Error(`${manifest.name} is ${problem}`);

    // Check every path before writing anything, then write to a temporary folder
    // and move it into place, so a bad zip never leaves half a plugin behind.
    const target = path.join(stagedDir, manifest.id);
    const temp = path.join(stagedDir, `.incoming-${manifest.id}`);
    const writes = files.map((file) => {
      const full = path.normalize(path.join(temp, file.name));
      if (!full.startsWith(temp + path.sep)) throw new Error(`unsafe file name in the zip: ${file.name}`);
      return [full, file];
    });
    fs.rmSync(temp, { recursive: true, force: true });
    try {
      for (const [full, file] of writes) {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, file.data, { mode: file.mode || 0o644 });
      }
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(temp, target);
    } catch (err) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw err;
    }

    // Installing again undoes a pending removal, and a fresh install starts enabled.
    const state = readState();
    writeState({ disabled: state.disabled.filter((id) => id !== manifest.id), remove: state.remove.filter((id) => id !== manifest.id) });
    return { id: manifest.id, name: manifest.name, version: manifest.version || '', replaces: plugins.has(manifest.id) };
  }

  function setEnabled(id, enabled) {
    const state = readState();
    const disabled = new Set(state.disabled);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    writeState({ ...state, disabled: [...disabled] });
    const record = plugins.get(id);
    if (record) record.enabled = enabled;
  }

  /** Removes an installed plugin on the next start (a development copy is only disabled). */
  function remove(id) {
    const record = plugins.get(id);
    if (record && record.source === 'development') throw new Error('plugins in desktop/plugins can only be disabled; delete the folder to remove one');
    fs.rmSync(path.join(stagedDir, id), { recursive: true, force: true });
    const state = readState();
    if (record) writeState({ ...state, remove: [...new Set([...state.remove, id])] });
  }

  /** Undoes a removal chosen this session. */
  function keep(id) {
    const state = readState();
    writeState({ ...state, remove: state.remove.filter((other) => other !== id) });
  }

  return { applyPending, scan, loadAll, deactivateAll, handlePageMessage, list, pages, resolveFile, installZip, setEnabled, remove, keep, API_VERSION };
}

module.exports = { createPluginHost, API_VERSION };
