// Item preview panel shown while hovering wiki links, inventory rows on
// account.aq.com, and items on aqcloset.com.
(() => {
  const HOVER_DELAY_MS = 100;
  const MAX_SECTIONS = 5;
  const MAX_LIST_ITEMS = 3;
  const DETAIL_START_MARKERS = ['Location:', 'Locations:', 'Price:', 'Base Stats:'];
  const HIDDEN_FIELDS = ['Sellback', 'Description', 'Rarity'];
  const EXCLUDED_LINK_AREAS = 'sub, #top-bar, #side-bar, #breadcrumbs, [data-aqwt-no-tooltip]';
  const BADGE_ICON_FILES = ['ac.png', 'legend.png'];

  const panel = document.createElement('div');
  panel.className = 'aqwt-tooltip';
  document.body.appendChild(panel);

  const cache = new Map(); // "url::name" -> preview
  let hoverTimer = null;
  let activeKey = null;

  function isWikiUrl(href) {
    try {
      return new URL(href).hostname === 'aqwwiki.wikidot.com';
    } catch {
      return false;
    }
  }

  // aqcloset-page.js adds a "Toggle tooltip" switch; no switch means enabled.
  function isAqclosetTooltipEnabled() {
    const checkbox = document.getElementById('toggle-tooltip');
    return !checkbox || checkbox.checked;
  }

  /** On aqcloset.com the item's preview is already in the DOM - reuse it. */
  function getAqclosetObjectImages(object) {
    const images = new Set();
    object.querySelectorAll('img[src]').forEach((img) => {
      const src = img.currentSrc || img.src;
      const fileName = src.toLowerCase().split(/[?#]/)[0].split('/').pop();
      if (src && !BADGE_ICON_FILES.includes(fileName)) images.add(src);
    });
    return [...images];
  }

  /** @returns {{url: string, name: string, pageImages?: string[]}|null} */
  function resolveTarget(target) {
    const link = target.closest('a[href]');
    if (link && !link.dataset.aqwtGenerated && isWikiUrl(link.href) && !link.closest(EXCLUDED_LINK_AREAS)) {
      return { url: link.href, name: getItemLinkLabel(link) };
    }

    if (PAGE.isInventory && target.tagName === 'TD' && target.parentElement?.firstElementChild === target) {
      const name = target.textContent.trim();
      if (name) return { url: wikiUrlFromName(name), name };
    }

    if (PAGE.isAqcloset && isAqclosetTooltipEnabled()) {
      const object = target.closest('.object');
      const name = object?.querySelector('.label .name')?.textContent.trim();
      if (name) return { url: wikiUrlFromName(name), name, pageImages: getAqclosetObjectImages(object) };
    }

    return null;
  }

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

  function buildDetails(content, title, rarity) {
    const details = document.createElement('div');
    details.className = 'aqwt-hover-details';

    if (title) {
      const heading = document.createElement('p');
      heading.className = 'aqwt-tooltip-title';
      heading.textContent = title;
      if (rarity) heading.appendChild(createRarityBadge(rarity));
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
    const rarity = getRarity({
      rarity: WikiParser.extractField(content, 'Rarity'),
      tags: WikiParser.parseTags(doc),
    });
    return { images, details: buildDetails(content, WikiParser.getTitle(doc), rarity) };
  }

  async function loadPreview({ url, name, pageImages }) {
    const closetPromise = pageImages && pageImages.length
      ? Promise.resolve({ images: pageImages })
      : Aqcloset.findItemPreview(name);

    const [wiki, closet] = await Promise.all([loadWikiPreview(url), closetPromise]);

    // AQCloset thumbnails are cleaner than scraped wiki images, so prefer them.
    const images = closet.images.length ? closet.images : wiki ? wiki.images : [];
    const details = wiki ? wiki.details : null;
    return images.length || details ? { images, details } : null;
  }

  function show(preview) {
    panel.replaceChildren();

    if (preview.images.length) {
      const row = document.createElement('div');
      row.className = 'aqwt-tooltip-images' + (preview.images.length > 1 ? ' is-multi' : '');
      preview.images.forEach((src) => {
        const img = document.createElement('img');
        img.alt = '';
        img.onerror = () => img.remove();
        img.src = src;
        row.appendChild(img);
      });
      panel.appendChild(row);
    }
    if (preview.details) panel.appendChild(preview.details);

    panel.classList.add('visible');
  }

  function hide() {
    clearTimeout(hoverTimer);
    activeKey = null;
    panel.classList.remove('visible');
    panel.replaceChildren();
  }

  document.addEventListener('mouseover', (e) => {
    if (!(e.target instanceof Element)) return;
    const target = resolveTarget(e.target);
    if (!target || !target.url) return;

    const key = `${target.url}::${target.name || ''}`;
    activeKey = key;
    clearTimeout(hoverTimer);

    hoverTimer = setTimeout(async () => {
      try {
        if (!cache.has(key)) {
          const preview = await loadPreview(target);
          if (!preview) return;
          cache.set(key, preview);
        }
        if (activeKey === key) show(cache.get(key)); // skip if the cursor already left
      } catch (err) {
        console.error('Hover preview error:', err);
      }
    }, HOVER_DELAY_MS);
  });

  document.addEventListener('mouseout', (e) => {
    if (!(e.target instanceof Element)) return;
    if (
      e.target.closest('a') ||
      (PAGE.isInventory && e.target.tagName === 'TD') ||
      (PAGE.isAqcloset && e.target.closest('.object'))
    ) {
      hide();
    }
  });
})();
