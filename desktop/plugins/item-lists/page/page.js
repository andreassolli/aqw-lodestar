// Lists tab: the same item lists as on the wiki. The app already ships the
// extension's content scripts, so we load them from there instead of copying.
(() => {
  // What item-list-view.js needs that the popup doesn't load already, in manifest order.
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
    '/shared/item-types.js',
    '/content/list-timing.js',
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

  // Another plugin might have loaded some of these already.
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
    // Before page.css so page.css can override them.
    const own = document.querySelector('link[href$="/plugins/item-lists/page/page.css"]');
    if (own) own.before(link);
    else document.head.append(link);
  }

  // Dropdown above the lists. Picking one shows just that list. If more are
  // ticked in the filter it says "Frostval + 2 more".
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
    // Only there while several lists are shown.
    const several = option('', '');
    several.hidden = true;
    select.append(option('', 'Choose a list…'), several, ...ListTiming.listGroups().map(([label, lists]) => group(label, lists)));

    function reflect(ids) {
      const first = ITEM_LISTS.find((list) => list.id === ids[0]);
      several.hidden = ids.length < 2;
      if (ids.length > 1) {
        several.textContent = `${first.label} + ${ids.length - 1} more`;
        select.value = '';
        several.selected = true;
      } else {
        select.value = ids[0] || '';
      }
      select.style.setProperty('--list-color', first?.color || 'var(--line)');
    }

    select.addEventListener('change', () => view.lists.select(select.value ? [select.value] : []));
    view.addEventListener('aqwt-lists-change', (e) => reflect(e.detail.ids));
    return select;
  }

  const LOGIN_URL = 'https://account.aq.com/';

  function formatWhen(ms) {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // The app has no Sync button like the extension, so the inventory gets pasted
  // in from the same address instead. Open until something is imported.
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
    // Pasting is all you do, so import right away.
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
      for (const src of SCRIPTS) await loadScript(src); // in order, each needs the ones before
      const view = ItemListView.create({
        messages: {
          noInventory: 'No inventory yet. Import it with the steps above.',
          needsInventory: 'Import your inventory first (choose Owned items).',
        },
      });
      const importer = inventoryImport(() => view.lists.refresh());
      view.addEventListener('aqwt-lists-change', (e) => importer.show(e.detail.ids.includes('owned')));
      const pickerRow = document.createElement('div');
      pickerRow.className = 'item-lists-picker';
      pickerRow.append(listPicker(view));
      root.replaceChildren(pickerRow, importer.element, view);
    } catch (err) {
      root.textContent = `Couldn't load the item lists: ${err.message}`;
    }
  }

  start();
})();
