// Builds the item preview (images + short wiki details) used by the hover
// tooltip and the TLAPD list, so both render items identically.
const ItemPreview = (() => {
  const MAX_SECTIONS = 5;
  const MAX_LIST_ITEMS = 3;
  const DETAIL_START_MARKERS = ['Location:', 'Locations:', 'Price:', 'Base Stats:'];
  const HIDDEN_FIELDS = ['Sellback', 'Description', 'Rarity'];

  const cache = new Map(); // "url::name" -> Promise<preview|null>

  function isTagsList(el) {
    const links = el.querySelectorAll('a[href]');
    return links.length > 0 && [...links].every((a) => (a.getAttribute('href') || '').includes('/system:page-tags/'));
  }

  /** Page content children, with Male/Female tab panes flattened in so they aren't skipped. */
  function flattenTabs(content) {
    return [...content.children].flatMap((child) =>
      child.classList.contains('yui-navset')
        ? [...child.querySelectorAll('.yui-content > div')].flatMap((tab) => [...tab.children])
        : [child]
    );
  }

  /** Drop "<strong>Label:</strong>" fields with no value, unless the value is the list that follows. */
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
    let html = clone.innerHTML;
    for (const field of HIDDEN_FIELDS) {
      html = html.replace(new RegExp(`<strong>\\s*${field}\\s*:?\\s*</strong>[\\s\\S]*?(<br\\s*/?>|$)`, 'i'), '');
    }

    const nextIsList = !!next && (next.tagName === 'UL' || next.tagName === 'OL') && !isTagsList(next);
    clone.innerHTML = stripEmptyFields(html, nextIsList);
    if (!clone.textContent.trim()) return null;

    if ((clone.tagName === 'UL' || clone.tagName === 'OL') && clone.children.length > MAX_LIST_ITEMS) {
      while (clone.children.length > MAX_LIST_ITEMS) clone.lastElementChild.remove();
      const more = document.createElement('li');
      more.textContent = '...';
      clone.appendChild(more);
    }
    return clone;
  }

  function collectSections(content) {
    const children = flattenTabs(content);
    const sections = [];
    let started = false;

    for (let i = 0; i < children.length && sections.length < MAX_SECTIONS; i++) {
      const child = children[i];
      if (child.tagName === 'HR') break;

      const text = child.textContent.trim();
      if (!text || text.includes('List of all tags')) continue;

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
    }
    return sections;
  }

  /**
   * The row of badges after a card title (rarity, owned checkmark): one inline
   * group, so the badges wrap together like tags instead of each on its own.
   * owned-marks.js adds its checkmark to the same group.
   */
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
      if (fallback) details.appendChild(fallback.cloneNode(true));
    }
    return details;
  }

  async function loadWikiPreview(url) {
    const page = await WikiParser.loadItemPage(url);
    if (!page) return null;

    const { doc, images } = page;
    if (!images.length && WikiParser.isNonItemCategory(doc)) return null;

    const content = doc.querySelector('#page-content');
    const tags = WikiParser.parseTags(doc);
    const rarity = getRarity({ rarity: WikiParser.extractField(content, 'Rarity'), tags });
    return { images, tags, details: buildDetails(content, WikiParser.getTitle(doc), rarity) };
  }

  async function loadPreview({ url, name, pageImages }) {
    const closetPromise = pageImages && pageImages.length
      ? Promise.resolve({ images: pageImages })
      : Aqcloset.findItemPreview(name);

    const [wiki, closet] = await Promise.all([loadWikiPreview(url), closetPromise]);

    // AQCloset thumbnails are cleaner than scraped wiki images, so prefer them;
    // the wiki images stand in if the thumbnails fail to load.
    const wikiImages = wiki ? wiki.images : [];
    const images = closet.images.length ? closet.images : wikiImages;
    const fallbackImages = closet.images.length ? wikiImages : [];
    const details = wiki ? wiki.details : null;
    const tags = wiki ? wiki.tags : [];
    return images.length || details ? { images, fallbackImages, details, tags } : null;
  }

  /**
   * Cached; concurrent calls for the same item share one request.
   * @param {{url: string, name: string, pageImages?: string[]}} target
   * @returns {Promise<{images: string[], fallbackImages: string[], details: HTMLElement|null, tags: string[]}|null>}
   */
  function load(target) {
    const key = `${target.url}::${target.name || ''}`;
    if (!cache.has(key)) {
      const pending = loadPreview(target).catch((err) => {
        console.error('Item preview error:', err);
        return null;
      });
      pending.then((preview) => {
        if (!preview) cache.delete(key); // allow a retry later
      });
      cache.set(key, pending);
    }
    return cache.get(key);
  }

  /** Turns the title text into a link to the item's page; hover-tooltip.js skips it. */
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

  /**
   * Renders a preview into an element with the .aqwt-card styling.
   * @param {{titleUrl?: string}} [options] - titleUrl makes the title a link
   */
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
            // All preferred images failed: show the stand-ins once, if there are any.
            const fallback = preview.fallbackImages || [];
            if (!row.children.length && fallback.length && !row.dataset.fellBack) {
              row.dataset.fellBack = '1';
              addImages(fallback);
            }
          };
          row.appendChild(img);
          if (ImageProxy.isActive() && ImageProxy.isImgur(src)) {
            ImageProxy.useProxy(img, src, null, fail); // tries each image proxy before giving up
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
      // Cloned so the same item can be shown in the tooltip and the list at once.
      const details = preview.details.cloneNode(true);
      if (options.titleUrl) linkTitle(details, options.titleUrl);
      container.appendChild(details);
    }
  }

  return { load, fill, titleTags };
})();
