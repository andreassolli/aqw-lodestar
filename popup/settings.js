// Settings view, opened with the gear button: tooltip position and data backup.
const Settings = (() => {
  let els;

  function showSettings(open) {
    els.main.hidden = open;
    els.view.hidden = !open;
    els.toggle.setAttribute('aria-expanded', String(open));
    els.toggle.classList.toggle('is-active', open);
    if (open) els.back.focus();
  }

  function setStatus(message, isError = false) {
    els.status.hidden = !message;
    els.status.textContent = message || '';
    els.status.classList.toggle('is-error', isError);
  }

  const AQCLOSET_PROFILE = 'https://aqcloset.com/profile';

  function setAqclosetStatus(message, isError = false) {
    const status = document.getElementById('aqcloset-status');
    status.hidden = !message;
    status.textContent = message || '';
    status.classList.toggle('is-error', isError);
  }

  /** Fills the import field on an open AQCloset profile tab, or opens one that fills itself. */
  async function fillAqclosetImport() {
    const inventory = (await ext.storage.local.get(STORAGE_KEYS.inventory))[STORAGE_KEYS.inventory];
    if (!Array.isArray(inventory) || !inventory.length) {
      setAqclosetStatus('No synced inventory yet. Use the Sync button on your account.aq.com Inventory page first.', true);
      return;
    }

    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (tab && /^https?:\/\/(www\.)?aqcloset\.com\/profile\/?(?:[?#]|$)/.test(tab.url || '')) {
      setAqclosetStatus('Filling in…');
      const result = await ext.tabs.sendMessage(tab.id, { type: 'FILL_AQCLOSET_INVENTORY' }).catch(() => null);
      if (result && result.ok) {
        setAqclosetStatus(`Filled in ${result.count.toLocaleString()} items. Press Import on the page.`);
        return;
      }
      if (result && result.error) {
        setAqclosetStatus(`Couldn't fill it in: ${result.error}.`, true);
        return;
      }
      // No answer: the page was open before the extension loaded, so open a fresh one.
    }
    ext.tabs.create({ url: `${AQCLOSET_PROFILE}#lodestar-import` });
  }

  function initTooltipPlacement() {
    const radios = [...document.querySelectorAll('input[name="tooltip-placement"]')];
    ext.storage.local.get(STORAGE_KEYS.tooltipPlacement).then((result) => {
      const value = result[STORAGE_KEYS.tooltipPlacement] || 'side';
      radios.forEach((radio) => {
        radio.checked = radio.value === value;
      });
    });
    radios.forEach((radio) =>
      radio.addEventListener('change', () => {
        if (radio.checked) ext.storage.local.set({ [STORAGE_KEYS.tooltipPlacement]: radio.value });
      })
    );
  }

  function initImgurImages() {
    const radios = [...document.querySelectorAll('input[name="imgur-images"]')];
    ext.storage.local.get([STORAGE_KEYS.imgurImages, 'imgurProxy']).then((result) => {
      const value = result[STORAGE_KEYS.imgurImages] || (result.imgurProxy === true ? 'replace' : 'auto');
      radios.forEach((radio) => {
        radio.checked = radio.value === value;
      });
    });
    radios.forEach((radio) =>
      radio.addEventListener('change', () => {
        if (radio.checked) ext.storage.local.set({ [STORAGE_KEYS.imgurImages]: radio.value });
      })
    );
  }

  function init() {
    els = {
      main: document.getElementById('main-view'),
      view: document.getElementById('settings-view'),
      toggle: document.getElementById('settings-toggle'),
      back: document.getElementById('settings-back'),
      status: document.getElementById('settings-status'),
    };

    els.toggle.addEventListener('click', () => showSettings(els.view.hidden));
    els.back.addEventListener('click', () => {
      showSettings(false);
      els.toggle.focus();
    });

    initTooltipPlacement();
    initImgurImages();

    document.getElementById('export-data').addEventListener('click', () => {
      Backup.download()
        .then(() => setStatus('Backup downloaded.'))
        .catch((err) => setStatus(`Export failed: ${err.message}`, true));
    });

    document.getElementById('fill-aqcloset').addEventListener('click', () => {
      fillAqclosetImport().catch((err) => setAqclosetStatus(`Couldn't fill it in: ${err.message}`, true));
    });

    // Choosing a file closes the popup in some browsers, so importing happens
    // on the backup page, opened straight at the import step.
    document.getElementById('import-data').addEventListener('click', () => {
      ext.tabs.create({ url: ext.runtime.getURL('options/options.html#import') });
    });
  }

  return { init };
})();
