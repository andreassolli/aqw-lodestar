// account.aq.com/AQW/Inventory: a "Sync inventory" button that saves the
// logged-in player's full inventory (inventory and bank) to storage. Nothing is
// synced until the button is pressed. Owned-item checkmarks and the merge/quest
// calculators read the saved inventory.
(() => {
  if (!/^\/aqw\/inventory\/?$/i.test(location.pathname)) return;

  const NOTICE_MS = 6000;

  /** "Dragon Scale x24" -> { name: "Dragon Scale", quantity: 24 } */
  function parseStack(rawName) {
    const match = rawName.match(/(.*?)\s+x(\d+)$/i);
    return match ? { name: match[1].trim(), quantity: parseInt(match[2], 10) } : { name: rawName.trim(), quantity: 1 };
  }

  /**
   * One inventory row. The endpoint returns objects like
   * { Name, Type, Count, Bank: 0|1, ... }; older array rows ([name, , , location]) still work.
   */
  function parseRow(row) {
    if (Array.isArray(row)) {
      return row[0] ? { ...parseStack(String(row[0])), type: null, location: row[3] || 'Inventory' } : null;
    }
    if (!row || !row.Name) return null;
    const { name, quantity } = parseStack(String(row.Name));
    const entry = {
      name,
      quantity: Number(row.Count) || quantity,
      type: row.Type || null,
      location: row.Bank ? 'Bank' : 'Inventory',
    };
    // Kept as-is for the AQCloset import (settings > "Fill in on AQCloset").
    for (const [from, to] of [['Bank', 'bank'], ['AC', 'ac'], ['Member', 'member'], ['Coins', 'coins']]) {
      if (row[from] !== undefined) entry[to] = row[from];
    }
    return entry;
  }

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

  async function requestInventoryRows() {
    const url = new URL(`https://account.aq.com/myapi/inventory/InventoryData?skip=0&requireTotalCount=true&_=${Date.now()}`, location.origin).href;
    const response = await pageFetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest', // what the page's table script sends
      },
    });
    if (!response.ok) throw new Error(`the server answered HTTP ${response.status}`);

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // Usually a login page or error page instead of data.
      throw new Error(`expected inventory data but got ${text.trim().startsWith('<') ? 'an HTML page (are you logged in?)' : 'something else'}`);
    }
    const rows = Array.isArray(json) ? json : json.data || json.aaData;
    if (!Array.isArray(rows)) throw new Error(`unexpected response (keys: ${Object.keys(json).join(', ') || 'none'})`);
    return rows;
  }

  async function synchronizeInventory() {
    const rows = await requestInventoryRows();
    const inventory = rows.map(parseRow).filter(Boolean);
    if (rows.length && !inventory.length) {
      throw new Error(`no item names found in ${rows.length} rows (first row: ${JSON.stringify(rows[0]).slice(0, 120)})`);
    }
    await ext.storage.local.set({ [STORAGE_KEYS.inventory]: inventory, [STORAGE_KEYS.inventorySyncedAt]: Date.now() });
    return inventory.length;
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
