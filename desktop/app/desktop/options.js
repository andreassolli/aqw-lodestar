// Desktop app: the backup page's wording, for moving data between the
// extension and the app (both use the same backup file format).
(() => {
  const lead = document.querySelector('.lead');
  if (lead) {
    lead.textContent =
      'Move your data between the Lodestar browser extension and this app: export a backup in one and import it in the other.';
  }

  // The extension's message talks about reloading browser tabs; the app updates by itself.
  const status = document.getElementById('status');
  if (status) {
    new MutationObserver(() => {
      const text = status.textContent;
      if (text.startsWith('Backup restored.') && text !== 'Backup restored.') status.textContent = 'Backup restored.';
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }
})();
