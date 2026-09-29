// Right-click support: remembers which link was right-clicked so the
// background's context-menu items can use its text, and saves farm entries.
(() => {
  const TOAST_MS = 1200;
  const TOAST_OFFSET = 16;

  let lastContextLink = null;
  let lastClick = { x: 0, y: 0 };
  let toastTimer = null;

  const toast = document.createElement('div');
  toast.className = 'lip-toast';
  document.documentElement.appendChild(toast);

  function showToast(message) {
    toast.textContent = message;
    toast.style.left = `${lastClick.x + TOAST_OFFSET}px`;
    toast.style.top = `${lastClick.y - 28}px`;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, TOAST_MS);
  }

  function labelFor(linkUrl) {
    if (!lastContextLink || lastContextLink.href !== linkUrl) return null;
    return getItemLinkLabel(lastContextLink) || null;
  }

  async function saveToFarm(linkUrl) {
    try {
      if (await FarmEntry.contains(linkUrl)) {
        showToast('Already in Items to farm');
        return;
      }
      const entry = await FarmEntry.build(linkUrl, labelFor(linkUrl));
      if (!entry) {
        showToast('Could not read that page');
        return;
      }
      const { ok } = await FarmEntry.add(entry);
      showToast(ok ? 'Added to Items to farm' : 'Already in Items to farm');
    } catch (err) {
      console.error('Could not add item to farm list:', err);
      showToast('Could not add item');
    }
  }

  document.addEventListener(
    'contextmenu',
    (e) => {
      lastClick = { x: e.clientX, y: e.clientY };
      lastContextLink = e.target instanceof Element ? e.target.closest('a[href]') : null;
    },
    true
  );

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.linkUrl) return;
    if (message.type === 'SAVE_TO_FARM') saveToFarm(message.linkUrl);
    if (message.type === 'GET_LINK_TEXT') sendResponse({ text: labelFor(message.linkUrl) });
  });
})();
