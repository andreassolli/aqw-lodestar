// AQW Lodestar desktop app: the extension's popup in its own window, with an
// option to keep that window on top of every other window.
//
// The popup files come straight from the extension (copied into app/ by
// scripts/copy-extension.mjs) and are served from app://lodestar/. preload.js
// gives them the extension API they expect; this file answers those calls:
// storage (storage.js), messages to the background (background-host.js runs the
// extension's background.js here) and opening links in the default browser.

const electron = require('electron');
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, protocol, screen, shell } = electron;
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createStorage } = require('./storage');
const { startBackground } = require('./background-host');
const { importFromChrome } = require('./chrome-import');
const { createPluginHost } = require('./plugin-host');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'app://lodestar';
const POPUP_URL = `${ORIGIN}/popup/popup.html`;
const BACKUP_URL = `${ORIGIN}/options/options.html`;
const IS_MAC = process.platform === 'darwin';
const APP_ICON = path.join(APP_DIR, 'desktop', 'icon.png'); // the compass (from build/icon.png)

// Storage keys too big to send to the windows on every change (nothing in the popup watches them).
const QUIET_KEYS = new Set(['itemCatalog']);

// Linux: run through X11 (XWayland on Wayland desktops). Wayland doesn't let an
// app keep its own window on top, so "stay on top" only works this way.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// One copy of the app at a time: opening it again brings the window forward.
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
let storage = null;
let background = null;
let plugins = null;
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULT_STATE = { width: 340, height: 640, pinned: false };


function loadWindowState() {
  try {
    const state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) };
    // Forget the position if that screen is gone (e.g. an unplugged monitor).
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

/** Keeps the window above all others (or stops), and tells the page and menu. */
function setPinned(pinned) {
  windowState.pinned = pinned;
  saveWindowState();
  if (!mainWindow) return;

  // 'floating' sits above normal windows. On the Mac the window also joins every
  // Space, including a full-screen game or browser, so it doesn't vanish there.
  mainWindow.setAlwaysOnTop(pinned, pinned ? 'floating' : 'normal');
  if (IS_MAC) mainWindow.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });

  mainWindow.webContents.send('window:pinned', pinned);
  const item = Menu.getApplicationMenu()?.getMenuItemById('stay-on-top');
  if (item) item.checked = pinned;
  updateTrayMenu();
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

/** Click: bring the window forward, or hide it if it's already in front. */
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
  // Linux desktops only show a tray menu (no click events), so it's attached there.
  if (tray && process.platform === 'linux') tray.setContextMenu(trayMenu());
}

function createTray() {
  // The Mac menu bar wants a black "template" image, which macOS recolours for
  // light and dark menu bars; elsewhere the coloured compass. The @2x files are
  // picked up automatically on high-resolution screens.
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

/** Pages of the app open in the app; everything else in the default browser. */
function openUrl(url) {
  if (typeof url !== 'string') return;
  if (url.startsWith(`${ORIGIN}/options/`)) {
    openBackupWindow(url);
  } else if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
}

/** Links clicked in a page go to the browser instead of replacing the popup. */
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
    autoHideMenuBar: true, // Windows and Linux: the menu shows when Alt is pressed
    // The window/taskbar icon on Windows and Linux (the Mac uses the app bundle's).
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
    // Plugins may keep hidden windows of their own (notifications); closing the
    // main window still quits, as before plugins.
    app.quit();
  });
  mainWindow.loadURL(POPUP_URL);
}

/** The backup page (import / export), above the main window. */
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
    // An import can change the theme and the farm list; start the popup fresh.
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
    { role: 'editMenu' }, // copy and paste shortcuts in the text fields
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

  ipcMain.handle('storage', (_event, op, arg) => {
    if (!['get', 'set', 'remove', 'clear'].includes(op)) throw new Error(`Unknown storage call ${op}`);
    return storage.local[op](arg);
  });

  ipcMain.handle('runtime:message', (_event, message) => background.handleMessage(message));
  ipcMain.handle('tabs:create', (_event, url) => {
    openUrl(url);
    return {};
  });

  // Settings → "Import from Chrome": copies the extension's data from the browser's profile.
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

/** Settings → Plugins, and messages between plugins and their pages. */
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
  ipcMain.handle('plugins:remove', result((_event, id) => plugins.remove(id)));
  ipcMain.handle('plugins:keep', result((_event, id) => plugins.keep(id)));
  ipcMain.handle('plugins:open-folder', () => shell.openPath(pluginsDir));
  ipcMain.handle('plugins:restart', () => {
    app.relaunch();
    app.quit();
  });
  // lodestarPlugins.invoke(id, channel, data) from a plugin's page.
  ipcMain.handle('plugin:invoke', result((_event, id, channel, data) => plugins.handlePageMessage(id, channel, data)));
}

// `npm run start:no-plugins` (or LODESTAR_NO_PLUGINS=1): run the base app only.
const NO_PLUGINS = process.argv.includes('--no-plugins') || process.env.LODESTAR_NO_PLUGINS === '1';

/** Finds plugins, applies installs/removals from last time, and starts the enabled ones. */
function startPlugins() {
  plugins = createPluginHost({
    pluginsDir: path.join(app.getPath('userData'), 'plugins'),
    dataDir: path.join(app.getPath('userData'), 'plugin-data'),
    // Running from source: also load the plugins in desktop/plugins.
    devDirs: app.isPackaged ? [] : [path.join(__dirname, 'plugins')],
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
    // On top of the api in plugin-host.js: Electron itself, the shared storage
    // (farm list, inventory, settings) and opening links in the browser.
    extraApi: () => ({ electron, storage, openUrl, appIcon: APP_ICON }),
    sendToPages: (id, channel, data) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('plugin:event', { id, channel, data });
    },
  });
}

/** Serves app/ at app://lodestar/, and plugin files at app://lodestar/plugins/<id>/; nothing outside them. */
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

  // The installed app gets its Dock icon from the app bundle; when run with
  // `npm start` it's the plain Electron app, so set the compass here.
  if (IS_MAC && !app.isPackaged) app.dock?.setIcon(APP_ICON);

  startPlugins();
  registerIpc();
  windowState = loadWindowState();
  buildMenu();
  createMainWindow();
  createTray();

  // Clicking the Dock icon brings the window back, also after hiding it from the menu bar.
  app.on('activate', showWindow);
});

app.on('window-all-closed', () => app.quit());

// Plugins stop their work (and close their own windows) first.
app.on('before-quit', () => plugins && plugins.deactivateAll());
