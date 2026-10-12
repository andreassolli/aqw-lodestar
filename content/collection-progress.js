// Wiki collection lists (e.g. "List of All Collection Chests"): a counter of
// how many listed items you own, and owned items shown in green. Checks the
// saved inventory directly, matching names the same way as the checkmarks.
(() => {
  // Wiki pages that get the counter, with what to call their items.
  const PAGES = {
    '/list-of-all-collection-chests': 'collection chests',
  };

  const noun = PAGES[location.pathname.toLowerCase().replace(/\/$/, '')];
  if (!noun) return;

  const LIST_LINKS = '#page-content .list-pages-box a[href]:not(.pager a)';
  let owned = new Map();

  document.body.classList.add('aqwt-collection-page');

  const counter = document.createElement('div');
  counter.className = 'aqwt-collection-counter';
  counter.innerHTML = `
    <div class="aqwt-collection-counter-text" role="status"></div>
    <div class="aqwt-collection-counter-bar"><span></span></div>`;
  const content = document.querySelector('#page-content');
  content?.prepend(counter);

  const text = counter.querySelector('.aqwt-collection-counter-text');
  const fill = counter.querySelector('.aqwt-collection-counter-bar span');

  function update() {
    const links = [...document.querySelectorAll(LIST_LINKS)];
    const total = new Set(links.map((a) => a.getAttribute('href'))).size;
    const ownedPaths = new Set();
    for (const link of links) {
      const isOwned = owned.has(normalizeItemName(getItemLinkLabel(link)));
      link.classList.toggle('aqwt-owned-item', isOwned);
      if (isOwned) ownedPaths.add(link.getAttribute('href'));
    }

    if (!owned.size) {
      text.textContent = `Visit your Inventory page on account.aq.com to see which ${noun} you own.`;
      fill.style.width = '0%';
      return;
    }
    const percent = total ? Math.round((ownedPaths.size / total) * 100) : 0;
    text.innerHTML = `You own <strong>${ownedPaths.size}</strong> of <strong>${total}</strong> ${noun} (${percent}%)`;
    fill.style.width = `${percent}%`;
  }

  watchOwnedItems((ownedMap) => {
    owned = ownedMap;
    update();
  });
})();
