// The app's side of syncing with the extension: a small server on 127.0.0.1
// that only talks to the extension it was paired with.
//
//   POST /pair    { code }          -> { token }
//   POST /sync    { mode, entries } -> { entries, version }
//   GET  /wait?version=N            -> { version } when the app has changes (or after 25s)
//   POST /unpair                    -> {}
//
// Web pages can't use it: the Origin has to be an extension, the Host has to be
// 127.0.0.1 or localhost, and everything except /pair needs the token.
// Codes last 5 minutes and allow 5 tries.

const crypto = require('node:crypto');
const http = require('node:http');

const CODE_MS = 5 * 60 * 1000;
const CODE_TRIES = 5;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension):\/\//;

function createSyncServer({ storage, keys, LodestarSync, onStatus = () => {} }) {
  const { PORT, PROTOCOL, WAIT_MS } = LodestarSync;
  let version = 1; // bumped on every change in the app, for /wait
  const waiters = new Set();
  let pairingCode = null;
  let listening = false;
  let error = null;

  const replica = LodestarSync.createReplica({
    storage,
    keys: LodestarSync.syncedKeys(keys),
    stampsKey: keys.syncStamps,
    onLocalChange: () => {
      version++;
      for (const done of waiters) done();
    },
  });

  const getPairing = async () => (await storage.local.get(keys.syncPairing))[keys.syncPairing] || null;

  async function status() {
    const pairing = await getPairing();
    const code = pairingCode && pairingCode.expiresAt > Date.now() ? pairingCode : null;
    return {
      listening,
      error,
      paired: Boolean(pairing),
      pairedAt: pairing ? pairing.pairedAt : null,
      lastSyncAt: pairing ? pairing.lastSyncAt : null,
      code: code ? code.code : null,
      codeExpiresAt: code ? code.expiresAt : null,
    };
  }
  const report = () => status().then(onStatus, () => {});

  function startPairing() {
    const bytes = crypto.randomBytes(6);
    const code = [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join('');
    pairingCode = { code, expiresAt: Date.now() + CODE_MS, tries: 0 };
    setTimeout(report, CODE_MS + 100);
    report();
    return status();
  }

  async function unpair() {
    pairingCode = null;
    await storage.local.remove(keys.syncPairing);
    report();
    return status();
  }

  function send(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('too much data'), { status: 413 }));
          req.destroy();
        } else {
          chunks.push(chunk);
        }
      });
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          reject(Object.assign(new Error('not JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  // Constant time compare.
  async function authorized(req) {
    const pairing = await getPairing();
    const given = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!pairing || !given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(pairing.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function handle(req, res) {
    // Only these host names. A page pointing its own domain at 127.0.0.1 still sends its own Host.
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: 'wrong host' });
    const origin = req.headers.origin;
    if (origin && !EXTENSION_ORIGIN.test(origin)) return send(res, 403, { error: 'only the Lodestar extension can sync' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin || '',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      });
      return res.end();
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/pair') {
      const body = await readJson(req);
      const code = pairingCode;
      if (!code || code.expiresAt < Date.now()) return send(res, 403, { error: 'no code is waiting: press "Connect the extension" in the desktop app first' });
      if (++code.tries > CODE_TRIES) {
        pairingCode = null;
        report();
        return send(res, 403, { error: 'too many wrong codes: make a new one in the desktop app' });
      }
      if (String(body.code || '').toUpperCase() !== code.code) return send(res, 403, { error: "that code isn't the one the desktop app shows" });
      pairingCode = null;
      const token = crypto.randomBytes(32).toString('base64url');
      await storage.local.set({ [keys.syncPairing]: { token, pairedAt: Date.now(), lastSyncAt: null } });
      report();
      return send(res, 200, { protocol: PROTOCOL, token });
    }

    if (!(await authorized(req))) return send(res, 401, { error: 'not paired' });

    if (req.method === 'POST' && url.pathname === '/sync') {
      const body = await readJson(req);
      if (body.protocol > PROTOCOL) return send(res, 409, { error: 'update the desktop app to sync with this extension' });
      let entries = {};
      if (body.mode === 'pull') {
        entries = await replica.snapshot(); // the extension takes the app's farm list and settings
      } else {
        await replica.apply(body.entries, { force: body.mode === 'push' });
        if (body.mode !== 'push') entries = await replica.newerThan(body.entries);
      }
      const pairing = await getPairing();
      await storage.local.set({ [keys.syncPairing]: { ...pairing, lastSyncAt: Date.now() } });
      report();
      return send(res, 200, { protocol: PROTOCOL, entries, version });
    }

    if (req.method === 'GET' && url.pathname === '/wait') {
      const seen = Number(url.searchParams.get('version'));
      if (seen !== version) return send(res, 200, { version });
      let done = null;
      const finish = () => {
        waiters.delete(done);
        clearTimeout(timer);
        if (!res.writableEnded) send(res, 200, { version });
      };
      done = finish;
      waiters.add(done);
      const timer = setTimeout(finish, WAIT_MS);
      req.on('close', () => {
        waiters.delete(done);
        clearTimeout(timer);
      });
      return undefined;
    }

    if (req.method === 'POST' && url.pathname === '/unpair') {
      await unpair();
      return send(res, 200, {});
    }

    return send(res, 404, { error: 'not found' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'something went wrong' });
    });
  });
  server.on('error', (err) => {
    listening = false;
    error = err.code === 'EADDRINUSE' ? `port ${PORT} is in use by another program` : err.message;
    report();
  });

  function start() {
    server.listen(PORT, '127.0.0.1', () => {
      listening = true;
      error = null;
      report();
    });
  }

  function stop() {
    for (const done of waiters) done();
    server.close();
  }

  return { start, stop, status, startPairing, unpair, ready: replica.ready };
}

module.exports = { createSyncServer };
