
const AttackPatterns = (() => {
  const STORAGE_KEY = 'attackPatterns';
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const PATTERNS_URL = '/plugins/ultra-assistant/patterns/';

  const content = document.getElementById('attack-pattern-content');
  const selector = document.getElementById('attack-pattern-select');
  const settings = document.getElementById('attack-column-settings');

  const toolbar = document.getElementById('attack-toolbar');
  const modeToggle = document.getElementById('attack-mode-toggle');
  const saveEntryButton = document.getElementById('save-attack-entry');
  const addEntryButton = document.getElementById('add-attack-entry');
  const addColumnButton = document.getElementById('add-attack-column');
  const entryForm = document.getElementById('attack-entry-form');
  const entryText = document.getElementById('attack-entry-text');
  const entryType = document.getElementById('attack-entry-type');
  const entryColumn = document.getElementById('attack-entry-column');
  const entrySpan = document.getElementById('attack-entry-span');
  const entryRow = document.getElementById('attack-entry-row');

  const addBossButton = document.getElementById('add-attack-boss');
  const downloadBossButton = document.getElementById('download-attack-boss');
  const importBossButton = document.getElementById('import-attack-boss');
  const bossFileInput = document.getElementById('attack-boss-file');
  const bossForm = document.getElementById('attack-boss-form');
  const bossNameInput = document.getElementById('attack-boss-name');


  let patterns = {};
  let editing = false;
  let editingEntry = null;

  function readMode() {
    try {
      return localStorage.getItem('attackPatternsEditing') === '1';
    } catch {
      return false;
    }
  }

  function setMode(on) {
    editing = on;
    try {
      localStorage.setItem('attackPatternsEditing', on ? '1' : '0');
    } catch {
      // storage blocked, just don't remember
    }

    modeToggle.textContent = on ? 'Done' : 'Edit';
    modeToggle.setAttribute('aria-pressed', String(on));
    toolbar.hidden = !on;
    settings.hidden = !on;
    content.classList.toggle('view-mode', !on);
    if (!on) {
      entryForm.hidden = true;
      bossForm.hidden = true;
    }
  }

  function currentPattern() {
    return patterns[selector.value];
  }

  function createId() {
    return `column-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async function save() {
    await window.browser.storage.local.set({
      [STORAGE_KEY]: patterns
    });
  }

  const DEFAULT_TYPES = [
    { id: 'normal', name: 'Normal', color: '' },
    { id: 'truth', name: 'Truth', color: '#c026d3' },
    { id: 'listen', name: 'Listen', color: '#0284c7' },
    { id: 'zone', name: 'Zone / Equal', color: '#b91c1c' }
  ];

  // Older saves had the four fixed types and a typeColors map. Types are a
  // list on each boss now, so you can add your own (LR, AP, LOO...).
  function ensureTypes(pattern) {
    if (!Array.isArray(pattern.types)) {
      pattern.types = DEFAULT_TYPES.map(type => ({
        ...type,
        color: pattern.typeColors?.[type.id] || type.color
      }));
      delete pattern.typeColors;
    }

    if (!pattern.types.some(type => type.id === 'normal')) {
      pattern.types.unshift({ ...DEFAULT_TYPES[0] });
    }

    for (const entry of pattern.entries) {
      if (!pattern.types.some(type => type.id === entry.type)) {
        pattern.types.push({ id: entry.type, name: entry.type, color: '' });
      }
    }
  }

  function normalizeHex(value) {
    let hex = value.trim().toLowerCase();
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-f]{3}$/.test(hex)) {
      hex = `#${[...hex.slice(1)].map(c => c + c).join('')}`;
    }
    return HEX_COLOR.test(hex) ? hex : null;
  }

  // Black or white text, whichever reads better on the background.
  function textFor(hex) {
    const [r, g, b] = [1, 3, 5].map(i => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.38 ? '#000' : '#fff';
  }

  function typeColor(pattern, id) {
    const color = pattern.types?.find(type => type.id === id)?.color;
    return HEX_COLOR.test(color || '') ? color : '';
  }

  // Color picker plus a hex box you can copy from or paste into.
  function colorField(value, label, onCommit) {
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = HEX_COLOR.test(value) ? value : '#3a3a3a';
    picker.setAttribute('aria-label', label);

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'hex-input';
    hex.value = HEX_COLOR.test(value) ? value.toLowerCase() : '';
    hex.placeholder = '#rrggbb';
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.setAttribute('aria-label', `${label} hex code`);

    picker.addEventListener('input', () => {
      hex.value = picker.value;
    });

    picker.addEventListener('change', () => onCommit(picker.value));

    hex.addEventListener('change', () => {
      if (!hex.value.trim()) {
        picker.value = '#3a3a3a';
        onCommit('');
        return;
      }

      const color = normalizeHex(hex.value);
      if (!color) {
        hex.value = HEX_COLOR.test(value) ? value.toLowerCase() : '';
        return;
      }
      hex.value = color;
      picker.value = color;
      onCommit(color);
    });

    return [picker, hex];
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function createEntry(pattern, entry, index) {
    const item = makeElement('div', 'attack');
    item.appendChild(makeElement('span', 'attack-text', entry.text));

    const background = HEX_COLOR.test(entry.color || '')
      ? entry.color
      : typeColor(pattern, entry.type);

    if (background) {
      item.style.setProperty('--entry-color', background);
      item.style.setProperty('--entry-text', textFor(background));
      item.classList.add('custom-color');
    }

    const actions = makeElement('span', 'attack-actions');

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'attack-color';
    color.value = HEX_COLOR.test(background || '') ? background : '#3a3a3a';
    color.title = entry.color ? `Entry color ${entry.color}` : 'Entry color';
    color.setAttribute('aria-label', `Color for ${entry.text}`);

    color.addEventListener('input', () => {
      item.style.setProperty('--entry-color', color.value);
      item.style.setProperty('--entry-text', textFor(color.value));
      item.classList.add('custom-color');
    });

    color.addEventListener('change', async () => {
      entry.color = color.value;
      await save();
      render();
    });

    const edit = makeElement('button', 'attack-edit', '✎');
    edit.type = 'button';
    edit.title = 'Edit entry';
    edit.setAttribute('aria-label', `Edit ${entry.text}`);
    edit.addEventListener('click', () => openEntryForm(entry));

    actions.append(edit, color);

    if (entry.color) {
      const reset = makeElement('button', 'attack-reset-color', '↺');
      reset.type = 'button';
      reset.title = 'Reset color';
      reset.setAttribute('aria-label', `Reset color for ${entry.text}`);

      reset.addEventListener('click', async () => {
        delete entry.color;
        await save();
        render();
      });

      actions.appendChild(reset);
    }

    const remove = makeElement('button', 'attack-remove', '×');
    remove.type = 'button';
    remove.title = 'Remove entry';
    remove.setAttribute('aria-label', `Remove ${entry.text}`);

    remove.addEventListener('click', async () => {
      const pattern = currentPattern();
      pattern.entries.splice(index, 1);
      await save();
      render();
    });

    actions.appendChild(remove);
    item.appendChild(actions);
    return item;
  }

  function renderTable(pattern) {
    const table = makeElement('div', 'attack-table');

    table.style.setProperty('--column-count', pattern.columns.length);
    table.style.setProperty(
      '--row-count',
      Math.max(1, ...pattern.entries.map(entry => entry.row || 1)) + 1
    );

    // Each column header occupies the first grid row.
    pattern.columns.forEach((column, index) => {
      const header = makeElement('div', 'attack-column-header');
      header.textContent = column.name;
      header.style.setProperty('--column-color', column.color);
      if (HEX_COLOR.test(column.color || '')) header.style.color = textFor(column.color);
      header.style.gridColumn = String(index + 1);
      header.style.gridRow = '1';

      table.appendChild(header);
    });

    // Every entry is placed in a shared grid row.
    pattern.entries.forEach((entry, index) => {
      const columnIndex = pattern.columns.findIndex(
        column => column.id === entry.column
      );

      if (columnIndex === -1) return;

      const item = createEntry(pattern, entry, index);
      item.style.gridColumn = entry.span === true
        ? '1 / -1'
        : entry.span > 1
          ? `${columnIndex + 1} / span ${entry.span}`
          : String(columnIndex + 1);
      item.style.gridRow = String((entry.row || 1) + 1);

      table.appendChild(item);
    });

    return table;
  }

  function renderSettings(pattern) {
    settings.replaceChildren();

    if (!pattern) return;

    const typeHeading = makeElement('h3', '', 'Type colors');
    settings.appendChild(typeHeading);

    pattern.types.forEach((type, index) => {
      const row = makeElement('div', 'attack-column-setting');

      const name = document.createElement('input');
      name.type = 'text';
      name.value = type.name;
      name.placeholder = 'Type name';
      name.setAttribute('aria-label', `Type ${index + 1} name`);
      name.addEventListener('change', async () => {
        type.name = name.value.trim() || type.name;
        await save();
        render();
      });

      const nodes = colorField(
        type.color,
        `${type.name} entries color`,
        async color => {
          type.color = color;
          await save();
          render();
        }
      );

      const remove = makeElement('button', 'attack-remove-column', 'Remove');
      remove.type = 'button';
      remove.disabled = type.id === 'normal';
      remove.addEventListener('click', async () => {
        pattern.entries.forEach(entry => {
          if (entry.type === type.id) entry.type = 'normal';
        });
        pattern.types.splice(index, 1);
        await save();
        render();
      });

      row.append(name, ...nodes, remove);
      settings.appendChild(row);
    });

    const addType = makeElement('button', 'attack-add-type', '+ Add type');
    addType.type = 'button';
    addType.addEventListener('click', async () => {
      pattern.types.push({ id: createId(), name: 'New type', color: '#5588c6' });
      await save();
      render();
      const inputs = settings.querySelectorAll('.attack-column-setting input[type="text"]');
      const added = inputs[pattern.types.length - 1];
      added?.focus();
      added?.select();
    });
    settings.appendChild(addType);

    settings.appendChild(makeElement('h3', '', 'Column settings'));

    pattern.columns.forEach((column, index) => {
      const row = makeElement('div', 'attack-column-setting');

      const name = document.createElement('input');
      name.type = 'text';
      name.value = column.name;
      name.setAttribute('aria-label', `Column ${index + 1} name`);
      name.placeholder = 'Column name';

      name.addEventListener('change', async () => {
        column.name = name.value.trim() || `Column ${index + 1}`;
        await save();
        render();
      });

      const colorNodes = colorField(
        column.color,
        `${column.name} background color`,
        async color => {
          column.color = color || column.color;
          await save();
          render();
        }
      );

      row.style.setProperty('--column-color', column.color);

      const remove = makeElement('button', 'attack-remove-column', 'Remove');
      remove.type = 'button';
      remove.disabled = pattern.columns.length <= 1;
      remove.addEventListener('click', async () => {
        if (pattern.columns.length <= 1) return;

        const fallback = pattern.columns.find(item => item.id !== column.id);

        pattern.entries.forEach(entry => {
          if (entry.column === column.id) {
            entry.column = fallback.id;
          }
        });

        pattern.columns.splice(index, 1);
        await save();
        render();
      });

      row.append(name, ...colorNodes, remove);
      settings.appendChild(row);
    });
  }

  function updateEntryColumnOptions() {
    const pattern = currentPattern();
    entryColumn.replaceChildren();
    entryType.replaceChildren();

    if (!pattern) return;

    pattern.types.forEach(type => {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.name;
      entryType.appendChild(option);
    });

    pattern.columns.forEach(column => {
      const option = document.createElement('option');
      option.value = column.id;
      option.textContent = column.name;
      entryColumn.appendChild(option);
    });
  }

  function render() {
    const pattern = currentPattern();

    content.replaceChildren();

    if (!pattern) {
      settings.replaceChildren();
      return;
    }

    content.appendChild(renderTable(pattern));
    renderSettings(pattern);
    updateEntryColumnOptions();
  }

  function openEntryForm(entry = null) {
    const pattern = currentPattern();
    editingEntry = entry;
    updateEntryColumnOptions();

    if (entry) {
      entryText.value = entry.text;
      entryType.value = entry.type || 'normal';
      entryColumn.value = entry.column;
      entryRow.value = String(entry.row || 1);
      entrySpan.checked = Boolean(entry.span);
    } else {
      entryText.value = '';
      entryType.value = 'normal';
      entrySpan.checked = false;
      entryRow.value = String(
        Math.max(0, ...pattern.entries.map(item => item.row || 1)) + 1
      );
    }

    saveEntryButton.textContent = entry ? 'Save changes' : 'Add entry';
    entryForm.hidden = false;
    entryForm.scrollIntoView({ block: 'nearest' });
    entryText.focus();
  }

  async function addEntry() {
    const pattern = currentPattern();
    const text = entryText.value.trim();

    if (!pattern || !text || !pattern.columns.length) {
      entryText.focus();
      return;
    }

    const row = Number.parseInt(entryRow.value, 10);

    if (!Number.isInteger(row) || row < 1) {
      entryRow.focus();
      return;
    }

    if (editingEntry) {
      const hadSpan = Boolean(editingEntry.span);
      Object.assign(editingEntry, {
        text,
        type: entryType.value,
        column: entryColumn.value,
        row
      });
      // A span of a few columns stays as it is unless the box changed.
      if (entrySpan.checked !== hadSpan) {
        if (entrySpan.checked) editingEntry.span = true;
        else delete editingEntry.span;
      }
    } else {
      pattern.entries.push({
        text,
        type: entryType.value,
        column: entryColumn.value,
        row,
        ...(entrySpan.checked && { span: true })
      });
    }

    editingEntry = null;

    await save();
    entryForm.hidden = true;
    render();
  }

  async function addColumn() {
    const pattern = currentPattern();
    if (!pattern) return;

    const columnNumber = pattern.columns.length + 1;

    pattern.columns.push({
      id: createId(),
      name: `Column ${columnNumber}`,
      color: '#345a86'
    });

    await save();
    render();

    // Focus the name input for the newly created column.
    const nameInputs = settings.querySelectorAll(
      '.attack-column-setting input[type="text"]'
    );

    const newNameInput = nameInputs[nameInputs.length - 1];

    if (newNameInput) {
      newNameInput.focus();
      newNameInput.select();
    }
  }


  function createBossKey(name) {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'boss';

    let key = base;
    let number = 2;

    while (patterns[key]) {
      key = `${base}-${number++}`;
    }

    return key;
  }

  function refreshBossOptions(selectedKey = selector.value) {
    selector.replaceChildren();

    for (const [key, pattern] of Object.entries(patterns)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = pattern.name;
      selector.appendChild(option);
    }

    if (patterns[selectedKey]) {
      selector.value = selectedKey;
    } else {
      selector.selectedIndex = 0;
    }
  }

  function openBossForm() {
    bossNameInput.value = '';
    bossForm.hidden = false;
    bossNameInput.focus();
  }

  async function createBoss() {
    const name = bossNameInput.value.trim();

    if (!name) {
      bossNameInput.focus();
      return;
    }

    const key = createBossKey(name);

    patterns[key] = {
      name,
      columns: [
        { id: createId(), name: 'Intro', color: '#734490' },
        { id: createId(), name: 'Loop', color: '#345a86' }
      ],
      types: structuredClone(DEFAULT_TYPES),
      entries: []
    };

    await save();

    bossForm.hidden = true;
    refreshBossOptions(key);
    render();
  }

  function downloadBoss() {
    const key = selector.value;
    const pattern = patterns[key];

    if (!pattern) return;

    const json = JSON.stringify(
      {
        id: key,
        ...structuredClone(pattern)
      },
      null,
      2
    );

    const blob = new Blob([json], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${key}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  function validateImportedBoss(data) {
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      !Array.isArray(data.columns) ||
      !Array.isArray(data.entries)
    ) {
      throw new Error(
        'Invalid boss JSON. Expected a name, columns array, and entries array.'
      );
    }

    if (data.columns.length === 0) {
      throw new Error('The boss must have at least one column.');
    }

    const columnIds = new Set();

    const columns = data.columns.map((column) => {
      if (
        !column ||
        typeof column.name !== 'string' ||
        typeof column.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(column.color)
      ) {
        throw new Error('One or more columns are invalid.');
      }

      const id = createId();
      columnIds.add(id);

      return {
        id,
        name: column.name,
        color: column.color
      };
    });

    const types = Array.isArray(data.types)
      ? data.types.map((type) => {
        if (!type || typeof type.id !== 'string' || typeof type.name !== 'string') {
          throw new Error('One or more types are invalid.');
        }
        return {
          id: type.id,
          name: type.name,
          color: HEX_COLOR.test(type.color || '') ? type.color : ''
        };
      })
      : DEFAULT_TYPES.map(type => ({
        ...type,
        color: data.typeColors?.[type.id] || type.color
      }));

    if (!types.some(type => type.id === 'normal')) types.unshift({ ...DEFAULT_TYPES[0] });

    const entries = data.entries.map((entry) => {
      if (
        !entry ||
        typeof entry.text !== 'string' ||
        !types.some(type => type.id === entry.type) ||
        !Number.isInteger(entry.row ?? 1) ||
        (entry.row ?? 1) < 1
      ) {
        throw new Error('One or more entries are invalid.');
      }

      const originalColumnIndex = data.columns.findIndex(
        (column) => column.id === entry.column
      );

      if (originalColumnIndex < 0) {
        throw new Error('An entry refers to a column that does not exist.');
      }

      const imported = {
        text: entry.text,
        type: entry.type,
        column: columns[originalColumnIndex].id,
        row: entry.row ?? 1
      };

      if (HEX_COLOR.test(entry.color || '')) imported.color = entry.color;
      if (entry.span === true || (Number.isInteger(entry.span) && entry.span > 1)) {
        imported.span = entry.span;
      }

      return imported;
    });

    return {
      name: data.name.trim(),
      columns,
      types,
      entries
    };
  }

  async function importBossFile(file) {
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const boss = validateImportedBoss(data);
      const key = createBossKey(boss.name);

      patterns[key] = boss;

      await save();

      refreshBossOptions(key);
      render();
    } catch (error) {
      console.error('Failed to import boss:', error);
      alert(`Could not import boss: ${error.message}`);
    } finally {
      bossFileInput.value = '';
    }
  }


  // Every .json in the plugin's patterns/ folder is a boss. Ones you already
  // have saved keep your edits, so a file only adds bosses that are missing.
  async function loadFolderPatterns() {
    let names = [];
    try {
      names = await (await fetch(PATTERNS_URL)).json();
    } catch (error) {
      console.error('Could not list the patterns folder:', error);
      return {};
    }

    const loaded = {};

    for (const name of names) {
      try {
        const data = await (await fetch(PATTERNS_URL + encodeURIComponent(name))).json();
        const key = typeof data.id === 'string' && data.id
          ? data.id
          : name.replace(/\.json$/i, '');
        loaded[key] = validateImportedBoss(data);
      } catch (error) {
        console.error(`Skipping ${name}:`, error);
      }
    }

    return loaded;
  }

  async function deleteBoss() {
    const key = selector.value;
    const pattern = patterns[key];

    if (!pattern || !confirm(`Delete "${pattern.name}"?`)) return;

    delete patterns[key];
    await save();
    refreshBossOptions();
    render();
  }

  async function init() {
    if (!content || !selector) return;

    // Restore saved patterns, or use defaults on first launch.
    const stored = await window.browser.storage.local.get(STORAGE_KEY);

    patterns = stored[STORAGE_KEY] || {};

    for (const [key, boss] of Object.entries(await loadFolderPatterns())) {
      if (!patterns[key]) patterns[key] = boss;
    }

    if (stored[STORAGE_KEY]) {

      for (const pattern of Object.values(patterns)) {
        ensureTypes(pattern);
        const rowCounts = {};

        for (const entry of pattern.entries) {
          if (!entry.row) {
            rowCounts[entry.column] = (rowCounts[entry.column] || 0) + 1;
            entry.row = rowCounts[entry.column];
          }
        }
      }

      await save();
    } else {
      await save();
    }

    addBossButton.addEventListener('click', openBossForm);
    downloadBossButton.addEventListener('click', downloadBoss);
    document.getElementById('delete-attack-boss')
      .addEventListener('click', deleteBoss);

    importBossButton.addEventListener('click', () => {
      bossFileInput.click();
    });

    bossFileInput.addEventListener('change', () => {
      importBossFile(bossFileInput.files[0]);
    });

    document.getElementById('save-attack-boss')
      .addEventListener('click', createBoss);

    document.getElementById('cancel-attack-boss')
      .addEventListener('click', () => {
        bossForm.hidden = true;
      });

    bossNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') createBoss();
      if (event.key === 'Escape') bossForm.hidden = true;
    });


    selector.addEventListener('change', () => {
      editingEntry = null;
      entryForm.hidden = true;
      render();
    });

    addEntryButton.addEventListener('click', () => openEntryForm());
    modeToggle.addEventListener('click', () => setMode(!editing));
    addColumnButton.addEventListener('click', addColumn);

    saveEntryButton.addEventListener('click', addEntry);

    document.getElementById('cancel-attack-entry')
      .addEventListener('click', () => {
        editingEntry = null;
        entryForm.hidden = true;
      });

    entryText.addEventListener('keydown', event => {
      if (event.key === 'Enter') addEntry();
    });

    refreshBossOptions();
    setMode(readMode());
    render();
  }

  return { init, render };
})();

AttackPatterns.init().catch(error => {
  console.error('Failed to initialize attack patterns:', error);
});
