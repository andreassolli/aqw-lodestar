// The Lists tab: the extension's event item lists (content/item-list-view.js),
// exactly as on the wiki's Search Items by Tag page. The app ships the
// extension's page scripts in app/content/, so this loads them from there
// instead of keeping a copy: the lists, results and cards stay identical.
(() => {
  // What item-list-view.js needs that the popup doesn't load already, in the
  // order the extension loads them on the wiki (see manifest.json).
  const SCRIPTS = [
    '/shared/inventory.js',
    '/shared/inventory-import.js',
    '/shared/rarity.js',
    '/content/page.js',
    '/content/item-preview.js',
    '/content/owned-marks.js',
    '/content/farm-buttons.js',
    '/content/try-on-buttons.js',
    '/content/item-lists.config.js',
    '/content/item-list-view.js',
  ];
  const STYLES = [
    '/content/base.css',
    '/shared/rarity.css',
    '/content/item-preview.css',
    '/content/owned-marks.css',
    '/content/farm-buttons.css',
    '/content/try-on-buttons.css',
    '/content/item-lists.css',
  ];

  // Another plugin may have loaded some of these already; each loads once.
  function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`couldn't load ${src}`));
      document.body.append(script);
    });
  }

  function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    // Before the plugin's own page.css, so page.css can adjust them for the app.
    const own = document.querySelector('link[href$="/plugins/item-lists/page/page.css"]');
    if (own) own.before(link);
    else document.head.append(link);
  }

  const REMEMBER_KEY = 'lodestar-item-lists-choice';
  // Shown first in the dropdown; every other list is an event.
  const PERSONAL = ['owned', 'farm'];

  /**
   * A dropdown in place of the row of list buttons (hidden by page.css). Picking a
   * list clicks its button, so the list view does exactly what it does on the
   * wiki. The choice is remembered and opened again next time.
   */
  function listPicker(view) {
    const select = document.createElement('select');
    select.className = 'item-lists-select';
    select.setAttribute('aria-label', 'Choose a list');

    const option = (value, label, title) => Object.assign(document.createElement('option'), { value, textContent: label, title: title || '' });
    const group = (label, lists) => {
      const optgroup = Object.assign(document.createElement('optgroup'), { label });
      optgroup.append(...lists.map((list) => option(list.id, list.label, list.title)));
      return optgroup;
    };
    select.append(
      option('', 'Choose a list…'),
      group('Your items', ITEM_LISTS.filter((list) => PERSONAL.includes(list.id))),
      group('Events', ITEM_LISTS.filter((list) => !PERSONAL.includes(list.id)))
    );

    const buttonFor = (id) => view.querySelector(`.aqwt-list-button[data-list="${CSS.escape(id)}"]`);
    const openButton = () => view.querySelector('.aqwt-list-button[aria-expanded="true"]');

    function choose(id) {
      const open = openButton();
      if (!id) {
        open?.click(); // clicking the open list closes it
      } else if (open?.dataset.list !== id) {
        buttonFor(id)?.click();
      }
      // The list's own colour on the dropdown's edge, like its button on the wiki.
      const list = ITEM_LISTS.find((l) => l.id === id);
      select.style.setProperty('--list-color', list?.color || 'var(--line)');
      try {
        if (id) localStorage.setItem(REMEMBER_KEY, id);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        // storage blocked: just don't remember
      }
    }

    select.addEventListener('change', () => choose(select.value));

    let saved = null;
    try {
      saved = localStorage.getItem(REMEMBER_KEY);
    } catch {
      saved = null;
    }
    if (saved && buttonFor(saved)) {
      select.value = saved;
      // After the view is on the page, so its observers see the cards.
      requestAnimationFrame(() => choose(saved));
    }
    return select;
  }

  const LOGIN_URL = 'https://account.aq.com/';

  function formatWhen(ms) {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /**
   * Shown with the Owned list: the extension syncs the inventory from a button
   * on account.aq.com, which the app doesn't have, so here it's pasted in from
   * the same address instead. Open (unfolded) until an inventory is imported.
   */
  function inventoryImport(refresh) {
    const box = document.createElement('details');
    box.className = 'inventory-import';
    box.hidden = true;
    box.innerHTML = `
      <summary>
        <span class="inventory-import-title">Import your inventory</span>
        <span class="inventory-import-when"></span>
      </summary>
      <ol class="inventory-import-steps">
        <li><a class="login-link" target="_blank" rel="noreferrer">Log in on account.aq.com</a> in your browser.</li>
        <li>Then open <a class="data-link" target="_blank" rel="noreferrer">your inventory data</a>. It's a page of text that starts with <code>{"data":[</code>.</li>
        <li>Select everything on it (<kbd class="select-all-key"></kbd>), copy, and paste it below. In Firefox, choose <b>Raw Data</b> first.</li>
      </ol>
      <textarea class="inventory-import-text" rows="3" spellcheck="false" placeholder='Paste here: {"data":[{"Name":…' aria-label="Inventory data"></textarea>
      <div class="inventory-import-actions">
        <button type="button" class="pill-button inventory-import-go">Import</button>
        <label class="pill-button inventory-import-file">Open saved file…<input type="file" accept=".json,.txt,application/json,text/plain" hidden /></label>
        <span class="inventory-import-status" role="status"></span>
      </div>`;

    box.querySelector('.login-link').href = LOGIN_URL;
    box.querySelector('.data-link').href = InventoryImport.PAGE_URL;
    box.querySelector('.select-all-key').textContent = /mac/i.test(navigator.platform) ? '⌘ A' : 'Ctrl A';
    const text = box.querySelector('.inventory-import-text');
    const go = box.querySelector('.inventory-import-go');
    const fileInput = box.querySelector('input[type="file"]');
    const status = box.querySelector('.inventory-import-status');
    const when = box.querySelector('.inventory-import-when');

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    }

    async function showLastImport() {
      const stored = await ext.storage.local.get([STORAGE_KEYS.inventory, STORAGE_KEYS.inventorySyncedAt]);
      const inventory = stored[STORAGE_KEYS.inventory];
      const at = stored[STORAGE_KEYS.inventorySyncedAt];
      const has = Array.isArray(inventory) && inventory.length > 0;
      when.textContent = has ? `${inventory.length.toLocaleString()} items${at ? ` · ${formatWhen(at)}` : ''}` : 'not imported yet';
      return has;
    }

    async function importText(raw) {
      setStatus('');
      let inventory;
      try {
        inventory = InventoryImport.parse(raw);
      } catch (err) {
        setStatus(`Couldn't import that: ${err.message}.`, true);
        return;
      }
      if (!inventory.length) {
        setStatus('That inventory is empty, so nothing was changed.', true);
        return;
      }
      go.disabled = true;
      try {
        const count = await InventoryImport.save(inventory);
        text.value = '';
        setStatus(`Imported ${count.toLocaleString()} items.`);
        await showLastImport();
        refresh();
      } catch (err) {
        setStatus(`Couldn't save the inventory: ${err.message}.`, true);
      } finally {
        go.disabled = false;
      }
    }

    go.addEventListener('click', () => importText(text.value));
    // Pasting is the whole job, so a paste imports straight away.
    text.addEventListener('paste', () => setTimeout(() => text.value.trim() && importText(text.value)));
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) importText(await file.text());
    });

    return {
      element: box,
      async show(visible) {
        box.hidden = !visible;
        if (visible) box.open = !(await showLastImport()) || box.open;
      },
    };
  }

  async function start() {
    const root = document.getElementById('item-lists-root');
    if (!root) return;
    try {
      STYLES.forEach(loadStyle);
      for (const src of SCRIPTS) await loadScript(src); // in order: each builds on the ones before
      const view = ItemListView.create({
        messages: { noInventory: 'No inventory yet. Import it with the steps above.' },
      });
      const owned = () => view.querySelector('.aqwt-list-button[data-list="owned"]');
      // Shows the Owned list again with the new inventory (closing and reopening it).
      const importer = inventoryImport(() => {
        const button = owned();
        if (button?.getAttribute('aria-expanded') !== 'true') return;
        button.click();
        button.click();
      });
      // With the Owned list only: follows which list button is open.
      new MutationObserver(() => importer.show(owned()?.getAttribute('aria-expanded') === 'true')).observe(view, {
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-expanded'],
      });
      root.replaceChildren(listPicker(view), importer.element, view);
    } catch (err) {
      root.textContent = `Couldn't load the item lists: ${err.message}`;
    }
  }

  start();
})();
