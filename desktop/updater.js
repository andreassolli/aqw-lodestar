// Keeps the app up to date from GitHub Releases.
//
// Windows (installed) and Linux (AppImage) download the update in the background
// and install it on the next restart. The Mac can't: macOS only applies updates to
// apps with a paid Apple certificate. The Windows portable .exe and the .deb don't
// update themselves either, so those only get told there's a new version.

const LATEST_RELEASE_API = 'https://api.github.com/repos/andreassolli/aqw-lodestar/releases/latest';
const DOWNLOAD_PAGE = 'https://github.com/andreassolli/aqw-lodestar/releases/latest';
const FIRST_CHECK_MS = 10 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

function canUpdateItself(platform = process.platform, env = process.env) {
  if (platform === 'win32') return !env.PORTABLE_EXECUTABLE_DIR;
  if (platform === 'linux') return Boolean(env.APPIMAGE);
  return false;
}

// 1 if a is newer than b.
function compareVersions(a, b) {
  const parts = (version) => String(version).split('.').map((part) => parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0) ? 1 : -1;
  }
  return 0;
}

// Just asks GitHub what the newest version is, for the ones that can't install it.
function createNotifier({ currentVersion, fetch, setStatus }) {
  async function check() {
    setStatus({ state: 'checking' });
    try {
      const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const match = String((await res.json()).tag_name || '').match(/\d+\.\d+\.\d+/);
      if (!match) throw new Error('the newest release has no version number');
      setStatus(compareVersions(match[0], currentVersion) > 0 ? { state: 'available', version: match[0] } : { state: 'current' });
    } catch (err) {
      setStatus({ state: 'error', error: err.message });
    }
  }
  return { check };
}

function createInstaller({ setStatus }) {
  // Loaded here since the Mac never needs it.
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setStatus({ state: 'current' }));
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (progress) => setStatus({ state: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => setStatus({ state: 'error', error: err.message }));

  return {
    check: () => autoUpdater.checkForUpdates().catch((err) => setStatus({ state: 'error', error: err.message })),
    install: () => autoUpdater.quitAndInstall(),
  };
}

function createUpdater({ packaged, currentVersion, fetch, onStatus, schedule = setTimeout, repeat = setInterval }) {
  let status = { state: packaged ? 'idle' : 'off', canInstall: packaged && canUpdateItself(), version: null, percent: 0, error: null };

  function setStatus(change) {
    status = { ...status, ...change };
    if (change.state && change.state !== 'error') status.error = null;
    onStatus(status);
  }

  let worker = null;
  const getWorker = () => {
    if (!worker) worker = status.canInstall ? createInstaller({ setStatus }) : createNotifier({ currentVersion, fetch, setStatus });
    return worker;
  };

  function check() {
    // Nothing to ask while it's busy, and a downloaded update stays ready.
    if (status.state === 'off' || status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return Promise.resolve(status);
    return Promise.resolve(getWorker().check()).then(() => status);
  }

  return {
    status: () => status,
    check,
    install: () => {
      if (status.state === 'ready') getWorker().install();
    },
    downloadPage: DOWNLOAD_PAGE,
    start: () => {
      if (status.state === 'off') return;
      schedule(check, FIRST_CHECK_MS);
      repeat(check, CHECK_EVERY_MS);
    },
  };
}

module.exports = { createUpdater, canUpdateItself, compareVersions };
