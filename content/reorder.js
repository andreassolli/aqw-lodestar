// aqcloset.com: drag handles on the wardrobe panels so you can reorder them.
// Saved per page.
Features.run('aqclosetReorder', () => {
  const STORAGE_PREFIX = 'moduleOrder:';
  const storageKey = STORAGE_PREFIX + location.pathname;

  const SWAP_THRESHOLD = 0.3;

  // How a panel is saved: its title, or its id/class if it has no title.
  function keyOf(moduleEl) {
    const h2 = moduleEl.querySelector('h2');
    if (h2) {
      const clone = h2.cloneNode(true);
      clone.querySelectorAll('.mr-handle').forEach((el) => el.remove());
      const title = clone.textContent.trim();
      if (title) return title;
    }
    if (moduleEl.id) return `#${moduleEl.id}`;
    const ownClass = [...moduleEl.classList].find((cls) => cls !== 'module' && !cls.startsWith('mr-'));
    return ownClass ? `.${ownClass}` : null;
  }

  function getColumns() {
    return Array.from(document.querySelectorAll('main > div'));
  }

  function getModules(column) {
    return Array.from(column.querySelectorAll(':scope > .module')).filter(
      (m) => m.id !== 'framing-debug-module'
    );
  }

  let draggingModule = null;
  let placeholder = null;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let moduleWidth = 0;
  let moduleHeight = 0;

  function onHandleMouseDown(e, moduleEl) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = moduleEl.getBoundingClientRect();
    pointerOffsetX = e.clientX - rect.left;
    pointerOffsetY = e.clientY - rect.top;
    moduleWidth = rect.width;
    moduleHeight = rect.height;

    placeholder = document.createElement('div');
    placeholder.className = 'mr-placeholder';
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';
    moduleEl.parentElement.insertBefore(placeholder, moduleEl);

    moduleEl.classList.add('mr-dragging');
    moduleEl.style.width = rect.width + 'px';
    moduleEl.style.height = rect.height + 'px';
    moduleEl.style.left = rect.left + 'px';
    moduleEl.style.top = rect.top + 'px';
    document.body.appendChild(moduleEl);

    draggingModule = moduleEl;
    document.body.classList.add('mr-drag-active');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!draggingModule) return;

    const newLeft = e.clientX - pointerOffsetX;
    const newTop = e.clientY - pointerOffsetY;
    draggingModule.style.left = newLeft + 'px';
    draggingModule.style.top = newTop + 'px';

    updatePlaceholder(e.clientX, e.clientY);
  }

  function updatePlaceholder(pointerX, pointerY) {
    const columns = getColumns();
    let targetColumn = null;
    let bestColDist = Infinity;
    columns.forEach((col) => {
      const r = col.getBoundingClientRect();
      let dist;
      if (pointerX >= r.left && pointerX <= r.right) dist = 0;
      else if (pointerX < r.left) dist = r.left - pointerX;
      else dist = pointerX - r.right;
      if (dist < bestColDist) {
        bestColDist = dist;
        targetColumn = col;
      }
    });
    if (!targetColumn) return;

    const modules = getModules(targetColumn);

    if (modules.length === 0) {
      if (placeholder.parentElement !== targetColumn) {
        targetColumn.appendChild(placeholder);
      }
      return;
    }

    let matchedModule = null;
    for (const m of modules) {
      const r = m.getBoundingClientRect();
      const bandHeight = r.height * SWAP_THRESHOLD;
      const bandTop = r.top + (r.height - bandHeight) / 2;
      const bandBottom = bandTop + bandHeight;
      if (pointerY >= bandTop && pointerY <= bandBottom) {
        matchedModule = m;
        break;
      }
    }

    if (matchedModule) {
      const r = matchedModule.getBoundingClientRect();
      if (pointerY < r.top + r.height / 2) {
        targetColumn.insertBefore(placeholder, matchedModule);
      } else {
        targetColumn.insertBefore(placeholder, matchedModule.nextSibling);
      }
      return;
    }

    const first = modules[0];
    const last = modules[modules.length - 1];
    if (pointerY < first.getBoundingClientRect().top) {
      targetColumn.insertBefore(placeholder, first);
    } else if (pointerY > last.getBoundingClientRect().bottom) {
      targetColumn.insertBefore(placeholder, last.nextSibling);
    }
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('mr-drag-active');

    const target = placeholder.getBoundingClientRect();
    draggingModule.classList.add('mr-settling');
    draggingModule.style.left = target.left + 'px';
    draggingModule.style.top = target.top + 'px';

    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      draggingModule.removeEventListener('transitionend', finalize);

      placeholder.parentElement.insertBefore(draggingModule, placeholder);
      placeholder.remove();

      draggingModule.classList.remove('mr-dragging', 'mr-settling');
      draggingModule.style.position = '';
      draggingModule.style.left = '';
      draggingModule.style.top = '';
      draggingModule.style.width = '';
      draggingModule.style.height = '';

      saveOrder();
      draggingModule = null;
      placeholder = null;
    };

    draggingModule.addEventListener('transitionend', finalize);
    setTimeout(finalize, 220);
  }

  function addHandle(moduleEl) {
    const h2 = moduleEl.querySelector('h2');
    if (!h2 || h2.querySelector('.mr-handle')) return;

    const handle = document.createElement('span');
    handle.className = 'mr-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    h2.prepend(handle);

    handle.addEventListener('mousedown', (e) => onHandleMouseDown(e, moduleEl));
  }

  // AQCloset re-renders after loading and puts the panels back, so we reapply
  // the saved order whenever they drift from it.

  const REAPPLY_DELAY_MS = 120;
  const MAX_REAPPLIES_PER_10S = 8; // stop if the page keeps undoing it

  let savedOrder = null;
  let reapplyTimer = null;
  let recentReapplies = [];

  // Older versions saved titles with the handle glyph in them.
  const cleanKey = (key) => String(key).replace('⠿', '').trim();

  function currentOrder() {
    return getColumns().map((col) => getModules(col).map(keyOf).filter(Boolean));
  }

  function saveOrder() {
    savedOrder = currentOrder();
    ext.storage.local.set({ [storageKey]: savedOrder });
    console.debug('AQW Lodestar: saved AQCloset layout', savedOrder);
  }

  function matchesSavedOrder() {
    const columns = currentOrder();
    const present = new Set(columns.flat());
    return savedOrder.every((keys, i) => {
      const wanted = (keys || []).map(cleanKey).filter((key) => present.has(key));
      const actual = (columns[i] || []).filter((key) => wanted.includes(key));
      return wanted.length === actual.length && wanted.every((key, j) => key === actual[j]);
    });
  }

  // Modules that aren't in the saved order stay where they are.
  function applySavedOrder() {
    const columns = getColumns();
    const byKey = new Map(columns.flatMap(getModules).map((m) => [keyOf(m), m]));
    savedOrder.forEach((keys, i) => {
      const column = columns[i];
      if (!column || !Array.isArray(keys)) return;
      for (const key of keys) {
        const mod = byKey.get(cleanKey(key));
        if (mod) column.appendChild(mod);
      }
    });
  }

  function addHandles() {
    getColumns().forEach((column) => getModules(column).forEach(addHandle));
  }

  function keepLayout() {
    if (draggingModule || getColumns().length === 0) return;

    if (Array.isArray(savedOrder) && !matchesSavedOrder()) {
      const now = Date.now();
      recentReapplies = recentReapplies.filter((t) => now - t < 10000);
      if (recentReapplies.length < MAX_REAPPLIES_PER_10S) {
        recentReapplies.push(now);
        applySavedOrder();
        console.debug('AQW Lodestar: restored AQCloset layout');
      } else if (recentReapplies.length === MAX_REAPPLIES_PER_10S) {
        recentReapplies.push(now);
        console.warn('AQW Lodestar: AQCloset keeps resetting the module order; stopped restoring for now.');
      }
    }
    addHandles();
  }

  function scheduleKeepLayout() {
    clearTimeout(reapplyTimer);
    reapplyTimer = setTimeout(keepLayout, REAPPLY_DELAY_MS);
  }

  (async () => {
    const stored = (await ext.storage.local.get(storageKey))[storageKey];
    savedOrder = Array.isArray(stored) ? stored : null;
    keepLayout();
    // Watch the whole body, AQCloset sometimes replaces <main>.
    new MutationObserver(scheduleKeepLayout).observe(document.body, { childList: true, subtree: true });
  })();
});
