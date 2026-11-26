// Remembers the right-clicked link so the context menu can use its text.
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

  // AQCloset's item cards link to its wardrobe, not the wiki, so the name comes
  // from the card.
  function aqclosetCardName(linkUrl) {
    if (wikiPathOf(linkUrl) !== null || !lastContextLink || lastContextLink.href !== linkUrl) return null;
    return lastContextLink.matches('.object') && lastContextLink.querySelector('.label .name') ? getItemLinkLabel(lastContextLink) : null;
  }

  // The wiki page a menu click is about. AQCloset links that aren't item cards
  // (looks, sets) have none.
  function pageFor(linkUrl, cardName) {
    if (cardName) return wikiUrlFromName(cardName);
    return wikiPathOf(linkUrl) === null ? null : linkUrl;
  }

  async function saveToFarm(pageUrl, name) {
    try {
      if (await FarmEntry.contains(pageUrl)) {
        showToast('Already in Items to farm');
        return;
      }
      const entry = await FarmEntry.build(pageUrl, name);
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
    const cardName = aqclosetCardName(message.linkUrl);
    const pageUrl = pageFor(message.linkUrl, cardName);
    if (message.type === 'SAVE_TO_FARM' && pageUrl) saveToFarm(pageUrl, cardName || labelFor(message.linkUrl));
    if (message.type === 'GET_LINK_TEXT') sendResponse({ text: pageUrl ? cardName || labelFor(message.linkUrl) : null });
  });
})();
