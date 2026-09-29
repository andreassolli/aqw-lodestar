// account.aq.com: rarity badges on item links, and a "try on" button that
// opens the character's outfit in the AQCloset wardrobe.
(() => {
  let wikiIndexPromise = null;

  /** merged_wiki.json indexed by item name and by wiki path. */
  function loadWikiIndex() {
    if (!wikiIndexPromise) {
      wikiIndexPromise = fetch(ext.runtime.getURL('merged_wiki.json'))
        .then((res) => res.json())
        .then((items) => {
          const byName = new Map();
          const byPath = new Map();
          for (const item of items) {
            if (item.name) byName.set(item.name, item);
            if (item.href) byPath.set(item.href.toLowerCase(), item);
          }
          return { byName, byPath };
        });
    }
    return wikiIndexPromise;
  }

  function tagLink(link, index) {
    if (link.querySelector('.aqwt-rarity')) return;

    const href = link.getAttribute('href');
    const path = href && href.split('.com')[1];
    if (!path) return;

    const match = index.byName.get(getItemLinkLabel(link)) || index.byPath.get(path.toLowerCase());
    if (!match) return;

    const rarity = getRarity({ rarity: match.rarity, tags: match.tags });
    if (rarity) link.appendChild(createRarityBadge(rarity));
  }

  async function tagItemLinks() {
    const index = await loadWikiIndex();
    const tagWithin = (root) => root.querySelectorAll('a.item').forEach((link) => tagLink(link, index));

    tagWithin(document);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('a.item')) tagLink(node, index);
          tagWithin(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  const SHIRT_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
    </svg>`;

  function addTryOnButton() {
    if (document.getElementById('aqwt-custom-action-btn')) return;
    const column = document.querySelector('.col-3.col-md-4.col-lg-4');
    if (!column || !document.querySelector('input.btn.btn-primary[type="submit"][value="Search"]')) return;

    const button = document.createElement('button');
    button.type = 'button'; // don't submit the search form
    button.id = 'aqwt-custom-action-btn';
    button.className = 'btn btn-secondary';
    button.title = 'Open outfit in AQCloset';
    button.insertAdjacentHTML('beforeend', SHIRT_ICON);

    button.addEventListener('click', () => {
      const username = document.querySelector('input.form-control[name="id"]')?.value.trim() || '';
      ext.runtime.sendMessage({ type: 'OPEN_WARDROBE', username }).catch(() => {});
    });

    column.appendChild(button);
  }

  addTryOnButton();
  tagItemLinks().catch((err) => console.error('Could not load item rarities:', err));
})();
