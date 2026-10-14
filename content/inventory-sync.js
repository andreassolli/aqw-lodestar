// account.aq.com/AQW/Inventory: a "Sync inventory" button that saves the
// logged-in player's full inventory (inventory and bank) to storage. Nothing is
// synced until the button is pressed. Owned-item checkmarks and the merge/quest
// calculators read the saved inventory.
(() => {
  if (!/^\/aqw\/inventory\/?$/i.test(location.pathname)) return;

  const NOTICE_MS = 6000;

  function showNotice(text, isError = false) {
    const notice = document.createElement('div');
    notice.className = 'aqwt-sync-notice' + (isError ? ' is-error' : '');
    notice.textContent = text;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), NOTICE_MS);
  }

  /** The page's own request, so it carries the page's cookies (Firefox needs content.fetch for that). */
  function pageFetch(url, init) {
    const fetchAsPage = typeof content !== 'undefined' && content.fetch ? content.fetch.bind(content) : fetch;
    return fetchAsPage(url, init);
  }

  /** The inventory, read with the page's login (shared/inventory-import.js turns it into the saved format). */
  async function requestInventory() {
    const url = new URL(`${InventoryImport.URL_PATH}&_=${Date.now()}`, location.origin).href;
    const response = await pageFetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest', // what the page's table script sends
      },
    });
    if (!response.ok) throw new Error(`the server answered HTTP ${response.status}`);
    return InventoryImport.parse(await response.text());
  }

  async function synchronizeInventory() {
    return InventoryImport.save(await requestInventory());
  }

  function formatSyncedAt(timestamp) {
    if (!timestamp) return 'Never synced';
    const date = new Date(timestamp);
    return `Last synced ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'aqwt-sync-button';
  button.innerHTML = '<span class="aqwt-sync-button-label">Sync inventory to Lodestar</span><span class="aqwt-sync-button-meta"></span>';
  document.body.appendChild(button);

  const label = button.querySelector('.aqwt-sync-button-label');
  const meta = button.querySelector('.aqwt-sync-button-meta');
  ext.storage.local.get(STORAGE_KEYS.inventorySyncedAt).then((result) => {
    meta.textContent = formatSyncedAt(result[STORAGE_KEYS.inventorySyncedAt]);
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    label.textContent = 'Syncing…';
    try {
      const count = await synchronizeInventory();
      meta.textContent = formatSyncedAt(Date.now());
      showNotice(`Lodestar: saved ${count} items from your inventory`);
    } catch (err) {
      console.error('AQW Lodestar: inventory sync failed:', err);
      showNotice(`Lodestar: couldn't read your inventory (${err.message})`, true);
    } finally {
      button.disabled = false;
      label.textContent = 'Sync inventory to Lodestar';
    }
  });
})();
