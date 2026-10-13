// "Add item from link" dialog: same result as the right-click menu, from a pasted URL.
const AddItemModal = (() => {
  let els;

  function isHttpUrl(value) {
    try {
      const { protocol } = new URL(value);
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  function setStatus(message, isError = false) {
    els.status.hidden = !message;
    els.status.textContent = message || '';
    els.status.classList.toggle('lip-modal-status-error', isError);
  }

  function setBusy(busy) {
    els.confirm.disabled = busy;
    els.cancel.disabled = busy;
  }

  function open() {
    els.input.value = '';
    setStatus('');
    els.overlay.classList.add('visible');
    els.input.focus();
  }

  function close() {
    els.overlay.classList.remove('visible');
  }

  async function confirm() {
    const url = els.input.value.trim();
    if (!isHttpUrl(url)) {
      setStatus('Paste a full link (starting with http:// or https://).', true);
      return;
    }

    setBusy(true);
    setStatus('Adding item...');
    try {
      if (await FarmEntry.contains(url)) {
        setStatus('That link is already on your farm list.', true);
        return;
      }
      const entry = await FarmEntry.build(url, null);
      if (!entry) throw new Error('Page could not be loaded');

      const { ok, items } = await FarmEntry.add(entry);
      if (!ok) {
        setStatus('That link is already on your farm list.', true);
        return;
      }
      FarmList.render(items);
      close();
    } catch (err) {
      console.log('Failed to add item from link:', err);
      setStatus('Could not read that link. Double check it and try again.', true);
    } finally {
      setBusy(false);
    }
  }

  function init() {
    els = {
      overlay: document.getElementById('add-item-modal'),
      input: document.getElementById('add-item-input'),
      confirm: document.getElementById('add-item-confirm'),
      cancel: document.getElementById('add-item-cancel'),
      status: document.getElementById('add-item-status'),
    };

    document.getElementById('add-item').addEventListener('click', open);
    els.cancel.addEventListener('click', close);
    els.confirm.addEventListener('click', confirm);
    els.overlay.addEventListener('click', (e) => {
      if (e.target === els.overlay) close(); // backdrop click
    });
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });
  }

  return { init };
})();
