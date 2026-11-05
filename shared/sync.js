// Syncing the farm list and settings between the extension and the desktop app.
// The app runs a server on 127.0.0.1 (sync-server.js) and the extension talks to it.
//
// Every synced key has a timestamp for when it last changed on that side, and
// the newer one wins. Nothing gets merged, so if the farm list changes on both
// sides at once the later one wins.
//
// Works as a normal script (extension) and as a Node module (the app).
const LodestarSync = (() => {
  const PORT = 47386;
  const ORIGIN = `http://127.0.0.1:${PORT}`;
  const PROTOCOL = 1;
  const WAIT_MS = 25000; // how long /wait waits before answering "nothing new"

  // The farm list and settings. Not the inventory, caches or AQCloset layouts.
  function syncedKeys(keys) {
    return [
      keys.farmItems,
      keys.theme,
      keys.username,
      keys.tooltipPlacement,
      keys.disabledFeatures,
      keys.collapsedInventorySections,
      keys.itemListFilter,
      keys.itemListSelection,
    ];
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // One side's copy. Stamps keys when they change here and takes newer ones from the other side.
  function createReplica({ storage, keys, stampsKey, onLocalChange = () => {} }) {
    let stamps = {};
    const applying = new Map(); // values we're writing from the other side
    const ready = storage.local.get(stampsKey).then((result) => {
      stamps = result[stampsKey] || {};
    });
    const saveStamps = () => storage.local.set({ [stampsKey]: stamps });

    storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      await ready;
      let changed = false;
      for (const key of keys) {
        if (!(key in changes)) continue;
        const json = JSON.stringify(changes[key].newValue);
        if (applying.get(key) === json) {
          applying.delete(key); // our own write of the other side's value: already stamped
          continue;
        }
        stamps[key] = Date.now();
        changed = true;
      }
      if (changed) {
        await saveStamps();
        onLocalChange();
      }
    });

    async function snapshot() {
      await ready;
      const values = await storage.local.get(keys);
      return Object.fromEntries(keys.filter((key) => key in values || stamps[key]).map((key) => [key, { at: stamps[key] || 0, value: values[key] }]));
    }

    async function newerThan(theirs = {}) {
      const at = (entry) => (typeof entry === 'number' ? entry : (entry && entry.at) || 0);
      return Object.fromEntries(Object.entries(await snapshot()).filter(([key, entry]) => entry.at > at(theirs[key])));
    }

    // Takes the other side's newer entries, or all of them with force (when pairing).
    async function apply(entries, { force = false } = {}) {
      await ready;
      const current = await storage.local.get(keys);
      const sets = {};
      const removes = [];
      const taken = [];
      for (const [key, entry] of Object.entries(entries || {})) {
        if (!keys.includes(key) || !entry || typeof entry.at !== 'number') continue;
        if (!force && entry.at <= (stamps[key] || 0)) continue;
        if (!same(current[key], entry.value)) {
          applying.set(key, JSON.stringify(entry.value));
          if (entry.value === undefined) removes.push(key);
          else sets[key] = entry.value;
        }
        stamps[key] = entry.at;
        taken.push(key);
      }
      if (removes.length) await storage.local.remove(removes);
      if (Object.keys(sets).length) await storage.local.set(sets);
      if (taken.length) await saveStamps();
      return taken;
    }

    return { ready, snapshot, newerThan, apply };
  }

  // The extension's side. Syncs on every local change, when the app says it has
  // changes, and on an alarm since the browser kills idle backgrounds.
  function createClient({ ext, keys }) {
    const ALARM = 'lodestar-sync';
    const pairingKey = keys.syncPairing;
    const replica = createReplica({ storage: ext.storage, keys: syncedKeys(keys), stampsKey: keys.syncStamps, onLocalChange: () => scheduleSync() });
    let syncing = null;
    let again = false;
    let waiting = false;
    let serverVersion = null;
    let timer = null;

    const getPairing = async () => (await ext.storage.local.get(pairingKey))[pairingKey] || null;
    async function updatePairing(changes) {
      const pairing = await getPairing();
      if (pairing) await ext.storage.local.set({ [pairingKey]: { ...pairing, ...changes } });
    }

    async function request(path, { token, body, timeoutMs = 10000 } = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${ORIGIN}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
        return data;
      } catch (err) {
        if (err.status) throw err;
        throw new Error(controller.signal.aborted ? 'the desktop app didn\'t answer' : "can't reach the desktop app (is it open?)");
      } finally {
        clearTimeout(timeout);
      }
    }

    // Send our newer stuff, get the app's newer stuff back.
    async function syncOnce(mode) {
      const pairing = await getPairing();
      if (!pairing) return;
      try {
        const answer = await request('/sync', { token: pairing.token, body: { protocol: PROTOCOL, mode, entries: await replica.snapshot() }, timeoutMs: 15000 });
        await replica.apply(answer.entries || {}, { force: mode === 'pull' });
        serverVersion = answer.version;
        await updatePairing({ lastSyncAt: Date.now(), lastError: null });
      } catch (err) {
        if (err.status === 401) {
          // The app stopped syncing, this pairing is dead.
          await ext.storage.local.remove(pairingKey);
          ext.alarms.clear(ALARM);
          return;
        }
        await updatePairing({ lastError: err.message });
        throw err;
      }
    }

    function sync(mode) {
      if (syncing) {
        again = true;
        return syncing;
      }
      syncing = (async () => {
        try {
          do {
            again = false;
            await syncOnce(mode);
            mode = undefined;
          } while (again);
        } finally {
          syncing = null;
        }
      })();
      syncing.catch(() => {}).then(() => waitForApp());
      return syncing;
    }

    // Wait a bit so changes made together go in one sync.
    function scheduleSync() {
      clearTimeout(timer);
      timer = setTimeout(() => sync().catch(() => {}), 300);
    }

    // Keeps a request open until the app has changes.
    async function waitForApp() {
      if (waiting) return;
      const pairing = await getPairing();
      if (!pairing || serverVersion == null) return;
      waiting = true;
      try {
        const answer = await request(`/wait?version=${encodeURIComponent(serverVersion)}`, { token: pairing.token, timeoutMs: WAIT_MS + 10000 });
        waiting = false;
        if (answer.version !== serverVersion) await sync();
        else waitForApp();
      } catch {
        waiting = false; // the alarm will try again
      }
    }

    // Pairs with the app's code. 'push' keeps this browser's data, 'pull' the app's.
    async function pair(code, mode) {
      const answer = await request('/pair', { body: { protocol: PROTOCOL, code: String(code || '').replace(/[\s-]/g, '').toUpperCase(), name: 'browser extension' } });
      await ext.storage.local.set({ [pairingKey]: { token: answer.token, pairedAt: Date.now(), lastSyncAt: null, lastError: null } });
      ext.alarms.create(ALARM, { periodInMinutes: 0.5 });
      await sync(mode === 'pull' ? 'pull' : 'push');
    }

    // The permission prompt can close the popup, so the popup leaves the code
    // here first (pairLater) and whoever's still around finishes it (pairPending).
    const PENDING_KEY = 'lodestarSyncPending';
    const PENDING_MS = 5 * 60 * 1000;
    const session = ext.storage.session || ext.storage.local;
    let pairingRun = null;

    async function pairLater(code, mode) {
      await session.set({ [PENDING_KEY]: { code, mode, at: Date.now() }, lodestarSyncPairError: null });
    }

    function pairPending() {
      if (pairingRun) return pairingRun;
      pairingRun = (async () => {
        const pending = (await session.get(PENDING_KEY))[PENDING_KEY];
        if (!pending || Date.now() - pending.at > PENDING_MS) {
          if (await getPairing()) return; // the other caller already paired
          throw new Error('press Connect again');
        }
        await session.remove(PENDING_KEY);
        try {
          await pair(pending.code, pending.mode);
        } catch (err) {
          await session.set({ lodestarSyncPairError: err.message });
          throw err;
        }
      })().finally(() => {
        pairingRun = null;
      });
      return pairingRun;
    }

    async function status() {
      const pairError = (await session.get('lodestarSyncPairError')).lodestarSyncPairError || null;
      return { pairing: await getPairing(), pairError };
    }

    async function unpair() {
      const pairing = await getPairing();
      await ext.storage.local.remove(pairingKey);
      ext.alarms.clear(ALARM);
      if (pairing) request('/unpair', { token: pairing.token, body: {} }).catch(() => {});
    }

    async function start() {
      ext.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM) sync().catch(() => {});
      });
      ext.permissions.onAdded.addListener((granted) => {
        if ((granted.origins || []).some((origin) => origin.startsWith('http://127.0.0.1'))) pairPending().catch(() => {});
      });
      if (await getPairing()) {
        ext.alarms.create(ALARM, { periodInMinutes: 0.5 });
        sync().catch(() => {});
      }
    }

    return { start, pairLater, pairPending, unpair, syncNow: () => sync(), status };
  }

  return { PORT, ORIGIN, PROTOCOL, WAIT_MS, syncedKeys, createReplica, createClient };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LodestarSync;
