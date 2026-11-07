// Desktop: update status in Settings > About, and a bar when there's something to do.
(() => {
  const updates = window.lodestarDesktop && window.lodestarDesktop.updates;
  if (!updates) return;

  const group = document.createElement('div');
  group.className = 'settings-group';
  group.innerHTML = `
    <h3>Updates <button type="button" class="help-tip" data-help="Lodestar checks for a new version when it starts and every few hours. On Windows and the Linux AppImage it downloads by itself and installs when you restart. On Mac, the portable Windows version and the .deb, it tells you and you download it."></button></h3>
    <p class="settings-hint update-text" role="status"></p>
    <div class="settings-actions">
      <button type="button" class="pill-button update-check">Check for updates</button>
    </div>`;
  document.querySelector('#settings-about .about-intro')?.after(group);

  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <span class="update-bar-text"></span>
    <button type="button" class="pill-button update-bar-action"></button>
    <button type="button" class="update-bar-close" aria-label="Hide this for now">×</button>`;
  document.querySelector('.app-footer')?.before(bar);

  const text = group.querySelector('.update-text');
  const checkButton = group.querySelector('.update-check');
  const barText = bar.querySelector('.update-bar-text');
  const barAction = bar.querySelector('.update-bar-action');
  let current = null;
  let hiddenFor = null;

  function describe(status) {
    switch (status.state) {
      case 'checking': return 'Checking…';
      case 'current': return `You have the newest version (${updates.version}).`;
      case 'downloading': return `Downloading version ${status.version || ''} (${status.percent}%).`;
      case 'ready': return `Version ${status.version} is ready. It installs when you restart.`;
      case 'available': return `Version ${status.version} is out.`;
      case 'error': return `Couldn't check for updates: ${status.error}`;
      default: return `You have version ${updates.version}.`;
    }
  }

  function show(status) {
    if (!status) return;
    current = status;
    group.hidden = status.state === 'off';
    text.textContent = describe(status);
    checkButton.disabled = ['checking', 'downloading', 'ready'].includes(status.state);

    const hasAction = status.state === 'ready' || status.state === 'available';
    bar.hidden = !hasAction || hiddenFor === status.version;
    if (hasAction) {
      barText.textContent = status.state === 'ready' ? `Version ${status.version} is ready to install.` : `Version ${status.version} is out.`;
      barAction.textContent = status.state === 'ready' ? 'Restart now' : 'Download';
    }
  }

  barAction.addEventListener('click', () => {
    if (current.state === 'ready') updates.install();
    else updates.openDownload();
  });
  bar.querySelector('.update-bar-close').addEventListener('click', () => {
    hiddenFor = current.version;
    bar.hidden = true;
  });
  checkButton.addEventListener('click', () => updates.check().then(show));

  updates.onStatus(show);
  updates.status().then(show);
})();
