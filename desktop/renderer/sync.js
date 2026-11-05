// Desktop: the app's side of syncing with the extension, in Settings.
(() => {
  const sync = window.lodestarDesktop && window.lodestarDesktop.sync;
  if (!sync) return;

  const group = document.createElement('div');
  group.className = 'settings-sub';
  group.id = 'desktop-sync-group';
  group.innerHTML = `
    <h4>Browser extension <button type="button" class="help-tip" data-help="Keeps your farm list and settings the same here and in the Lodestar extension in your browser on this computer. Press Connect the extension, then type the code it shows into the extension: Settings → Data → Desktop app."></button></h4>
    <div class="desktop-sync-off">
      <div class="settings-actions">
        <button type="button" class="pill-button desktop-sync-pair">Connect the extension</button>
      </div>
    </div>
    <div class="desktop-sync-code" hidden>
      <p class="sync-code" aria-live="polite"></p>
      <p class="settings-hint">Type it in the extension. It works for 5 minutes.</p>
    </div>
    <div class="desktop-sync-on" hidden>
      <p class="sync-state"><span class="sync-dot" aria-hidden="true"></span><span class="desktop-sync-state"></span></p>
      <div class="settings-actions">
        <button type="button" class="pill-button desktop-sync-stop">Stop syncing</button>
      </div>
    </div>
    <p class="check-status is-error desktop-sync-error" role="status" hidden></p>`;

  // First in Sync and transfer, where the extension has its side.
  document.querySelector('#sync-transfer-group > h3')?.after(group);

  const off = group.querySelector('.desktop-sync-off');
  const codeBox = group.querySelector('.desktop-sync-code');
  const code = group.querySelector('.sync-code');
  const on = group.querySelector('.desktop-sync-on');
  const state = group.querySelector('.desktop-sync-state');
  const error = group.querySelector('.desktop-sync-error');
  let codeTimer = null;

  function show(status) {
    if (!status) return;
    error.hidden = !status.error;
    error.textContent = status.error ? `Sync can't start: ${status.error}.` : '';
    on.hidden = !status.paired;
    off.hidden = status.paired;
    group.classList.toggle('is-synced', status.paired);
    const showCode = !status.paired && Boolean(status.code);
    codeBox.hidden = !showCode;
    // "ABC 123" is easier to read and type.
    if (showCode) code.textContent = `${status.code.slice(0, 3)} ${status.code.slice(3)}`;
    clearTimeout(codeTimer);
    if (showCode) codeTimer = setTimeout(() => sync.status().then(show), status.codeExpiresAt - Date.now() + 200);
    state.textContent = status.lastSyncAt
      ? `Syncing with the browser extension · last synced ${timeAgo(status.lastSyncAt)}`
      : 'Connected to the browser extension.';
  }

  group.querySelector('.desktop-sync-pair').addEventListener('click', () => sync.startPairing().then(show));
  group.querySelector('.desktop-sync-stop').addEventListener('click', () => sync.unpair().then(show));
  sync.onStatus(show);
  sync.status().then(show);
  // Keep "last synced" up to date while Settings is open.
  setInterval(() => {
    if (!on.hidden && group.offsetParent) sync.status().then(show);
  }, 60000);
})();
