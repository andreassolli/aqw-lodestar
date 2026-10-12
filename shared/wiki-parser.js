// Fetching and parsing aqwwiki.wikidot.com item pages.
// Used by the hover tooltip and by farm-list entries (content scripts + popup).

const WikiParser = (() => {
  const IMAGE_BLOCKLIST = ['/image-tags/', 'acsmall', 'aclarge', 'raresmall', 'legendsmall', 'membersmall', 'map', 'npc'];
  const NON_ITEM_CATEGORIES = ['Quests', 'Shops', 'Factions'];
  const ITEM_FIELD_MARKERS = ['Location:', 'Locations:', 'Price:', 'Base Stats:'];
  const MAX_PAGE_HOPS = 2; // original page + one disambiguation link

  function parseHtml(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return null;
    }
  }

  function isItemImage(src) {
    if (!src) return false;
    const lower = src.toLowerCase();
    return !IMAGE_BLOCKLIST.some((word) => lower.includes(word));
  }

  function getTitle(doc) {
    const title = doc.querySelector('#page-title');
    if (!title) return null;
    // On an open page the title also holds the extension's own badge and button.
    const clone = title.cloneNode(true);
    clone.querySelectorAll('.aqwt-owned, .aqwt-farm-button, .aqwt-try-on-button').forEach((el) => el.remove());
    return clone.textContent.trim();
  }

  function isNonItemCategory(doc) {
    return [...doc.querySelectorAll('#breadcrumbs a')].some((a) =>
      NON_ITEM_CATEGORIES.includes(a.textContent.trim())
    );
  }

  /** The wiki homepage, which Wikidot also shows for some page names it can't resolve. */
  function isStartPage(doc, baseUrl) {
    let path = '/';
    try {
      path = new URL(baseUrl).pathname.toLowerCase().replace(/\/+$/, '') || '/';
    } catch {}
    return path === '/' || path === '/start' || !!doc.querySelector('#u-welcome');
  }

  function isItemPage(doc) {
    const text = doc.querySelector('#page-content')?.textContent || '';
    return ITEM_FIELD_MARKERS.some((marker) => text.includes(marker));
  }

  /** Male/female tab images if present, otherwise the best single item image. */
  function findImages(doc, baseUrl) {
    const srcOf = (img) => resolveUrl(img.getAttribute('src'), baseUrl);

    const tabImages = ['#wiki-tab-0-0 img', '#wiki-tab-0-1 img']
      .map((selector) => doc.querySelector(selector))
      .filter((img) => img && isItemImage(srcOf(img)))
      .map(srcOf);
    if (tabImages.length) return tabImages;
    if (isNonItemCategory(doc)) return [];

    const candidates = [...doc.querySelectorAll('#page-content img')].filter((img) => isItemImage(srcOf(img)));
    const pick = candidates.find((img) => srcOf(img).toLowerCase().includes('imgur.com')) || candidates[0];
    return pick ? [srcOf(pick)] : [];
  }

  function findDisambiguationUrl(doc, baseUrl) {
    const link = [...doc.querySelectorAll('#page-content a[href]')].find((a) => {
      const href = a.getAttribute('href');
      const lower = href.toLowerCase();
      return href.startsWith('/') && !lower.includes(':') && !lower.includes('npc');
    });
    return link ? resolveUrl(link.getAttribute('href'), baseUrl) : null;
  }

  /**
   * Fetch a wiki page, following a disambiguation page to the real item if needed.
   * @returns {Promise<{doc: Document, baseUrl: string, images: string[]}|null>}
   */
  async function loadItemPage(url, hopsLeft = MAX_PAGE_HOPS) {
    const page = await fetchPage(url);
    if (!page || !page.html) return null;

    const doc = parseHtml(page.html);
    if (isStartPage(doc, page.baseUrl)) return null; // unknown page names land on the homepage
    const images = findImages(doc, page.baseUrl);

    const looksLikeDisambiguation = !images.length && !isItemPage(doc) && !isNonItemCategory(doc);
    const next = looksLikeDisambiguation ? findDisambiguationUrl(doc, page.baseUrl) : null;
    if (next) return hopsLeft > 1 ? loadItemPage(next, hopsLeft - 1) : null;

    return { doc, baseUrl: page.baseUrl, images };
  }

  function parseTags(doc) {
    const tagsDiv = doc.querySelector('.page-tags');
    if (!tagsDiv) return [];
    return [...tagsDiv.querySelectorAll('a')]
      .map((a) => a.textContent.trim())
      .filter((tag) => !tag.startsWith('_'));
  }

  /** Text after a "<strong>Label:</strong>" up to the next <br> or label. */
  function extractField(root, label) {
    if (!root) return null;
    const wanted = label.toLowerCase();
    const strong = [...root.querySelectorAll('strong')].find(
      (el) => el.textContent.trim().replace(/:$/, '').trim().toLowerCase() === wanted
    );
    if (!strong) return null;

    let text = '';
    for (let node = strong.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'BR' || node.tagName === 'STRONG')) break;
      text += node.textContent;
    }
    return text.trim() || null;
  }

  /**
   * Handles both "Location: <a>Map</a> - <a>Shop</a>" and a "Locations:" label
   * followed by a <ul> with one location per <li>.
   * @returns {{name: string, hrefs: string[]}[]}
   */
  function parseLocations(root) {
    if (!root) return [];

    const label = [...root.querySelectorAll('strong')].find((el) => /^\s*Locations?\s*:?\s*$/i.test(el.textContent));
    const paragraph = label && label.closest('p');
    if (!paragraph) return [];

    const toEntry = (links) => ({
      name: links.map((link) => link.textContent.trim()).join(' - '),
      hrefs: links.map((link) => link.getAttribute('href')),
    });

    const inlineLinks = [];
    for (let node = label.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.tagName === 'BR' || node.tagName === 'STRONG') break;
      if (node.tagName === 'A') inlineLinks.push(node);
    }
    if (inlineLinks.length) return [toEntry(inlineLinks)];

    let list = paragraph.nextElementSibling;
    while (list && list.tagName !== 'UL') list = list.nextElementSibling;
    if (!list) return [];

    return [...list.children]
      .filter((li) => li.tagName === 'LI')
      .map((li) => [...li.querySelectorAll('a')])
      .filter((links) => links.length)
      .map(toEntry);
  }

  /** First "...merge..." list item that has a nested list of ingredients. */
  function extractMergeList(doc) {
    for (const li of doc.querySelectorAll('li')) {
      const heading = getOwnText(li);
      if (!/merge/i.test(heading)) continue;

      const nested = li.querySelector(':scope > ul, :scope > ol');
      if (!nested) continue;

      const items = [...nested.querySelectorAll(':scope > li')]
        .map((item) => item.textContent.trim())
        .filter(Boolean);
      if (items.length) return { heading, items };
    }
    return null;
  }

  /** The same result as loadItemPage, for a page that's already open (no request). */
  function fromDocument(doc, baseUrl) {
    return { doc, baseUrl, images: findImages(doc, baseUrl) };
  }

  return {
    loadItemPage,
    fromDocument,
    isItemPage,
    getTitle,
    isNonItemCategory,
    parseTags,
    extractField,
    parseLocations,
    extractMergeList,
  };
})();
