// Settings > Data: desktop sync, backup file, transfer code and AQCloset import.
const SettingsData = (() => {
  const byId = (id) => document.getElementById(id);

  const SYNC_PERMISSION = { origins: ['http://127.0.0.1/*'] };

  function initSync() {
    const group = byId('sync-group');
    if (!group || !ext.permissions) return; // the app shows its own version of this
    const connectBox = byId('sync-connect');
    const connectedBox = byId('sync-connected');
    const stateText = byId('sync-state-text');
    const code = byId('sync-code');
    const connect = byId('sync-connect-button');
    const status = byId('sync-status');
    const setStatus = StatusLine(status);
    const ask = (message) => ext.runtime.sendMessage(message).catch((err) => ({ error: err.message }));

    async function refresh() {
      const { pairing, pairError } = (await ask({ type: 'SYNC_STATUS' })) || {};
      // A pairing attempt that finished while the popup was closed by the permission prompt.
      if (!pairing && pairError && status.hidden) setStatus(`Couldn't connect: ${pairError}.`, true);
      connectBox.hidden = Boolean(pairing);
      connectedBox.hidden = !pairing;
      group.classList.toggle('is-synced', Boolean(pairing && !pairing.lastError));
      if (!pairing) return;
      stateText.textContent = pairing.lastError
        ? `Not synced: ${pairing.lastError}.`
        : pairing.lastSyncAt
          ? `Syncing with the desktop app · last synced ${timeAgo(pairing.lastSyncAt)}`
          : 'Connected to the desktop app.';
    }

    connect.addEventListener('click', () => {
      const typed = code.value.trim();
      if (!typed) {
        setStatus('Type the code the desktop app shows.', true);
        code.focus();
        return;
      }
      const mode = document.querySelector('input[name="sync-mode"]:checked').value;
      setStatus('');
      // Hand the code to the background first. The permission prompt can close
      // the popup, and then the background finishes pairing on its own.
      const handedOver = ask({ type: 'SYNC_PAIR_LATER', code: typed, mode });
      // Has to happen right on the click or the browser won't show the prompt.
      ext.permissions.request(SYNC_PERMISSION).then(async (granted) => {
        if (!granted) {
          setStatus('Syncing needs access to the desktop app on this computer (127.0.0.1).', true);
          return;
        }
        connect.disabled = true;
        setStatus('Connecting…');
        await handedOver;
        const result = await ask({ type: 'SYNC_PAIR' });
        connect.disabled = false;
        if (result && result.error) {
          setStatus(`Couldn't connect: ${result.error}.`, true);
          return;
        }
        code.value = '';
        setStatus('Connected. Your farm list and settings now stay the same in both.');
        refresh();
      });
    });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') connect.click();
    });

    byId('sync-now').addEventListener('click', async () => {
      setStatus('Syncing…');
      const result = await ask({ type: 'SYNC_NOW' });
      setStatus(result && result.error ? `Couldn't sync: ${result.error}.` : 'Synced.', Boolean(result && result.error));
      refresh();
    });
    byId('sync-stop').addEventListener('click', async () => {
      await ask({ type: 'SYNC_UNPAIR' });
      ext.permissions.remove(SYNC_PERMISSION).catch(() => {});
      setStatus('Stopped syncing. Both keep what they have now.');
      refresh();
    });

    ext.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEYS.syncPairing]) refresh();
    });
    refresh();
  }

  function initBackup() {
    const setStatus = StatusLine(byId('settings-status'));
    byId('export-data').addEventListener('click', () => {
      Backup.download()
        .then(() => setStatus('Backup downloaded.'))
        .catch((err) => setStatus(`Export failed: ${err.message}`, true));
    });
    // Picking a file closes the popup in some browsers, so import on the backup page.
    byId('import-data').addEventListener('click', () => {
      ext.tabs.create({ url: ext.runtime.getURL('options/options.html#import') });
    });
  }

  function initTransferCode() {
    const output = byId('transfer-code-output');
    const toggle = byId('paste-transfer-code');
    const box = byId('transfer-paste');
    const input = byId('transfer-input');
    const preview = byId('transfer-preview');
    const summary = byId('transfer-summary');
    const apply = byId('transfer-apply');
    const setStatus = StatusLine(byId('transfer-status'));
    let readCode = null;
    let reading = 0;

    function showRead(code) {
      readCode = code;
      apply.disabled = !code;
      preview.hidden = !code;
      summary.replaceChildren(...(code ? TransferCode.describe(code).map((line) => Object.assign(document.createElement('li'), { textContent: line })) : []));
    }

    function showPasteBox(open) {
      box.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) {
        output.hidden = true;
        input.focus();
      } else {
        input.value = '';
        showRead(null);
      }
    }

    byId('copy-transfer-code').addEventListener('click', async () => {
      try {
        const code = await TransferCode.create();
        showPasteBox(false);
        // Also shown so you can copy it by hand if the clipboard says no.
        output.value = code;
        output.hidden = false;
        const copied = await copyToClipboard(code);
        setStatus(
          copied
            ? `Copied (${code.length.toLocaleString()} characters). On the other device: Settings → Data → Paste a code.`
            : "Couldn't copy it: select the code above and copy it yourself."
        );
      } catch (err) {
        setStatus(`Couldn't make a code: ${err.message}`, true);
      }
    });
    output.addEventListener('focus', () => output.select());

    toggle.addEventListener('click', () => {
      setStatus('');
      showPasteBox(box.hidden);
    });
    byId('transfer-cancel').addEventListener('click', () => showPasteBox(false));

    // Check it as it's typed or pasted.
    input.addEventListener('input', async () => {
      const mine = ++reading;
      if (!input.value.trim()) {
        showRead(null);
        setStatus('');
        return;
      }
      try {
        const code = await TransferCode.read(input.value);
        if (mine !== reading) return;
        showRead(code);
        setStatus('');
      } catch (err) {
        if (mine !== reading) return;
        showRead(null);
        setStatus(`${err.message.charAt(0).toUpperCase()}${err.message.slice(1)}.`, true);
      }
    });

    apply.addEventListener('click', async () => {
      if (!readCode) return;
      apply.disabled = true;
      try {
        await TransferCode.apply(readCode);
        showPasteBox(false);
        setStatus('Done. Item details are filled in from the wiki over the next moments.');
        // The farm list also finishes this whenever it opens.
        FarmEntry.completeEntries().catch(() => {});
      } catch (err) {
        apply.disabled = false;
        setStatus(`Couldn't use that code: ${err.message}`, true);
      }
    });
  }

  const AQCLOSET_PROFILE = 'https://aqcloset.com/profile';

  function initAqcloset() {
    const button = byId('fill-aqcloset');
    if (!button) return; // the app has no tabs to fill in
    const setStatus = StatusLine(byId('aqcloset-status'));

    async function fill() {
      const inventory = (await ext.storage.local.get(STORAGE_KEYS.inventory))[STORAGE_KEYS.inventory];
      if (!Array.isArray(inventory) || !inventory.length) {
        setStatus('No synced inventory yet. Use the Sync button on your account.aq.com Inventory page first.', true);
        return;
      }
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      if (tab && /^https?:\/\/(www\.)?aqcloset\.com\/profile\/?(?:[?#]|$)/.test(tab.url || '')) {
        setStatus('Filling in…');
        const result = await ext.tabs.sendMessage(tab.id, { type: 'FILL_AQCLOSET_INVENTORY' }).catch(() => null);
        if (result && result.ok) {
          setStatus(`Filled in ${result.count.toLocaleString()} items. Press Import on the page.`);
          return;
        }
        if (result && result.error) {
          setStatus(`Couldn't fill it in: ${result.error}.`, true);
          return;
        }
        // No answer means the page was open before the extension loaded, open a new one.
      }
      ext.tabs.create({ url: `${AQCLOSET_PROFILE}#lodestar-import` });
    }

    button.addEventListener('click', () => fill().catch((err) => setStatus(`Couldn't fill it in: ${err.message}`, true)));
  }

  function init() {
    initSync();
    initBackup();
    initTransferCode();
    initAqcloset();
  }

  return { init };
})();
