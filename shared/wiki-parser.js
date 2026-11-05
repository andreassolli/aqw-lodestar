// Fetching and parsing wiki pages.

const WikiParser = (() => {
  const IMAGE_BLOCKLIST = ['/image-tags/', 'acsmall', 'aclarge', 'raresmall', 'legendsmall', 'membersmall', 'map', 'npc'];
  const NON_ITEM_CATEGORIES = ['Quests', 'Shops', 'Factions'];
  const ITEM_FIELD_MARKERS = ['Location:', 'Locations:', 'Price:', 'Base Stats:'];
  const MAX_PAGE_HOPS = 2; // the page + one disambiguation hop

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
    // On an open page the title also has our badge and button in it.
    const clone = title.cloneNode(true);
    clone.querySelectorAll('.aqwt-owned, .aqwt-farm-button, .aqwt-try-on-button').forEach((el) => el.remove());
    return clone.textContent.trim();
  }

  // true for Items, false for World > Locations/NPCs etc, null if there are no breadcrumbs.
  function isItemCategory(doc) {
    const crumbs = [...doc.querySelectorAll('#breadcrumbs a')].map((a) => a.textContent.trim());
    return crumbs.length ? crumbs.includes('Items') : null;
  }

  function isNonItemCategory(doc) {
    return [...doc.querySelectorAll('#breadcrumbs a')].some((a) =>
      NON_ITEM_CATEGORIES.includes(a.textContent.trim())
    );
  }

  // Wikidot shows the homepage for some unknown pages.
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

  // Follows a disambiguation page to the real item if needed.
  async function loadItemPage(url, hopsLeft = MAX_PAGE_HOPS) {
    const page = await fetchPage(url);
    if (!page || !page.html) return null;

    const doc = parseHtml(page.html);
    if (isStartPage(doc, page.baseUrl)) return null; // unknown pages land on the homepage
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

  // Handles "Location: <a>Map</a> - <a>Shop</a>" and a "Locations:" list.
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

  const mapNames = new Map();

  // "Map Name: howardshill" -> howardshill
  function mapNameOf(doc) {
    const field = extractField(doc.querySelector('#page-content'), 'Map Name');
    const match = field && field.match(/^[a-z0-9_-]+/i);
    return match ? match[0].toLowerCase() : null;
  }

  // Map name on this page, or on the pages its Location links to (shops, NPCs
  // and quests name their map that way).
  function mapNameAt(href, hopsLeft) {
    const url = resolveUrl(href, WIKI_ORIGIN);
    if (!url) return Promise.resolve(null);
    const key = new URL(url).pathname.toLowerCase();
    if (!mapNames.has(key)) {
      mapNames.set(
        key,
        fetchPage(url).then(async (page) => {
          // No answer at all, try again another time.
          if (!page) throw new Error("couldn't reach the wiki");
          if (!page.html) return null;
          const doc = parseHtml(page.html);
          if (isStartPage(doc, page.baseUrl)) return null;
          const own = mapNameOf(doc);
          if (own || hopsLeft < 1) return own;
          for (const location of parseLocations(doc.querySelector('#page-content'))) {
            const found = await mapNameFromLinks(location.hrefs, hopsLeft - 1);
            if (found) return found;
          }
          return null;
        })
      );
      mapNames.get(key).catch(() => mapNames.delete(key));
    }
    return mapNames.get(key);
  }

  // The last link is usually the map, so try that first.
  async function mapNameFromLinks(hrefs, hopsLeft) {
    for (const href of [...(hrefs || [])].filter(Boolean).reverse()) {
      const found = await mapNameAt(href, hopsLeft);
      if (found) return found;
    }
    return null;
  }

  // The map for an item's first location, or null. Rejects if the wiki couldn't
  // be reached so it can be retried.
  function findJoinMap(locations) {
    return locations && locations.length ? mapNameFromLinks(locations[0].hrefs, 1) : Promise.resolve(null);
  }

  function isQuestPage(doc) {
    return [...doc.querySelectorAll('#breadcrumbs a')].some((a) => a.textContent.trim() === 'Quests');
  }

  const questKey = (text) => text.toLowerCase().replace(/["'\u2018\u2019\u201c\u201d]/g, '').replace(/\s+/g, ' ').trim();

  // The list under a "Rewards:" style label, without the notes nested in each row.
  function listAfterLabel(panel, pattern) {
    const lines = [];
    for (const label of panel.querySelectorAll('strong')) {
      if (!pattern.test(label.textContent.trim())) continue;
      let list = null;
      for (let el = label.closest('p')?.nextElementSibling; el && !list; el = el.nextElementSibling) {
        if (el.tagName === 'UL') list = el;
        else if (el.querySelector('strong')) break;
      }
      if (!list) continue;
      for (const li of list.children) {
        const clone = li.cloneNode(true);
        clone.querySelectorAll('ul, ol').forEach((nested) => nested.remove());
        const text = clone.textContent.replace(/\s+/g, ' ').trim();
        if (text) lines.push(text);
      }
    }
    return lines;
  }

  // The "Quest Location / Quests Begun From" paragraph above a set of quests.
  function questGroupInfo(navset) {
    for (let el = navset && navset.previousElementSibling; el; el = el.previousElementSibling) {
      const location = [...el.querySelectorAll('strong')].find((strong) => /^Quest Locations?:?$/i.test(strong.textContent.trim()));
      if (!location) continue;
      const from = [...el.querySelectorAll('strong')].find((strong) => /^Quests? Begun From:?$/i.test(strong.textContent.trim()));
      const textAfter = (label) => {
        let text = '';
        for (let node = label && label.nextSibling; node && node.nodeName !== 'BR' && node.nodeName !== 'STRONG'; node = node.nextSibling) text += node.textContent;
        return text.trim() || null;
      };
      const firstLink = (label) => {
        const node = label && label.nextElementSibling;
        return node && node.tagName === 'A' ? node.getAttribute('href') : null;
      };
      return { location: textAfter(location), locationHref: firstLink(location), from: textAfter(from) };
    }
    return {};
  }

  // A link like /warlic-s-quests#19 with the text "Inferno Heart". The # is the
  // group of quests on the page and each quest in it is a tab. Without a matching
  // tab we still have the group, like for a link to the whole page.
  function parseQuest(doc, hash, name) {
    const content = doc.querySelector('#page-content');
    if (!content) return null;

    const navsets = (root) => [...root.querySelectorAll('.yui-navset')];
    const tabIn = (navset) => {
      const tabs = [...navset.querySelectorAll(':scope > .yui-nav li')];
      const index = tabs.findIndex((tab) => questKey(tab.textContent) === questKey(name || ''));
      return index < 0 ? null : { navset, panel: navset.querySelectorAll(':scope > .yui-content > div')[index] };
    };

    // Everything from the # to the next one, since quest names repeat between groups.
    const anchor = hash && content.querySelector(`a[name="${CSS.escape(hash.replace(/^#/, ''))}"]`);
    const section = [];
    if (anchor) {
      let el = anchor.closest('#page-content > *');
      section.push(el);
      for (el = el && el.nextElementSibling; el && !el.querySelector('a[name]:not([name="space"])'); el = el.nextElementSibling) section.push(el);
    }
    const inSection = section.flatMap((el) => (el.matches('.yui-navset') ? [el] : navsets(el)));

    const found = inSection.map(tabIn).find(Boolean) || navsets(content).map(tabIn).find(Boolean);
    const navset = found ? found.navset : inSection[0] || navsets(content)[0];
    const info = questGroupInfo(navset);

    if (!found) {
      const quests = navset ? [...navset.querySelectorAll(':scope > .yui-nav li')].map((tab) => tab.textContent.trim()) : [];
      return { title: getTitle(doc), ...info, quests };
    }

    const requirement = [...found.panel.querySelectorAll('strong')].find((strong) => /^Requirements?:?$/i.test(strong.textContent.trim()));
    let requires = '';
    for (let node = requirement && requirement.nextSibling; node && node.nodeName !== 'BR'; node = node.nextSibling) requires += node.textContent;

    return {
      title: name,
      ...info,
      requires: requires.replace(/\s+/g, ' ').trim() || null,
      items: listAfterLabel(found.panel, /^Items? Required:?$/i),
      // A plain "Items:" comes after the rewards and is more of them.
      rewards: listAfterLabel(found.panel, /^(Rewards?|Items|You may also .*):?$/i),
    };
  }

  // The /join for a quest location, or null.
  function findQuestMap(href) {
    return href ? mapNameFromLinks([href], 1).catch(() => null) : Promise.resolve(null);
  }

  function fromDocument(doc, baseUrl) {
    return { doc, baseUrl, images: findImages(doc, baseUrl) };
  }

  return {
    loadItemPage,
    fromDocument,
    isItemPage,
    getTitle,
    isNonItemCategory,
    isItemCategory,
    isQuestPage,
    parseQuest,
    findQuestMap,
    parseTags,
    extractField,
    parseLocations,
    extractMergeList,
    findJoinMap,
  };
})();
