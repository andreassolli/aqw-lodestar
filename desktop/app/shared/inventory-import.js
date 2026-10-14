// Reading the player's inventory from account.aq.com's inventory data
// (https://account.aq.com/myapi/inventory/InventoryData?skip=0&requireTotalCount=true),
// in the saved-inventory format the owned checkmarks, item lists and calculators
// use. Shared by the extension's "Sync inventory" button (content/inventory-sync.js)
// and the desktop app, where the response is pasted in (Item Lists plugin).

const InventoryImport = (() => {
  const URL_PATH = '/myapi/inventory/InventoryData?skip=0&requireTotalCount=true';
  const PAGE_URL = `https://account.aq.com${URL_PATH}`;

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

  /**
   * The inventory in the response's text.
   * @returns {{name: string, quantity: number, type: string|null, location: string}[]}
   * @throws {Error} with a readable message when the text isn't inventory data
   */
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
      // Pasted with a little extra around it (copying the whole browser page can
      // add a "Pretty-print" label or similar): read from the first { to the last }.
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
      // Usually a login page or error page instead of data.
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

  /** Saves an inventory the way a sync does (replacing the saved one). */
  async function save(inventory) {
    await ext.storage.local.set({ [STORAGE_KEYS.inventory]: inventory, [STORAGE_KEYS.inventorySyncedAt]: Date.now() });
    return inventory.length;
  }

  return { URL_PATH, PAGE_URL, parse, parseRow, save };
})();
