// Ultra Assistant: watches the game's network traffic for boss lines and shows
// who should do what (Taunt, Zone) in a small notification at the top of the
// screen. Runs in Lodestar's main process; started by desktop/plugin-host.js.
//
// The capture uses the "cap" package (libpcap on Mac and Linux, Npcap on
// Windows), which is native code: the plugin is built for each platform by
// desktop/scripts/build-plugin.mjs.

const path = require('node:path');
const { Cap } = require('cap');

const PORTS = [5594, 5588];

const OPENING = [
    {
        trigger: { Message: 'I will make you see the truth.' },
        role: 'LOO',
        action: 'Taunt'
    },
    {
        trigger: { Message: 'You shall listen.' },
        role: 'LOO',
        action: 'Taunt'
    }
];

const CYCLE = [
    { trigger: { Message: 'All stand equal beneath the eyes of the Eternal.' }, role: 'DPS', action: 'Zone' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'AP', action: 'Taunt' },
    { trigger: { Message: 'You shall listen.' }, role: 'LOO', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LOO', action: 'Taunt' },

    { trigger: { Message: 'All stand equal beneath the eyes of the Eternal.' }, role: 'LR', action: 'Zone' },
    { trigger: { Message: 'You shall listen.' }, role: 'LR', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LR', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LOO', action: 'Taunt' },
    { trigger: { Message: 'You shall listen.' }, role: 'LOO', action: 'Taunt' },

    { trigger: { Message: 'All stand equal beneath the eyes of the Eternal.' }, role: 'AP', action: 'Zone' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'AP', action: 'Taunt' },
    { trigger: { Message: 'You shall listen.' }, role: 'LR', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LR', action: 'Taunt' },

    { trigger: { Message: 'All stand equal beneath the eyes of the Eternal.' }, role: 'LOO', action: 'Zone' },
    { trigger: { Message: 'You shall listen.' }, role: 'LOO', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LOO', action: 'Taunt' },
    { trigger: { Message: 'I will make you see the truth.' }, role: 'LOO', action: 'Taunt' },
    { trigger: { Message: 'You shall listen.' }, role: 'LR', action: 'Taunt' }
];

const RESET_MESSAGE = 'We move closer to wiping the slate clean';

const NOTIFICATION_WIDTH = 300;
const NOTIFICATION_HEIGHT = 90;

let api;
let capture;
let captureBuffer;
let notificationWindow = null;
let notificationReady = false;
let pendingNotification = null;

let openingIndex = 0;
let cycleIndex = 0;
let openingComplete = false;

// What the plugin's page shows at the top: whether capture is running.
let status = { listening: false, message: 'Starting…' };

function setStatus(listening, message) {
    status = { listening, message };
    api.page.send('status', status);
}

// ---------- the notification window ----------

function positionNotificationWindow() {
    if (!notificationWindow || notificationWindow.isDestroyed()) return;

    const { screen } = api.electron;
    const { x, y, width } = screen.getPrimaryDisplay().workArea;

    notificationWindow.setBounds({
        x: Math.round(x + (width - NOTIFICATION_WIDTH) / 2),
        y: y + 10,
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT
    });
}

function createNotificationWindow() {
    const { BrowserWindow, ipcMain } = api.electron;

    notificationWindow = new BrowserWindow({
        width: NOTIFICATION_WIDTH,
        height: NOTIFICATION_HEIGHT,
        show: false, // Create it without displaying it
        frame: false,
        transparent: true,
        resizable: false,
        movable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        focusable: false,
        webPreferences: {
            preload: path.join(__dirname, 'notification', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    positionNotificationWindow();
    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    notificationWindow.setVisibleOnAllWorkspaces(true);

    // Load the notification UI right away, so the first one shows instantly.
    notificationWindow.loadFile(path.join(__dirname, 'notification', 'notification.html'));
    notificationWindow.webContents.once('did-finish-load', () => {
        notificationReady = true;

        if (pendingNotification) {
            showNotification(pendingNotification);
            pendingNotification = null;
        }
    });

    notificationWindow.on('closed', () => {
        notificationWindow = null;
    });

    // Channel names start with the plugin id, so they can't clash with other plugins.
    ipcMain.on('ultra-assistant:notification:hide', () => {
        if (notificationWindow && !notificationWindow.isDestroyed()) {
            notificationWindow.hide();
        }
    });
}

function showNotification(data) {
    if (!notificationWindow || notificationWindow.isDestroyed()) return;

    if (!notificationReady) {
        pendingNotification = data;
        return;
    }

    positionNotificationWindow();
    notificationWindow.webContents.send('notification:show', data);
    notificationWindow.showInactive();
}

// ---------- the fight pattern ----------

function resetFightPattern() {
    openingIndex = 0;
    cycleIndex = 0;
    openingComplete = false;

    api.log('[PATTERN] Fight pattern reset');
}

function handleBossMessage(message) {
    // Reset takes priority over every other trigger.
    if (message.includes(RESET_MESSAGE)) {
        resetFightPattern();
        return;
    }

    const pattern = openingComplete ? CYCLE : OPENING;
    const index = openingComplete ? cycleIndex : openingIndex;
    const expected = pattern[index];

    // Ignore messages that don't match the next expected trigger.
    if (!expected || message !== expected.trigger.Message) {
        return;
    }

    api.log(
        `[PATTERN] ${openingComplete ? 'Cycle' : 'Opening'} ` +
        `${index + 1}: ${expected.role} — ${expected.action}`
    );

    const notificationData = {
        role: expected.role,
        action: expected.action,
        trigger: message
    };
    showNotification(notificationData);
    api.page.send('step', notificationData);

    if (!openingComplete) {
        openingIndex++;

        if (openingIndex >= OPENING.length) {
            openingComplete = true;
            cycleIndex = 0;
            api.log('[PATTERN] Opening complete; starting cycle');
        }
    } else {
        cycleIndex = (cycleIndex + 1) % CYCLE.length;
    }
}

// ---------- packet capture ----------

/** The network interface to watch: Wi-Fi (en0) on a Mac as before, otherwise the one with this computer's address. */
function findDevice() {
    const devices = Cap.deviceList();
    const preferred = api.settings.get('device');
    if (preferred && devices.some((device) => device.name === preferred)) return preferred;
    if (devices.some((device) => device.name === 'en0')) return 'en0';
    return Cap.findDevice() || null;
}

function startPortMonitoring() {
    const device = findDevice();

    if (!device) {
        setStatus(false, "Couldn't find a network interface to watch.");
        api.log('[CAPTURE] Could not find a network interface');
        return;
    }

    capture = new Cap();
    captureBuffer = Buffer.alloc(65535);

    const filter = `tcp and (${PORTS.map((port) => `port ${port}`).join(' or ')})`;
    const bufferSize = 10 * 1024 * 1024;

    try {
        capture.open(device, filter, bufferSize, captureBuffer);
    } catch (error) {
        // Most often missing permission to capture (see the plugin's README).
        setStatus(false, `Couldn't start watching the game's traffic: ${error.message}`);
        console.error('Failed to start TCP monitoring:', error);
        capture = null;
        return;
    }

    setStatus(true, `Listening to the game on ${device}.`);

    capture.on('packet', (nbytes) => {
        const packetText = captureBuffer
            .subarray(0, nbytes)
            .toString('utf8');

        // Ignore packets that don't contain recognizable game messages.
        if (!packetText.includes('"msg"') &&
            !packetText.includes('"umsg"')) {
            return;
        }

        // Extract the animation message from the game packet.
        const animationRegex = /"msg"\s*:\s*"((?:\\.|[^"\\])*)"/g;

        for (const match of packetText.matchAll(animationRegex)) {
            try {
                const message = JSON.parse(`"${match[1]}"`);
                api.log('[GAME MESSAGE]', message);
                handleBossMessage(message);
            } catch (error) {
                console.error('[PACKET] Failed to parse animation message:', error);
            }
        }

        // Extract the reset message from the umsg packet.
        const systemRegex = /"cmd"\s*:\s*"umsg"[\s\S]*?"s"\s*:\s*"((?:\\.|[^"\\])*)"/g;

        for (const match of packetText.matchAll(systemRegex)) {
            try {
                const message = JSON.parse(`"${match[1]}"`);
                api.log('[GAME SYSTEM MESSAGE]', message);
                handleBossMessage(message);
            } catch (error) {
                console.error('[PACKET] Failed to parse system message:', error);
            }
        }
    });
}

// ---------- plugin entry points ----------

/** Called by Lodestar when it starts, with the plugin api (see desktop/README.md). */
function activate(pluginApi) {
    api = pluginApi;

    // The page asks for the current status when it opens, and can reset the pattern.
    api.page.handle('status', () => status);
    api.page.handle('reset', () => {
        resetFightPattern();
        return true;
    });

    createNotificationWindow();
    startPortMonitoring();
}

/** Called when Lodestar quits: stop capturing and close the notification. */
function deactivate() {
    if (capture) {
        try {
            capture.close();
        } catch (error) {
            console.error('Error closing packet capture:', error);
        }
        capture = null;
    }
    if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.destroy();
    }
}

module.exports = { activate, deactivate };
