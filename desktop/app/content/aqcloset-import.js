// aqcloset.com/profile: fills AQCloset's "Paste the inventory data" field with
// the inventory synced to Lodestar, in the same format AQCloset's own
// bookmarklet sends. Started from the popup settings ("Fill in on AQCloset"),
// either by a message to this tab or by opening /profile#lodestar-import.
// Nothing is submitted: you still press AQCloset's own Import button.
(() => {
  if (!/^\/profile\/?$/.test(location.pathname)) return;

  const HASH = '#lodestar-import';
  const WAIT_FOR_FORM_MS = 20000;
  const NOTICE_MS = 7000;

  /** AQCloset's import format: {"totalCount": n, "data": [{Name, Count, Type, Bank, ...}]} */
  function toAqclosetJson(inventory) {
    const data = inventory.map((entry) => {
      const row = {
        Name: entry.name,
        Count: entry.quantity || 1,
        Type: entry.type || '',
        Bank: entry.bank !== undefined ? entry.bank : entry.location === 'Bank',
      };
      if (entry.coins !== undefined) row.Coins = entry.coins;
      if (entry.ac !== undefined) row.AC = entry.ac;
      if (entry.member !== undefined) row.Member = entry.member;
      return row;
    });
    return JSON.stringify({ totalCount: data.length, data });
  }

  function waitForElement(selector, timeoutMs) {
    const found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function setValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function showNotice(text, isError = false) {
    const notice = document.createElement('div');
    notice.className = 'aqwt-import-notice' + (isError ? ' is-error' : '');
    notice.setAttribute('role', 'status');
    notice.textContent = text;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), NOTICE_MS);
  }

  async function fill() {
    const stored = await ext.storage.local.get([STORAGE_KEYS.inventory, STORAGE_KEYS.username]);
    const inventory = stored[STORAGE_KEYS.inventory];
    if (!Array.isArray(inventory) || !inventory.length) {
      return { error: 'no synced inventory yet (use Sync on your account.aq.com Inventory page)' };
    }

    const textarea = await waitForElement('#inventory-text', WAIT_FOR_FORM_MS);
    if (!textarea) return { error: "AQCloset's inventory form isn't on this page (are you signed in to AQCloset?)" };

    setValue(textarea, toAqclosetJson(inventory));
    const character = document.getElementById('inventory-character');
    const username = stored[STORAGE_KEYS.username];
    if (character && !character.value.trim() && username) setValue(character, username);

    const form = textarea.closest('form') || textarea;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textarea.classList.add('aqwt-import-filled');
    setTimeout(() => textarea.classList.remove('aqwt-import-filled'), 2500);
    document.getElementById('inventory-import')?.focus({ preventScroll: true });

    return { ok: true, count: inventory.length };
  }

  async function fillAndReport() {
    const result = await fill();
    if (result.ok) {
      const button = document.getElementById('inventory-import');
      const label = button ? `“${button.textContent.trim()}”` : 'Import';
      showNotice(`Lodestar: filled in ${result.count.toLocaleString()} items. Press ${label} to import them.`);
    } else {
      showNotice(`Lodestar: couldn't fill in the inventory (${result.error}).`, true);
    }
    return result;
  }

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'FILL_AQCLOSET_INVENTORY') return false;
    fillAndReport().then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  });

  if (location.hash === HASH) {
    history.replaceState(null, '', location.pathname + location.search); // don't refill on reload
    fillAndReport();
  }
})();
