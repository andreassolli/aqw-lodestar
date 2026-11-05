// Reads your inventory from account.aq.com's inventory data into the format we
// save. Used by the Sync button and the desktop app's paste import.

const InventoryImport = (() => {
  const URL_PATH = '/myapi/inventory/InventoryData?skip=0&requireTotalCount=true';
  const PAGE_URL = `https://account.aq.com${URL_PATH}`;

  function parseStack(rawName) {
    const match = rawName.match(/(.*?)\s+x(\d+)$/i);
    return match ? { name: match[1].trim(), quantity: parseInt(match[2], 10) } : { name: rawName.trim(), quantity: 1 };
  }

  // Rows are objects now. Older array rows still work.
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
    // Kept for the AQCloset import.
    for (const [from, to] of [['Bank', 'bank'], ['AC', 'ac'], ['Member', 'member'], ['Coins', 'coins']]) {
      if (row[from] !== undefined) entry[to] = row[from];
    }
    return entry;
  }

  // Throws a readable error if it's not inventory data.
  function parse(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('nothing was pasted');
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
    if (json === undefined && !trimmed.startsWith('<')) {
      // Copying the whole page can add extra stuff around it, so read from the first { to the last }.
      const start = trimmed.search(/[[{]/);
      const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
      if (start >= 0 && end > start) {
        try {
          json = JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          json = undefined;
        }
      }
    }
    if (json === undefined) {
      // Usually means it's a login or error page.
      throw new Error(
        trimmed.startsWith('<')
          ? 'expected inventory data but got an HTML page (are you logged in?)'
          : "this doesn't look like inventory data (are you logged in on account.aq.com? copy the whole page)"
      );
    }
    if (!json || typeof json !== 'object') throw new Error("expected inventory data but this isn't it (copy the whole page)");
    const rows = Array.isArray(json) ? json : json.data || json.aaData;
    if (!Array.isArray(rows)) throw new Error(`unexpected response (keys: ${Object.keys(json).join(', ') || 'none'})`);

    const inventory = rows.map(parseRow).filter(Boolean);
    if (rows.length && !inventory.length) {
      throw new Error(`no item names found in ${rows.length} rows (first row: ${JSON.stringify(rows[0]).slice(0, 120)})`);
    }
    return inventory;
  }

  async function save(inventory) {
    await ext.storage.local.set({ [STORAGE_KEYS.inventory]: inventory, [STORAGE_KEYS.inventorySyncedAt]: Date.now() });
    return inventory.length;
  }

  return { URL_PATH, PAGE_URL, parse, parseRow, save };
})();
