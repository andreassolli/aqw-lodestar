// Backup page: shows what's saved, exports it, and imports a backup file.
// The logic lives in shared/backup.js; this file is the page's UI.
(() => {
  const $ = (id) => document.getElementById(id);
  let pendingImport = null;

  function renderSummary(list, data) {
    list.replaceChildren(
      ...Backup.describe(data).map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      })
    );
  }

  function setStatus(message, isError = false) {
    const status = $('status');
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('is-error', isError);
  }

  async function refreshCurrent() {
    renderSummary($('current-summary'), await Backup.currentData());
  }

  async function chooseFile(file) {
    setStatus('');
    $('import-preview').hidden = true;
    pendingImport = null;
    if (!file) return;

    try {
      pendingImport = Backup.parse(await file.text());
    } catch (err) {
      setStatus(`Couldn't read the backup: ${err.message}.`, true);
      return;
    }
    const when = pendingImport.exportedAt ? new Date(pendingImport.exportedAt).toLocaleString() : 'an unknown date';
    $('import-preview-title').textContent = `Backup from ${when} contains:`;
    renderSummary($('import-summary'), pendingImport.data);
    $('import-preview').hidden = false;
  }

  function resetImport() {
    pendingImport = null;
    $('import-file').value = '';
    $('import-preview').hidden = true;
  }

  async function confirmImport() {
    if (!pendingImport) return;
    await Backup.restore(pendingImport.data);
    resetImport();
    await refreshCurrent();
    setStatus('Backup restored. Reload any open AQW, wiki or AQCloset tabs to see it.');
  }

  ext.storage.local.get(STORAGE_KEYS.theme).then((result) => {
    document.documentElement.dataset.theme = result[STORAGE_KEYS.theme] || 'dark';
  });

  $('export-button').addEventListener('click', () =>
    Backup.download()
      .then(() => setStatus('Backup downloaded.'))
      .catch((err) => setStatus(`Export failed: ${err.message}`, true))
  );
  $('import-file').addEventListener('change', (e) => chooseFile(e.target.files[0]));
  $('import-cancel').addEventListener('click', resetImport);
  $('import-confirm').addEventListener('click', () =>
    confirmImport().catch((err) => setStatus(`Import failed: ${err.message}`, true))
  );

  // Opened from the popup's "Import" button: go straight to choosing a file.
  if (location.hash === '#import') {
    document.querySelector('.file-button')?.scrollIntoView({ block: 'center' });
    $('import-file').focus();
  }

  refreshCurrent();
})();
