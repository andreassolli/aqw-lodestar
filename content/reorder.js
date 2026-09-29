(function () {
  const STORAGE_PREFIX = 'moduleOrder:';
  const storageKey = STORAGE_PREFIX + location.pathname;

  const SWAP_THRESHOLD = 0.3;

  function keyOf(moduleEl) {
    const h2 = moduleEl.querySelector('h2');
    return h2 ? h2.textContent.trim() : null;
  }

  function getColumns() {
    return Array.from(document.querySelectorAll('main > div'));
  }

  function getModules(column) {
    return Array.from(column.querySelectorAll(':scope > .module')).filter(
      (m) => m.id !== 'framing-debug-module'
    );
  }

  // --- drag state ---
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

  function saveOrder() {
    const columns = getColumns();
    const order = columns.map((col) => getModules(col).map(keyOf).filter(Boolean));
    ext.storage.local.set({ [storageKey]: order });
  }

  function applySavedOrder(callback) {
    ext.storage.local.get([storageKey], (result) => {
      const order = result[storageKey];
      if (order && Array.isArray(order)) {
        const columns = getColumns();
        order.forEach((keys, i) => {
          const column = columns[i];
          if (!column) return;
          keys.forEach((key) => {
            const mod = getModules(column).find((m) => keyOf(m) === key);
            if (mod) column.appendChild(mod);
          });
        });
      }
      callback();
    });
  }

  function init() {
    const columns = getColumns();
    if (columns.length === 0) return;

    applySavedOrder(() => {
      columns.forEach((column) => {
        getModules(column).forEach((moduleEl) => addHandle(moduleEl));
      });
    });
  }

  const observer = new MutationObserver(() => {
    if (document.querySelectorAll('main .module').length > 0) {
      observer.disconnect();
      init();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  if (document.querySelectorAll('main .module').length > 0) {
    observer.disconnect();
    init();
  }
})();
