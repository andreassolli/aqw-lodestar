// Builds the item preview (images + short details). Used by the tooltip and the
// list cards so they look the same.
const ItemPreview = (() => {
  const MAX_SECTIONS = 5;
  const MAX_LIST_ITEMS = 3;
  const DETAIL_START_MARKERS = ['Location:', 'Locations:', 'Price:', 'Base Stats:'];
  const HIDDEN_FIELDS = ['Sellback', 'Description', 'Rarity'];

  const cache = new Map();

  function isTagsList(el) {
    const links = el.querySelectorAll('a[href]');
    return links.length > 0 && [...links].every((a) => (a.getAttribute('href') || '').includes('/system:page-tags/'));
  }

  // Flattens the Male/Female tabs so their content isn't skipped.
  function flattenTabs(content) {
    return [...content.children].flatMap((child) =>
      child.classList.contains('yui-navset')
        ? [...child.querySelectorAll('.yui-content > div')].flatMap((tab) => [...tab.children])
        : [child]
    );
  }

  // Drops empty "Label:" fields unless a list follows them.
  function stripEmptyFields(html, nextIsList) {
    const segments = html.split(/<br\s*\/?>/i);
    return segments
      .filter((segment, index) => {
        const match = segment.match(/<strong>\s*[^<:]+:?\s*<\/strong>([\s\S]*)/i);
        if (!match) return true;
        const value = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, '').trim();
        return value !== '' || (index === segments.length - 1 && nextIsList);
      })
      .join('<br>');
  }

  function cleanSection(child, next) {
    const clone = child.cloneNode(true);
    // Folded blocks and pictures are the page's own gallery ("+ Normal", "+ Animated")
    // and can hold spoilers. The tooltip has its one picture row. Small icons can stay.
    clone.querySelectorAll('.collapsible-block').forEach((block) => block.remove());
    clone.querySelectorAll('img').forEach((img) => {
      if (!(img.getAttribute('src') || '').includes('/image-tags/')) img.remove();
    });
    if (clone.matches('.collapsible-block')) return null;
    let html = clone.innerHTML;
    for (const field of HIDDEN_FIELDS) {
      html = html.replace(new RegExp(`<strong>\\s*${field}\\s*:?\\s*</strong>[\\s\\S]*?(<br\\s*/?>|$)`, 'i'), '');
    }

    const nextIsList = !!next && (next.tagName === 'UL' || next.tagName === 'OL') && !isTagsList(next);
    clone.innerHTML = stripEmptyFields(html, nextIsList);
    if (!clone.textContent.trim() && !clone.querySelector('img')) return null;

    if ((clone.tagName === 'UL' || clone.tagName === 'OL') && clone.children.length > MAX_LIST_ITEMS) {
      while (clone.children.length > MAX_LIST_ITEMS) clone.lastElementChild.remove();
      const more = document.createElement('li');
      more.textContent = '...';
      clone.appendChild(more);
    }
    return clone;
  }

  function endsWithHiddenField(child) {
    return new RegExp(`<strong>\\s*(${HIDDEN_FIELDS.join('|')})\\s*:?\\s*</strong>\\s*(<br\\s*/?>\\s*)?$`, 'i').test(child.innerHTML);
  }

  function collectSections(content) {
    const children = flattenTabs(content);
    const sections = [];
    let started = false;

    for (let i = 0; i < children.length && sections.length < MAX_SECTIONS; i++) {
      const child = children[i];
      if (child.tagName === 'HR') break;

      const text = child.textContent.trim();
      if (!text || text.includes('List of all tags') || /^Thanks to\b/i.test(text)) continue;

      if (!started) {
        started =
          DETAIL_START_MARKERS.some((marker) => text.includes(marker)) ||
          (child.tagName === 'P' && !!child.querySelector('strong'));
      }
      if (!started) continue;

      const lower = text.toLowerCase();
      if (lower === 'notes:' || lower === 'also see:') break;

      const section = cleanSection(child, children[i + 1]);
      if (section) sections.push(section);

      // "Sellback:" can have its values in a list of their own, which goes with it.
      if (endsWithHiddenField(child) && children[i + 1]?.tagName === 'UL') i++;
    }
    return sections;
  }

  // Badges after a card title (rarity, owned). Grouped so they wrap together.
  function titleTags(heading) {
    let tags = heading.querySelector(':scope > .aqwt-title-tags');
    if (!tags) {
      tags = document.createElement('span');
      tags.className = 'aqwt-title-tags';
      heading.appendChild(tags);
    }
    return tags;
  }

  function buildDetails(content, title, rarity) {
    const details = document.createElement('div');
    details.className = 'aqwt-hover-details';

    if (title) {
      const heading = document.createElement('p');
      heading.className = 'aqwt-tooltip-title';
      heading.textContent = title;
      if (rarity) titleTags(heading).appendChild(createRarityBadge(rarity));
      details.appendChild(heading);
    }
    if (!content) return details;

    const sections = collectSections(content);
    if (sections.length) {
      details.append(...sections);
    } else {
      const paragraphs = [...content.querySelectorAll('p')];
      const fallback = paragraphs.find((p) => p.textContent.includes('Location:')) || paragraphs[2] || paragraphs[1];
      const section = fallback && cleanSection(fallback);
      if (section) details.appendChild(section);
    }
    return details;
  }

  const MAX_QUEST_LINES = 8;

  function questField(details, label, value) {
    if (!value) return null;
    const line = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    line.append(strong, value);
    details.appendChild(line);
    return line;
  }

  function questList(details, label, lines) {
    if (!lines || !lines.length) return;
    questField(details, label, ' ');
    const list = document.createElement('ul');
    for (const text of lines.slice(0, MAX_QUEST_LINES)) {
      const row = document.createElement('li');
      row.textContent = text;
      list.appendChild(row);
    }
    if (lines.length > MAX_QUEST_LINES) {
      const more = document.createElement('li');
      more.textContent = `...and ${lines.length - MAX_QUEST_LINES} more`;
      list.appendChild(more);
    }
    details.appendChild(list);
  }

  function buildQuestPreview(quest) {
    const details = buildDetails(null, quest.title);
    questField(details, 'From', quest.from);
    questField(details, 'Location', quest.location);
    questField(details, 'Join', ' ')?.classList.add('aqwt-quest-join');
    questField(details, 'Requires', quest.requires);
    questList(details, 'Items needed', quest.items);
    questList(details, 'Rewards', quest.rewards);
    questList(details, 'Quests', quest.quests);
    return { images: [], fallbackImages: [], tags: [], details, isItem: false, joinMap: WikiParser.findQuestMap(quest.locationHref) };
  }

  async function loadWikiPreview(url, name) {
    const [pageUrl, hash = ''] = url.split('#');
    const page = await WikiParser.loadItemPage(pageUrl);
    if (!page) return null;

    const { doc, images } = page;
    if (WikiParser.isQuestPage(doc)) {
      const quest = WikiParser.parseQuest(doc, hash, name);
      return quest ? buildQuestPreview(quest) : null;
    }
    if (!images.length && WikiParser.isNonItemCategory(doc)) return null;

    const content = doc.querySelector('#page-content');
    const tags = WikiParser.parseTags(doc);
    const rarity = getRarity({ rarity: WikiParser.extractField(content, 'Rarity'), tags });
    // isItem: true = Items, false = map/monster/NPC, null = can't tell
    const title = WikiParser.getTitle(doc);
    return { images, tags, title, details: buildDetails(content, title, rarity), isItem: WikiParser.isItemCategory(doc) };
  }

  // Names with the same base would run the same search, so only keep one.
  function closetNames(...names) {
    const byBase = new Map();
    for (const name of names.filter(Boolean)) {
      if (!byBase.has(getBaseName(name))) byBase.set(getBaseName(name), name);
    }
    return [...byBase.values()];
  }

  // We know which item this is, so only take an exact match in the right slot.
  // Falling back to the first search result is how an armor ended up showing its helm.
  async function findClosetExact(name, wiki, type) {
    const slot = ItemTypes.closetSlot(type || ItemTypes.itemType({ tags: wiki ? wiki.tags : [] }));
    for (const candidate of closetNames(wiki && wiki.title, name)) {
      const found = await Aqcloset.findItemPreview(candidate, { exact: true, slot });
      if (found.images.length) return found;
    }
    return { images: [] };
  }

  /**
   * Links show what they lead to. Maps, monsters and NPCs can share an item's
   * name and AQCloset would find that item, so for those we only show their own
   * wiki page. A link is an item if the catalog has it or the page is under Items.
   */
  async function loadPreview({ url, name, pageImages, fromLink = false, itemType = null, ac = null }) {
    const page = itemType ? await findItemPage({ name, itemType, ac }) : null;
    const pageUrl = page ? WIKI_ORIGIN + page.path : url;
    const type = itemType ? ItemTypes.fromSiteType(itemType) : null;

    // The wiki is the slow part, so have the picture search running at the same time.
    if (!pageImages || !pageImages.length) Aqcloset.preload(name);
    const wiki = await loadWikiPreview(pageUrl, name);

    if (fromLink) {
      // Only ask the catalog when the page can't tell us. Waking it up from
      // storage is slow and most pages have breadcrumbs.
      let isItem = wiki ? wiki.isItem : null;
      if (isItem === null) {
        const path = wikiPathOf(url);
        const known = path ? await classifyWikiLinks([{ path, name }]) : null;
        isItem = !known || known[0];
      }
      if (!isItem) return wiki && (wiki.images.length || wiki.details) ? wiki : null;
    }

    let closet;
    if (pageImages && pageImages.length) {
      closet = { images: pageImages };
    } else if (fromLink || itemType) {
      closet = await findClosetExact(name, wiki, type);
    } else {
      closet = await Aqcloset.findItemPreview(name, { slot: ItemTypes.closetSlot(ItemTypes.itemType({ tags: wiki ? wiki.tags : [] })) });
    }

    // AQCloset images look cleaner, the wiki ones are the backup.
    const wikiImages = wiki ? wiki.images : [];
    const images = closet.images.length ? closet.images : wikiImages;
    const fallbackImages = closet.images.length ? wikiImages : [];
    const details = wiki ? wiki.details : null;
    const tags = wiki ? wiki.tags : [];
    return images.length || details ? { images, fallbackImages, details, tags } : null;
  }

  // The type is part of it, two items in a table can share a name.
  function previewKey({ url, name, itemType, ac }) {
    return [url, name || '', itemType || '', ac ?? ''].join('::');
  }

  // Cached. Calls for the same item share one request.
  function load(target) {
    const key = previewKey(target);
    if (!cache.has(key)) {
      const pending = loadPreview(target).catch((err) => {
        console.error('Item preview error:', err);
        return null;
      });
      pending.then((preview) => {
        if (!preview) cache.delete(key);
      });
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  function linkTitle(details, url) {
    const heading = details.querySelector('.aqwt-tooltip-title');
    const text = heading && heading.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return;

    const link = document.createElement('a');
    link.className = 'aqwt-card-title-link';
    link.href = url;
    link.textContent = text.textContent;
    link.dataset.aqwtNoTooltip = '';
    heading.replaceChild(link, text);
  }

  // The map takes another page to find, so it fills in after the tooltip is up.
  async function showJoin(details, joinMap) {
    const line = details.querySelector('.aqwt-quest-join');
    if (!line) return;
    const map = await joinMap;
    if (map) line.lastChild.textContent = `/join ${map}`;
    line.classList.toggle('is-ready', Boolean(map));
  }

  function fill(container, preview, options = {}) {
    container.replaceChildren();

    if (preview.images.length) {
      const row = document.createElement('div');
      const addImages = (sources) => {
        row.className = 'aqwt-tooltip-images' + (sources.length > 1 ? ' is-multi' : '');
        sources.forEach((src) => {
          const img = document.createElement('img');
          img.alt = '';
          img.loading = 'lazy';
          const fail = () => {
            img.remove();
            // All the main images failed, show the backups if there are any.
            const fallback = preview.fallbackImages || [];
            if (!row.children.length && fallback.length && !row.dataset.fellBack) {
              row.dataset.fellBack = '1';
              addImages(fallback);
            }
          };
          row.appendChild(img);
          if (ImageProxy.isActive() && ImageProxy.isImgur(src)) {
            ImageProxy.useProxy(img, src, null, fail);
          } else {
            img.onerror = fail;
            img.src = src;
          }
        });
      };
      addImages(preview.images);
      container.appendChild(row);
    }
    if (preview.details) {
      // Cloned so it can show in the tooltip and a list at the same time.
      const details = preview.details.cloneNode(true);
      if (options.titleUrl) linkTitle(details, options.titleUrl);
      container.appendChild(details);
      if (preview.joinMap) showJoin(details, preview.joinMap);
    }
  }

  return { load, fill, titleTags, previewKey };
})();
