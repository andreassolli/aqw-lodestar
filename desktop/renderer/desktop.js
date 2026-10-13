// Desktop app additions to the extension's popup: the "stay on top" pin button
// in the header and in Settings, plus wording that fits an app without
// browser tabs. Loaded after popup.js (see scripts/copy-extension.mjs).
(() => {
  const desktop = window.lodestarDesktop;
  if (!desktop) return;

  const shortcut = desktop.platform === 'darwin' ? '⌘⇧T' : 'Ctrl+Shift+T';
  document.documentElement.classList.add('is-desktop');
  document.title = 'AQW Lodestar';

  const pin = document.createElement('button');
  pin.type = 'button';
  pin.id = 'pin-toggle';
  pin.className = 'header-button';
  pin.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
  // Top right, beside the logo (Settings and the theme switch are in the tab row below).
  const pinCorner = document.createElement('div');
  pinCorner.className = 'header-buttons pin-corner';
  pinCorner.append(pin);
  document.getElementById('logo')?.after(pinCorner);

  const group = document.createElement('div');
  group.className = 'settings-group';
  group.innerHTML = `
    <h3>Window</h3>
    <div class="setting-row">
      <span class="setting-label" id="stay-on-top-label">Stay on top</span>
      <div class="segmented" role="radiogroup" aria-labelledby="stay-on-top-label">
        <label><input type="radio" name="stay-on-top" value="off" checked><span>Off</span></label>
        <label><input type="radio" name="stay-on-top" value="on"><span>On</span></label>
      </div>
    </div>
    <p class="settings-hint">Keeps Lodestar above every other window, including the game, so the boosts and your farm list stay in view. Also with the pin button at the top, or ${shortcut}.</p>`;
  document.querySelector('#settings-view .settings-header')?.after(group);
  const radios = [...group.querySelectorAll('input[name="stay-on-top"]')];

  function reflect(pinned) {
    pin.setAttribute('aria-pressed', String(pinned));
    pin.classList.toggle('is-pinned', pinned);
    pin.title = pinned ? `Stop staying on top (${shortcut})` : `Stay on top of other windows (${shortcut})`;
    pin.setAttribute('aria-label', pinned ? 'Stop staying on top' : 'Stay on top of other windows');
    radios.forEach((radio) => {
      radio.checked = radio.value === (pinned ? 'on' : 'off');
    });
  }

  pin.addEventListener('click', async () => reflect(await desktop.setPinned(pin.getAttribute('aria-pressed') !== 'true')));
  radios.forEach((radio) =>
    radio.addEventListener('change', async () => {
      if (radio.checked) reflect(await desktop.setPinned(radio.value === 'on'));
    })
  );
  desktop.onPinnedChange(reflect); // the menu item and shortcut
  desktop.getPinned().then(reflect);

  const importGroup = document.createElement('div');
  importGroup.className = 'settings-group';
  importGroup.innerHTML = `
    <h3>Browser extension</h3>
    <p class="settings-hint">Copy your farm list, synced inventory and settings from the Lodestar extension in Chrome, Edge, Brave or another Chromium browser. It replaces what's in the app now; the app keeps a copy of that first.</p>
    <div class="settings-actions">
      <button type="button" id="import-chrome" class="pill-button">Import from Chrome</button>
    </div>
    <div class="import-other" id="import-other" hidden>
      <label for="import-source">Other copies found</label>
      <select id="import-source"></select>
    </div>
    <p id="import-chrome-status" class="check-status" role="status" hidden></p>`;
  const dataGroup = document.getElementById('export-data')?.closest('.settings-group');
  if (dataGroup) dataGroup.before(importGroup);
  else document.getElementById('settings-view')?.append(importGroup);

  const importButton = importGroup.querySelector('#import-chrome');
  const importStatus = importGroup.querySelector('#import-chrome-status');
  const otherBox = importGroup.querySelector('#import-other');
  const otherSelect = importGroup.querySelector('#import-source');
  const STATUS_KEY = 'lodestar-import-status';

  function setImportStatus(message, isError = false) {
    importStatus.hidden = !message;
    importStatus.textContent = message || '';
    importStatus.classList.toggle('is-error', isError);
  }

  const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  async function runImport(id) {
    importButton.disabled = true;
    setImportStatus('Looking for Lodestar in your browsers…');
    const result = await desktop.importFromChrome(id).catch((err) => ({ error: err.message }));
    importButton.disabled = false;

    if (!result || result.error) {
      const error = result && result.error;
      setImportStatus(
        error === 'not-found'
          ? "Couldn't find the Lodestar extension in Chrome, Edge, Brave, Vivaldi or Opera on this computer. Using Firefox? Export a backup from the extension's settings and choose Import… below."
          : error === 'empty'
            ? `Found Lodestar in ${result.label}, but it has nothing saved yet: no farm list, synced inventory or settings. Add items to its farm list or sync your inventory on account.aq.com, then try again.`
            : `Import failed: ${error || 'unknown error'}.`,
        true
      );
      return;
    }

    // "40 items on the farm list · 812 inventory items (synced 12/10/2026)"
    const summary = Backup.describe(result.data).slice(0, 2).join(' · ');
    const message = `Imported from ${result.label}: ${summary}.`;
    // Reload so the theme, username and lists all show the imported data; the
    // message and the open Settings view survive the reload.
    try {
      sessionStorage.setItem(STATUS_KEY, JSON.stringify({ message, others: result.others, id: result.id }));
    } catch {}
    location.reload();
  }

  function showOthers(others, currentId) {
    if (!others || !others.length) return;
    otherSelect.replaceChildren(
      Object.assign(document.createElement('option'), { value: '', textContent: 'Import from another copy…' }),
      ...others.map((other) => Object.assign(document.createElement('option'), { value: other.id, textContent: `${other.label} · changed ${when(other.modified)}` }))
    );
    otherBox.hidden = false;
  }

  importButton.addEventListener('click', () => runImport());
  otherSelect.addEventListener('change', () => {
    if (otherSelect.value) runImport(otherSelect.value);
  });

  // After an import's reload: reopen Settings and show what happened.
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATUS_KEY) || 'null');
    if (saved) {
      sessionStorage.removeItem(STATUS_KEY);
      document.getElementById('settings-toggle')?.click();
      setImportStatus(saved.message);
      showOthers(saved.others, saved.id);
      importGroup.scrollIntoView({ block: 'nearest' });
    }
  } catch {}

  // There's no right-click menu on web pages here; items come in through the + button or a backup.
  const empty = document.getElementById('empty-message');
  if (empty) {
    empty.innerHTML =
      'Nothing here yet. Press <strong>+</strong> above to add an item from a wiki link, or bring over your extension’s farm list with <strong>Settings → Import from Chrome</strong>.';
  }

  const dataHint = [...document.querySelectorAll('#settings-view .settings-hint')].find((p) => p.textContent.startsWith('Save your farm list'));
  if (dataHint) {
    dataHint.textContent =
      'Save the app\u2019s farm list, inventory and settings to a file, or load a backup file (for example one exported from the extension in Firefox).';
  }
})();
