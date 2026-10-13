// "Active server boosts": the current boosts from the Artix calendar, and,
// when a badge is clicked, when each kind of boost is next on the calendar.
const Boosts = (() => {
  const CALENDAR_URL = 'https://www.artix.com/calendar/';
  const CACHE_LIFETIME_MS = 12 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Each kind of boost, matched by keywords in the calendar title (lowercased, "#" removed).
  // Add or adjust entries here; an event counts for every kind whose keyword is in its title.
  const GROUPS = {
    core: {
      label: 'Core boosts',
      emptyLabel: 'No boost',
      types: [
        { id: 'xp', name: '2x EXP', keywords: ['double exp', 'double xp'], icon: 'icons/XPBoost.png', color: '#000000' },
        { id: 'class', name: '2x Class', keywords: ['double class'], icon: 'icons/ClassBoost.png', color: '#660000' },
        { id: 'rep', name: '2x Rep', keywords: ['double rep'], icon: 'icons/RepBoost.png', color: '#006600' },
        { id: 'gold', name: '2x Gold', keywords: ['double gold'], icon: 'icons/GoldBoost.png', color: '#D1AB3C' },
        { id: 'all', name: '2x All', keywords: ['double all'], icon: 'icons/star.png', color: '#00BDCA' },
        ],
    },
    resource: {
      label: 'Resource boosts',
      emptyLabel: 'No boost',
      types: [
        { id: 'celestial', name: 'TempleShrine', keywords: ['celestial dungeon'] },
        { id: 'unid3435', name: 'Unidentified 34 & 35', keywords: ['unidentified 34', 'unidentified 35'] },
        { id: 'bloodgem', name: 'Blood Gems', keywords: ['blood gem'] },
        { id: 'spiritorb', name: 'Spirit Orbs + Metals', keywords: ['spirit orb'] },
        { id: 'darkspiritorb', name: 'Dark Spirit Orbs', keywords: ['dark spirit orb'] },
        { id: 'voidaura', name: 'Void Auras', keywords: ['void aura'] },
        { id: 'essence', name: 'Essences + Totems', keywords: ['essence'] },
        { id: 'legiontoken', name: 'Legion Tokens + Rib', keywords: ['legion token'] },
      ].map((type) => ({ icon: 'icons/item.png', color: '#E3C145', ...type })),
    },
  };
  const ALL_TYPES = Object.values(GROUPS).flatMap((group) => group.types);
  // Changes whenever the kinds or keywords above change, so a cache built for an
  // older list is fetched again instead of missing the new kinds.
  const TYPES_SIGNATURE = ALL_TYPES.map((type) => `${type.id}:${type.keywords.join('|')}`).join(';');

  let openGroup = null;
  let events = [];

  const decodeUnicodeEscapes = (text) =>
    text.replace(/\\u([\dA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // "Double EXP Weekend 3.14.25" > "Double EXP Weekend"
  const cleanEventName = (text) => text.replace(/\s+\d{1,2}\.\d{1,2}\.\d{2,4}$/, '').trim();

  // "2026-10-17" (local midnight) or a full date-time string, as ms.
  function parseDate(value) {
    if (!value) return null;
    const time = new Date(/T|\s\d/.test(value) ? value : `${value}T00:00:00`).getTime();
    return Number.isNaN(time) ? null : time;
  }

  function typesFor(title) {
    const lower = title.toLowerCase().replace(/#/g, '');
    return ALL_TYPES.filter((type) => type.keywords.some((keyword) => lower.includes(keyword))).map((type) => type.id);
  }

  // Boost events in the calendar page: one chunk per "title:", with start (and end, if given) inside it.
  function parseCalendar(html) {
    const parsed = [];
    for (const chunk of html.split(/title:\s*/).slice(1)) {
      const title = chunk.match(/^'([^']+)'/);
      const start = chunk.match(/start:\s*'([^']+)'/);
      if (!title || !start) continue;

      const name = cleanEventName(decodeUnicodeEscapes(title[1]).trim());
      const types = typesFor(name);
      const startAt = parseDate(start[1]);
      if (!types.length || startAt == null) continue;

      const end = chunk.match(/end:\s*'([^']+)'/);
      parsed.push({ name, types, start: startAt, end: end ? parseDate(end[1]) : null });
    }
    return parsed.sort((a, b) => a.start - b.start);
  }

  function isActive(event, now) {
    return event.start <= now && (event.end == null || now < event.end);
  }

  // The current event for a group: one running now; without end dates, the latest that has started.
  function activeEvent(group, now) {
    const ids = new Set(group.types.map((type) => type.id));
    const started = events.filter((event) => event.types.some((id) => ids.has(id)) && event.start <= now);
    const running = started.filter((event) => event.end != null && now < event.end);
    if (running.length) return running[running.length - 1];
    const latest = started[started.length - 1];
    return latest && latest.end == null ? latest : null;
  }

  function statusFor(type, now) {
    const ofType = events.filter((event) => event.types.includes(type.id));
    const current = ofType.find((event) => event.end != null && isActive(event, now));
    const next = ofType.find((event) => event.start > now);
    return { current, next };
  }

  function formatDay(time) {
    return new Date(time).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function relativeDays(time, now) {
    const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime();
    const days = Math.round((startOfDay(time) - startOfDay(now)) / DAY_MS);
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  // "Double EXP Boost" > "2x EXP"
  const shortLabel = (text) => text.replace(' Boost', '').replace('Double', '2x').replace('Triple', '3x');

  function createBadge(groupId, now) {
    const group = GROUPS[groupId];
    const event = activeEvent(group, now);
    const type = event ? ALL_TYPES.find((t) => t.id === event.types[0]) : null;

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'boost' + (event ? '' : ' is-empty');
    badge.id = groupId === 'core' ? 'typeBoost' : 'resourceBoost';
    badge.dataset.group = groupId;
    badge.title = `Show when ${group.label.toLowerCase()} are next`;
    badge.setAttribute('aria-expanded', String(openGroup === groupId));
    badge.setAttribute('aria-controls', 'boost-schedule');
    if (type) badge.style.borderColor = type.color;

    const icon = document.createElement('img');
    icon.src = ext.runtime.getURL(type ? type.icon : groupId === 'core' ? 'icons/XPBoost.png' : 'icons/item.png');
    icon.alt = '';

    const text = document.createElement('span');
    text.textContent = event ? shortLabel(event.name) : group.emptyLabel;

    badge.append(icon, text);
    return badge;
  }

  function createScheduleRow(type, now) {
    const { current, next } = statusFor(type, now);

    const row = document.createElement('li');
    row.className = 'boost-schedule-row' + (current ? ' is-active' : '');

    const icon = document.createElement('img');
    icon.src = ext.runtime.getURL(type.icon);
    icon.alt = '';

    const name = document.createElement('span');
    name.className = 'boost-schedule-name';
    name.textContent = type.name;

    const when = document.createElement('span');
    when.className = 'boost-schedule-when';
    if (current) {
      when.textContent = `Active now, until ${formatDay(current.end - 1)}`;
      if (next) when.title = `Next: ${formatDay(next.start)}`;
    } else if (next) {
      when.textContent = `${formatDay(next.start)} · ${relativeDays(next.start, now)}`;
      when.title = next.name;
    } else {
      when.textContent = 'Not on the calendar yet';
      when.classList.add('is-unknown');
    }

    row.append(icon, name, when);
    return row;
  }

  /**
   * The boost on the badge, written out in full (the badge text can be cut off),
   * with when it ends. Shown above the "Next ..." list while one is running.
   */
  function createCurrentRow(group, now) {
    const current = activeEvent(group, now);
    if (!current) return null;
    const type = ALL_TYPES.find((t) => t.id === current.types[0]);

    const row = document.createElement('li');
    row.className = 'boost-schedule-row';

    const icon = document.createElement('img');
    icon.src = ext.runtime.getURL(type ? type.icon : 'icons/item.png');
    icon.alt = '';

    const name = document.createElement('span');
    name.className = 'boost-schedule-name is-current';
    name.textContent = shortLabel(current.name);
    name.title = current.name;

    const when = document.createElement('span');
    when.className = 'boost-schedule-when';
    when.textContent = current.end != null ? `Until ${formatDay(current.end - 1)}` : `Since ${formatDay(current.start)}`;

    row.append(icon, name, when);
    const list = document.createElement('ul');
    list.className = 'boost-current';
    list.append(row);
    return list;
  }

  function renderSchedule(now) {
    const panel = document.getElementById('boost-schedule');
    if (!panel) return;
    panel.hidden = !openGroup;
    if (!openGroup) return;

    const group = GROUPS[openGroup];
    const heading = document.createElement('p');
    heading.className = 'boost-schedule-heading';
    heading.textContent = `Next ${group.label.toLowerCase()}`;

    // Soonest first: running now, then by next start date; not-on-the-calendar last.
    const sortKey = (type) => {
      const { current, next } = statusFor(type, now);
      if (current) return -Infinity;
      return next ? next.start : Infinity;
    };
    const ordered = group.types
      .map((type, index) => ({ type, index, key: sortKey(type) }))
      .sort((a, b) => a.key - b.key || a.index - b.index)
      .map(({ type }) => type);

    const list = document.createElement('ul');
    list.append(...ordered.map((type) => createScheduleRow(type, now)));
    const current = createCurrentRow(group, now);
    panel.replaceChildren(...(current ? [current] : []), heading, list);
  }

  function render() {
    const container = document.getElementById('boosts');
    if (!container) return;
    const now = Date.now();
    container.replaceChildren(createBadge('resource', now), createBadge('core', now));
    renderSchedule(now);
  }

  // Kinds are matched from the name every time, never trusted from storage.
  function withCurrentTypes(storedEvents) {
    return storedEvents
      .map((event) => ({ ...event, types: typesFor(event.name || '') }))
      .filter((event) => event.types.length);
  }

  async function refresh() {
    const html = await fetchText(CALENDAR_URL);
    if (!html) return false;
    events = parseCalendar(html);
    await ext.storage.local.set({
      [STORAGE_KEYS.boostSchedule]: { fetchedAt: Date.now(), signature: TYPES_SIGNATURE, events },
    });
    render();
    return true;
  }

  async function init() {
    document.getElementById('boosts')?.addEventListener('click', (e) => {
      const badge = e.target.closest('.boost');
      if (!badge) return;
      openGroup = openGroup === badge.dataset.group ? null : badge.dataset.group;
      render();
    });

    const cached = (await ext.storage.local.get(STORAGE_KEYS.boostSchedule))[STORAGE_KEYS.boostSchedule];
    if (cached && Array.isArray(cached.events)) {
      events = withCurrentTypes(cached.events);
      render();
    }
    const stale = !cached || cached.signature !== TYPES_SIGNATURE || Date.now() - cached.fetchedAt > CACHE_LIFETIME_MS;
    if (stale) {
      if (!(await refresh()) && !cached) render();
    }
    // The old caches are replaced by boostSchedule.
    ext.storage.local.remove([STORAGE_KEYS.boostCache, STORAGE_KEYS.resourceCache]);
  }

  return { init };
})();
