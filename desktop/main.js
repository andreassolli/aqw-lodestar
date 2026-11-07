// AQW Lodestar desktop app: the extension popup in its own window, with stay on
// top. The popup files are copied from the extension into app/ and served from
// app://lodestar/. preload.js gives them the extension API and this file answers
// those calls.

const electron = require('electron');
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, protocol, screen, shell } = electron;
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createStorage } = require('./storage');
const { startBackground } = require('./background-host');
const { importFromChrome } = require('./chrome-import');
const { createPluginHost } = require('./plugin-host');
const { createSyncServer } = require('./sync-server');
const { createUpdater } = require('./updater');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'app://lodestar';
const POPUP_URL = `${ORIGIN}/popup/popup.html`;
const BACKUP_URL = `${ORIGIN}/options/options.html`;
const IS_MAC = process.platform === 'darwin';
const APP_ICON = path.join(APP_DIR, 'desktop', 'icon.png');

// Too big to send to the windows on every change, and nothing watches them.
const QUIET_KEYS = new Set(['itemCatalog']);

// Linux: use X11. Wayland won't let an app keep itself on top.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Only one copy of the app. Opening it again brings the window forward.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}
let mainWindow = null;
let tray = null;
let backupWindow = null;
const pluginWindows = new Map();
let storage = null;
let background = null;
let syncServer = null;
let updater = null;
let plugins = null;
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULT_STATE = { width: 340, height: 640, pinned: false };


function loadWindowState() {
  try {
    const state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) };
    // Forget the position if that screen is gone.
    if (typeof state.x === 'number' && typeof state.y === 'number') {
      const area = screen.getDisplayMatching({ x: state.x, y: state.y, width: state.width, height: state.height }).workArea;
      const visible = state.x < area.x + area.width - 40 && state.x + state.width > area.x + 40 && state.y >= area.y - 10 && state.y < area.y + area.height - 40;
      if (!visible) {
        delete state.x;
        delete state.y;
      }
    }
    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

let windowState = { ...DEFAULT_STATE };
let saveTimer = null;

function saveWindowState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(windowState));
    } catch (err) {
      console.warn(`Couldn't save the window position: ${err.message}`);
    }
  }, 300);
}

function rememberBounds() {
  if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
  Object.assign(windowState, mainWindow.getNormalBounds());
  saveWindowState();
}

function setPinned(pinned) {
  windowState.pinned = pinned;
  saveWindowState();
  if (!mainWindow) return;

  // 'floating' is above normal windows. On Mac it also shows on every Space,
  // including a fullscreen game. Popped out plugin windows follow along.
  for (const window of [mainWindow, ...pluginWindows.values()]) applyPinned(window, pinned);

  mainWindow.webContents.send('window:pinned', pinned);
  const item = Menu.getApplicationMenu()?.getMenuItemById('stay-on-top');
  if (item) item.checked = pinned;
  updateTrayMenu();
}

function applyPinned(window, pinned) {
  window.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal');
  if (IS_MAC) window.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });
}

// A plugin page in its own window. Same popup page, just that tab. Remembers its
// size and position and stays on top with the main window.
function openPluginWindow(id) {
  const existing = pluginWindows.get(id);
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  const page = plugins.pages().find((p) => p.id === id);
  if (!page) throw new Error(`plugin ${id} has no page`);

  const saved = (windowState.popouts || {})[id] || {};
  const size = typeof page.popout === 'object' ? page.popout : {};
  const win = new BrowserWindow({
    title: `${page.title} – AQW Lodestar`,
    x: saved.x,
    y: saved.y,
    width: saved.width || size.width || 760,
    height: saved.height || size.height || 820,
    minWidth: 320,
    minHeight: 300,
    backgroundColor: '#1A1A1A',
    autoHideMenuBar: true,
    icon: IS_MAC ? undefined : APP_ICON,
    webPreferences: webPreferences(),
  });
  pluginWindows.set(id, win);
  guardNavigation(win.webContents);
  if (windowState.pinned) applyPinned(win, true);

  const remember = () => {
    if (win.isMinimized() || win.isFullScreen()) return;
    windowState.popouts = { ...(windowState.popouts || {}), [id]: win.getNormalBounds() };
    saveWindowState();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('closed', () => pluginWindows.delete(id));
  win.loadURL(`${POPUP_URL}?popout=${encodeURIComponent(`plugin-${id}`)}`);
}

function showWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Click brings the window forward, or hides it if it's already in front.
function toggleWindow() {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else showWindow();
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show Lodestar', click: showWindow },
    { label: 'Stay on Top', type: 'checkbox', checked: windowState.pinned, click: (item) => setPinned(item.checked) },
    { type: 'separator' },
    { label: 'Quit Lodestar', role: 'quit' },
  ]);
}

function updateTrayMenu() {
  // Linux only shows a tray menu, no click events.
  if (tray && process.platform === 'linux') tray.setContextMenu(trayMenu());
}

function createTray() {
  // Mac wants a black template image so it can recolor it for the menu bar.
  const file = IS_MAC ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(APP_DIR, 'desktop', 'tray', file));
  if (IS_MAC) image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('AQW Lodestar');
  if (process.platform === 'linux') {
    updateTrayMenu();
  } else {
    tray.on('click', toggleWindow);
    tray.on('right-click', () => tray.popUpContextMenu(trayMenu()));
  }
}

function openUrl(url) {
  if (typeof url !== 'string') return;
  if (url.startsWith(`${ORIGIN}/options/`)) {
    openBackupWindow(url);
  } else if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
}

// Links open in the browser instead of replacing the popup.
function guardNavigation(contents) {
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    event.preventDefault();
    openUrl(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    openUrl(url);
    return { action: 'deny' };
  });
}

const webPreferences = () => ({
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
});

function createMainWindow() {
  windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    title: 'AQW Lodestar',
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 320,
    minHeight: 360,
    backgroundColor: '#1A1A1A',
    autoHideMenuBar: true, // Windows/Linux: menu shows when you press Alt
    // Mac uses the icon from the app bundle.
    icon: IS_MAC ? undefined : APP_ICON,
    show: false,
    webPreferences: webPreferences(),
  });

  guardNavigation(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => {
    if (windowState.pinned) setPinned(true);
    mainWindow.show();
  });
  mainWindow.on('resize', rememberBounds);
  mainWindow.on('move', rememberBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Plugins can have hidden windows, closing the main one still quits.
    app.quit();
  });
  mainWindow.loadURL(POPUP_URL);
}

function openBackupWindow(url = `${BACKUP_URL}#import`) {
  if (backupWindow) {
    backupWindow.focus();
    return;
  }
  backupWindow = new BrowserWindow({
    title: 'AQW Lodestar – Backup',
    width: 560,
    height: 720,
    minWidth: 380,
    minHeight: 400,
    parent: mainWindow || undefined, // stays above the main window, even when that's on top
    backgroundColor: '#1A1A1A',
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  guardNavigation(backupWindow.webContents);
  backupWindow.on('closed', () => {
    backupWindow = null;
    // An import can change the theme and farm list, so reload.
    if (mainWindow) mainWindow.webContents.reload();
  });
  backupWindow.loadURL(url);
}

function buildMenu() {
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [{ label: 'Back up && Restore…', click: () => openBackupWindow(BACKUP_URL) }, { type: 'separator' }, IS_MAC ? { role: 'close' } : { role: 'quit' }],
    },
    { role: 'editMenu' }, // copy/paste shortcuts
    {
      label: 'View',
      submenu: [
        {
          id: 'stay-on-top',
          label: 'Stay on Top',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+Shift+T',
          checked: windowState.pinned,
          click: (item) => setPinned(item.checked),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Lodestar on GitHub', click: () => shell.openExternal('https://github.com/andreassolli/aqw-lodestar') },
        { label: 'Report a Problem', click: () => shell.openExternal('https://github.com/andreassolli/aqw-lodestar/issues') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.on('app:info', (event) => {
    event.returnValue = { version: app.getVersion(), platform: process.platform };
  });

  ipcMain.handle('sync:status', () => syncServer.status());
  ipcMain.handle('sync:start-pairing', () => syncServer.startPairing());
  ipcMain.handle('sync:unpair', () => syncServer.unpair());

  ipcMain.handle('update:status', () => updater.status());
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.handle('update:open-download', () => openUrl(updater.downloadPage));

  ipcMain.handle('storage', (_event, op, arg) => {
    if (!['get', 'set', 'remove', 'clear'].includes(op)) throw new Error(`Unknown storage call ${op}`);
    return storage.local[op](arg);
  });

  ipcMain.handle('runtime:message', (_event, message) => background.handleMessage(message));
  ipcMain.handle('tabs:create', (_event, url) => {
    openUrl(url);
    return {};
  });

  ipcMain.handle('chrome:import', (_event, id) =>
    importFromChrome({ storage, backupsDir: path.join(app.getPath('userData'), 'backups'), version: app.getVersion(), id }).catch((err) => ({
      error: err.message,
    }))
  );

  registerPluginIpc();

  ipcMain.handle('window:get-pinned', () => windowState.pinned);
  ipcMain.handle('window:set-pinned', (_event, pinned) => {
    setPinned(Boolean(pinned));
    return windowState.pinned;
  });
}

function registerPluginIpc() {
  const pluginsDir = path.join(app.getPath('userData'), 'plugins');
  const result = (fn) => async (...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  ipcMain.handle('plugins:list', () => plugins.list());
  ipcMain.handle('plugins:pages', () => plugins.pages());
  ipcMain.handle(
    'plugins:install',
    result(async () => {
      const choice = await dialog.showOpenDialog(mainWindow, {
        title: 'Install a Lodestar plugin',
        buttonLabel: 'Install',
        filters: [{ name: 'Lodestar plugin', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (choice.canceled || !choice.filePaths.length) return null;
      return plugins.installZip(fs.readFileSync(choice.filePaths[0]));
    })
  );
  ipcMain.handle('plugins:set-enabled', result((_event, id, enabled) => plugins.setEnabled(id, Boolean(enabled))));
  ipcMain.handle('plugins:options', result((_event, id) => plugins.options(id)));
  ipcMain.handle('plugins:set-option', result((_event, id, key, value) => plugins.setOption(id, key, value)));
  ipcMain.handle('plugins:remove', result((_event, id) => plugins.remove(id)));
  ipcMain.handle('plugins:keep', result((_event, id) => plugins.keep(id)));
  ipcMain.handle('plugins:open-folder', () => shell.openPath(pluginsDir));
  ipcMain.handle('plugins:popout', result((_event, id) => openPluginWindow(id)));
  ipcMain.handle('plugins:restart', () => {
    app.relaunch();
    app.quit();
  });
  ipcMain.handle('plugin:invoke', result((_event, id, channel, data) => plugins.handlePageMessage(id, channel, data)));
}

// `npm run start:no-plugins` or LODESTAR_NO_PLUGINS=1 runs without plugins.
const NO_PLUGINS = process.argv.includes('--no-plugins') || process.env.LODESTAR_NO_PLUGINS === '1';

function startPlugins() {
  plugins = createPluginHost({
    pluginsDir: path.join(app.getPath('userData'), 'plugins'),
    dataDir: path.join(app.getPath('userData'), 'plugin-data'),
    // From source, also load desktop/plugins.
    devDirs: app.isPackaged ? [] : [path.join(__dirname, 'plugins')],
    // The built-in ones (extraResources in package.json). From source they're in desktop/plugins already.
    bundledDirs: app.isPackaged ? [path.join(process.resourcesPath, 'plugins')] : [],
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
  });
  try {
    plugins.applyPending();
  } catch (err) {
    console.error('Applying plugin changes failed:', err);
  }
  if (NO_PLUGINS) {
    console.log('Plugins are off for this run (--no-plugins).');
    return;
  }
  plugins.scan();
  plugins.loadAll({
    // Extra api for plugins: Electron, the shared storage and opening links.
    extraApi: () => ({ electron, storage, openUrl, appIcon: APP_ICON }),
    sendToPages: (id, channel, data) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('plugin:event', { id, channel, data });
    },
  });
}

// Serves app/ and the plugin folders at app://lodestar/, nothing else.
function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const plugin = pathname.match(/^\/plugins\/([^/]+)\/(.+)$/);
    const file = plugin
      ? plugins && plugins.resolveFile(plugin[1], plugin[2])
      : path.normalize(path.join(APP_DIR, pathname));
    if (url.host !== 'lodestar' || !file || (!plugin && !file.startsWith(APP_DIR + path.sep))) {
      return new Response('Not found', { status: 404 });
    }
    if (plugin && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      // A folder answers with the names of the .json files in it.
      const names = fs.readdirSync(file).filter((name) => name.endsWith('.json')).sort();
      return Response.json(names);
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  registerProtocol();

  storage = createStorage(path.join(app.getPath('userData'), 'storage'));
  storage.onChanged.addListener((changes) => {
    const forPages = {};
    for (const [key, change] of Object.entries(changes)) forPages[key] = QUIET_KEYS.has(key) ? {} : change;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('storage:changed', forPages);
  });

  background = startBackground({
    appDir: APP_DIR,
    storage,
    openUrl,
    version: app.getVersion(),
    fetch: (input, init) => net.fetch(input, init),
  });

  syncServer = createSyncServer({
    storage,
    keys: background.STORAGE_KEYS,
    LodestarSync: require(path.join(APP_DIR, 'shared', 'sync.js')),
    onStatus: (status) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('sync:status', status);
    },
  });
  syncServer.start();

  updater = createUpdater({
    packaged: app.isPackaged,
    currentVersion: app.getVersion(),
    fetch: (input, init) => net.fetch(input, init),
    onStatus: (status) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('update:status', status);
    },
  });

  // When run with npm start it's the plain Electron app, so set the icon.
  if (IS_MAC && !app.isPackaged) app.dock?.setIcon(APP_ICON);

  startPlugins();
  registerIpc();
  windowState = loadWindowState();
  buildMenu();
  createMainWindow();
  createTray();
  updater.start();

  // Clicking the Dock icon brings the window back.
  app.on('activate', showWindow);
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (plugins) plugins.deactivateAll();
  if (syncServer) syncServer.stop();
});
