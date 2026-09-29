// "Active server boosts" banner, read from the Artix calendar and cached.
const Boosts = (() => {
  const CALENDAR_URL = 'https://www.artix.com/calendar/';
  const CACHE_LIFETIME_MS = 12 * 60 * 60 * 1000;

  const CORE_KEYWORDS = ['double exp', 'double class', 'double rep', 'double gold', 'double all'];
  const RESOURCE_KEYWORDS = ['blood gem', 'spirit orb', 'void aura', 'essence', 'celestial dungeon', 'legion token', 'unidentified'];

  const CORE_STYLES = [
    { keyword: 'double exp', icon: 'icons/XPBoost.png', color: '#000000' },
    { keyword: 'double class', icon: 'icons/ClassBoost.png', color: '#660000' },
    { keyword: 'double rep', icon: 'icons/RepBoost.png', color: '#006600' },
    { keyword: 'double all', icon: 'icons/star.png', color: '#00BDCA' },
  ];
  const DEFAULT_CORE_STYLE = { icon: 'images/GoldBoost.png', color: '#D1AB3C' };
  const RESOURCE_STYLE = { icon: 'icons/item.png', color: '#E3C145' };

  const decodeUnicodeEscapes = (text) =>
    text.replace(/\\u([\dA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // "Double EXP Weekend 3.14.25" -> "Double EXP Weekend"
  const cleanEventName = (text) => text.replace(/\s+\d{1,2}\.\d{1,2}\.\d{2,4}$/, '').trim();

  // "Double EXP Boost" -> "2x EXP"
  const shortLabel = (text) => text.replace(' Boost', '').replace('Double', '2x').replace('Triple', '3x');

  /** The most recently started (not future) calendar event matching any keyword. */
  function findActiveEvent(html, keywords) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventRegex = /title:\s*'([^']+)'[\s\S]*?start:\s*'([^']+)'/g;
    let best = null;
    let bestStart = -Infinity;

    for (const [, rawTitle, start] of html.matchAll(eventRegex)) {
      const title = decodeUnicodeEscapes(rawTitle).trim();
      if (!keywords.some((keyword) => title.toLowerCase().includes(keyword))) continue;

      const startDate = new Date(`${start}T00:00:00`).getTime();
      if (startDate <= today.getTime() && startDate > bestStart) {
        bestStart = startDate;
        best = title;
      }
    }
    return best ? cleanEventName(best) : null;
  }

  function createBadge(id, style, label) {
    const badge = document.createElement('div');
    badge.className = 'boost';
    badge.id = id;
    badge.style.borderColor = style.color;

    const icon = document.createElement('img');
    icon.src = ext.runtime.getURL(style.icon);
    icon.alt = '';

    const text = document.createElement('span');
    text.textContent = shortLabel(label);

    badge.append(icon, text);
    return badge;
  }

  function display(coreBoosts, resourceBoosts) {
    const container = document.getElementById('boosts');
    if (!container) return;
    container.replaceChildren();

    if (resourceBoosts.length) {
      container.appendChild(createBadge('resourceBoost', RESOURCE_STYLE, resourceBoosts.join(' | ')));
    }
    if (coreBoosts.length) {
      const lower = coreBoosts[0].toLowerCase();
      const style = CORE_STYLES.find((s) => lower.includes(s.keyword)) || DEFAULT_CORE_STYLE;
      container.appendChild(createBadge('typeBoost', style, coreBoosts.join(' | ')));
    }
  }

  async function refresh() {
    const html = await fetchText(CALENDAR_URL);
    if (!html) return;

    const core = findActiveEvent(html, CORE_KEYWORDS);
    const resource = findActiveEvent(html, RESOURCE_KEYWORDS);
    const coreBoosts = core ? [core] : [];
    const resourceBoosts = resource ? [resource] : [];
    const expiresAt = Date.now() + CACHE_LIFETIME_MS;

    ext.storage.local.set({
      [STORAGE_KEYS.boostCache]: { data: coreBoosts, expiresAt },
      [STORAGE_KEYS.resourceCache]: { data: resourceBoosts, expiresAt },
    });
    display(coreBoosts, resourceBoosts);
  }

  async function init() {
    const result = await ext.storage.local.get([STORAGE_KEYS.boostCache, STORAGE_KEYS.resourceCache]);
    const core = result[STORAGE_KEYS.boostCache];
    const resource = result[STORAGE_KEYS.resourceCache];
    const now = Date.now();

    if (core && resource && core.expiresAt > now && resource.expiresAt > now) {
      display(core.data, resource.data);
    } else {
      refresh();
    }
  }

  return { init };
})();
