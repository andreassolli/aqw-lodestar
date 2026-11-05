// Bonus Packs page: set titles link to the set's shop on the wiki. The wiki's
// bonus packages page has a tab per set with the shop link inside. Names don't
// always match ("Light & Glory" is /champion-of-celestial-light), but both sites
// use the same picture, so we go by that first.
(() => {
  if (!PAGE.isBonusPacks) return;

  const LIST_URL = `${WIKI_ORIGIN}/bonus-packages`;

  const imageFile = (img) => (img && img.getAttribute('src').trim().split('/').pop().toLowerCase()) || null;

  async function loadSets() {
    const page = await fetchPage(LIST_URL);
    const sets = { byImage: new Map(), byName: new Map() };
    if (!page || !page.html) return sets;

    const doc = new DOMParser().parseFromString(page.html, 'text/html');
    const names = doc.querySelectorAll('#page-content .yui-nav li');
    const panels = doc.querySelectorAll('#page-content .yui-content > div');
    names.forEach((name, i) => {
      const panel = panels[i];
      const link = panel && [...panel.querySelectorAll('a[href^="/"]')].find((a) => !a.getAttribute('href').includes(':'));
      if (!link) return;
      const path = link.getAttribute('href');
      const image = imageFile(panel.querySelector('img'));
      if (image) sets.byImage.set(image, path);
      sets.byName.set(name.textContent.trim().toLowerCase(), path);
    });
    return sets;
  }

  // New sets can be on here before the wiki's list has them, so try their pages too.
  async function guessPath(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    for (const path of [`/${slug}-shop`, `/${slug}`]) {
      const page = await fetchPage(WIKI_ORIGIN + path);
      const doc = page && page.html && new DOMParser().parseFromString(page.html, 'text/html');
      // Pages that don't exist yet land on the homepage, which has no title.
      if (doc && doc.querySelector('#page-title')) return path;
    }
    return null;
  }

  function linkTitle(title, path) {
    const link = document.createElement('a');
    link.className = 'aqwt-bonus-link';
    link.href = WIKI_ORIGIN + path;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.aqwtNoTooltip = '';
    link.append(...title.childNodes);
    title.append(link);
  }

  async function start() {
    const sets = await loadSets();
    for (const card of document.querySelectorAll('.bg-light')) {
      const title = card.querySelector(':scope > h4');
      if (!title) continue;
      const name = title.textContent.trim();
      const path =
        sets.byImage.get(imageFile(card.querySelector(':scope > a > img'))) ||
        sets.byName.get(name.toLowerCase()) ||
        (await guessPath(name));
      if (path) linkTitle(title, path);
    }
  }

  start();
})();
