// Desktop plugins. A plugin is a folder with a plugin.json (see desktop/README.md).
// It can have a "main" script (runs in the main process, activate/deactivate)
// and/or a "page" that shows as a tab.
//
// Installed ones live in <app data>/plugins/<id>/. Built-in ones come from the
// app's resources and can be turned off but not removed. From source,
// desktop/plugins is loaded too.
//
// Installs, removals and on/off all happen on the next start. A running plugin
// can't be unloaded safely (and on Windows its files are locked), so installs
// wait in plugins/.staged/ and removals are noted in plugins.json.

const fs = require('node:fs');
const path = require('node:path');
const { readZip } = require('./zip');

// Bump this when the plugin api changes in a way old plugins can't handle.
const API_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}$/;
const PLATFORM_NAMES = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };

function createPluginHost({ pluginsDir, dataDir, devDirs = [], bundledDirs = [], appVersion, electronVersion, platform = process.platform, arch = process.arch }) {
  const stagedDir = path.join(pluginsDir, '.staged');
  const stateFile = path.join(pluginsDir, 'plugins.json');
  fs.mkdirSync(pluginsDir, { recursive: true });

  const plugins = new Map();
  const pageHandlers = new Map();
  const quitHandlers = [];

  function readState() {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return { disabled: state.disabled || [], enabled: state.enabled || [], remove: state.remove || [] };
    } catch {
      return { disabled: [], enabled: [], remove: [] };
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

  function incompatibility(manifest) {
    if ((manifest.apiVersion || 1) > API_VERSION) return 'needs a newer version of Lodestar';
    const build = manifest.build;
    if (!build) return null; // no build info means plain JS, runs anywhere
    if (build.platform && build.platform !== platform) {
      return `built for ${PLATFORM_NAMES[build.platform] || build.platform}; download the ${PLATFORM_NAMES[platform] || platform} version`;
    }
    if (build.arch && build.arch !== arch) return `built for ${build.arch} processors; this computer needs the ${arch} version`;
    // Native modules only load in the Electron major they were built for.
    if (build.native && build.electron && build.electron.split('.')[0] !== electronVersion.split('.')[0]) {
      return `built for an older Lodestar (Electron ${build.electron}); download the version made for this one`;
    }
    return null;
  }

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

  function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    }
    return 0;
  }

  function scan() {
    plugins.clear();
    const state = readState();
    const sources = [
      ...devDirs.map((dir) => [dir, 'development']),
      [pluginsDir, 'installed'],
      ...bundledDirs.map((dir) => [dir, 'built-in']),
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
        const existing = plugins.get(manifest.id);
        if (existing) {
          // Dev copy wins. Installed beats built-in unless the app has a newer one.
          const builtInIsNewer =
            source === 'built-in' && existing.source === 'installed' && compareVersions(manifest.version, existing.manifest?.version) > 0;
          if (!builtInIsNewer) {
            if (source === 'built-in') existing.builtIn = true;
            continue;
          }
        }
        const problem = incompatibility(manifest);
        // On by default unless plugin.json says "defaultEnabled": false.
        const enabled = state.disabled.includes(manifest.id)
          ? false
          : state.enabled.includes(manifest.id) || manifest.defaultEnabled !== false;
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
          builtIn: source === 'built-in' || Boolean(existing?.builtIn),
        });
      }
    }
  }

  function dataDirFor(id) {
    const dir = path.join(dataDir, id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // One per plugin so changes from Settings show up in the plugin right away.
  const settingsCache = new Map();

  function settingsFor(id) {
    if (!settingsCache.has(id)) settingsCache.set(id, readSettings(id));
    return settingsCache.get(id);
  }

  function readSettings(id) {
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

  function loadAll({ extraApi = () => ({}), sendToPages = () => {} } = {}) {
    for (const record of plugins.values()) {
      if (record.status !== 'not-loaded') continue;
      const { manifest } = record;
      if (!manifest.main) {
        record.status = 'running';
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
          handle: (channel, handler) => handlers.set(channel, handler),
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

  async function handlePageMessage(id, channel, data) {
    const handler = pageHandlers.get(id)?.get(channel);
    if (!handler) throw new Error(`plugin ${id} has no handler for "${channel}"`);
    return handler(data);
  }

  // A plugin's on/off options from plugin.json, with their current values.
  function optionsOf(record) {
    const declared = Array.isArray(record.manifest?.options) ? record.manifest.options : [];
    const settings = declared.length ? settingsFor(record.id) : null;
    return declared
      .filter((option) => option && typeof option.id === 'string' && option.label)
      .map((option) => ({
        id: option.id,
        label: String(option.label),
        description: option.description ? String(option.description) : '',
        value: Boolean(settings.get(option.id, option.default ?? true)),
      }));
  }

  function options(id) {
    const record = plugins.get(id);
    if (!record) throw new Error(`no plugin "${id}"`);
    return Object.fromEntries(optionsOf(record).map((option) => [option.id, option.value]));
  }

  function setOption(id, key, value) {
    const record = plugins.get(id);
    if (!record) throw new Error(`no plugin "${id}"`);
    if (!optionsOf(record).some((option) => option.id === key)) throw new Error(`"${id}" has no option "${key}"`);
    settingsFor(id).set(key, Boolean(value));
    return Boolean(value);
  }

  function list() {
    const state = readState();
    const stagedIds = (fs.existsSync(stagedDir) ? fs.readdirSync(stagedDir) : []).filter((id) => ID_PATTERN.test(id));
    return [...plugins.values()].map((record) => ({
      id: record.id,
      name: record.name,
      version: record.manifest?.version || '',
      description: record.manifest?.description || '',
      summary: record.manifest?.summary || '',
      source: record.source,
      builtIn: Boolean(record.builtIn),
      enabled: record.enabled ?? false,
      status: record.status,
      error: record.error || null,
      hasPage: Boolean(record.manifest?.page),
      options: optionsOf(record),
      pendingRemoval: state.remove.includes(record.id),
      pendingUpdate: stagedIds.includes(record.id),
    })).concat(
      // Installed this session, loads next start.
      stagedIds
        .filter((id) => !plugins.has(id))
        .map((id) => {
          let manifest = {};
          try {
            manifest = readManifest(path.join(stagedDir, id));
          } catch {
            manifest = { name: id };
          }
          return { id, name: manifest.name, version: manifest.version || '', description: manifest.description || '', source: 'installed', enabled: true, status: 'pending', error: null, hasPage: Boolean(manifest.page), options: [], pendingRemoval: false, pendingUpdate: true };
        })
    );
  }

  function pages() {
    return [...plugins.values()]
      .filter((record) => record.status === 'running' && record.manifest.page)
      .map((record) => {
        const page = record.manifest.page;
        // Root relative so they work from app://lodestar/.
        const url = (file) => (file ? `/plugins/${record.id}/${file.replace(/^\.?\/+/, '')}` : null);
        return {
          id: record.id,
          title: page.title || record.name,
          icon: page.icon ? url(page.icon) : null,
          html: url(page.html),
          css: url(page.css),
          script: url(page.script),
          // true, or { width, height }. Adds the pop out button.
          popout: page.popout || false,
        };
      });
  }

  function resolveFile(id, file) {
    const record = plugins.get(id);
    if (!record || record.status !== 'running') return null;
    const full = path.normalize(path.join(record.dir, file));
    return full.startsWith(record.dir + path.sep) ? full : null;
  }

  // Installs a plugin zip for the next start. plugin.json can be at the top or
  // inside one folder (macOS Compress does that).
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

    // Check every path first, then unpack to a temp folder and move it in, so a
    // bad zip never leaves half a plugin.
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

    // Reinstalling undoes a pending removal.
    const state = readState();
    writeState({
      disabled: state.disabled.filter((id) => id !== manifest.id),
      enabled: [...new Set([...state.enabled, manifest.id])],
      remove: state.remove.filter((id) => id !== manifest.id),
    });
    return { id: manifest.id, name: manifest.name, version: manifest.version || '', replaces: plugins.has(manifest.id) };
  }

  function setEnabled(id, enabled) {
    const state = readState();
    const disabled = new Set(state.disabled);
    const turnedOn = new Set(state.enabled);
    if (enabled) {
      disabled.delete(id);
      turnedOn.add(id);
    } else {
      disabled.add(id);
      turnedOn.delete(id);
    }
    writeState({ ...state, disabled: [...disabled], enabled: [...turnedOn] });
    const record = plugins.get(id);
    if (record) record.enabled = enabled;
  }

  function remove(id) {
    const record = plugins.get(id);
    if (record && record.source === 'development') throw new Error('plugins in desktop/plugins can only be disabled; delete the folder to remove one');
    if (record && record.source === 'built-in') throw new Error(`${record.name} comes with Lodestar; it can be turned off but not removed`);
    fs.rmSync(path.join(stagedDir, id), { recursive: true, force: true });
    const state = readState();
    if (record) writeState({ ...state, remove: [...new Set([...state.remove, id])] });
  }

  function keep(id) {
    const state = readState();
    writeState({ ...state, remove: state.remove.filter((other) => other !== id) });
  }

  return { applyPending, scan, loadAll, deactivateAll, handlePageMessage, list, pages, options, setOption, resolveFile, installZip, setEnabled, remove, keep, API_VERSION };
}

module.exports = { createPluginHost, API_VERSION };
