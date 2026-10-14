// The Classes tab: a class search (ClassSearch, the plugin's take on the
// website's command menu) and the chosen class's card (ClassCard), like the
// class page on aqw.app. The guide itself is downloaded by main.js.
(() => {
  const PLUGIN = 'class-enhancements';
  const IMAGE_URL = (name) => `https://aqw.app/classes/${encodeURIComponent(name)}.png`;
  const REMEMBER_KEY = 'lodestar-class-enhancements-class';
  const STANDARD = 'Standard';
  const TRANSITION_MS = 400; // boss buttons ignore clicks while the values slide

  // ---------- icons ----------

  // Equipment uses the extension's own item icons; the consumables are drawn
  // here (in the text colour) since the extension has none for them.
  const IMAGE_ICONS = {
    weapon: '/icons/aqwsword.png',
    class: '/icons/class.webp',
    helm: '/icons/helm.webp',
    cape: '/icons/cape.webp',
    potion: '/icons/pot.png',
    philtre: '/icons/feli.png',
    scroll: '/icons/questItem.png',
    elixir: '/icons/elixir.png',
    tonic: '/icons/tonic.png',
  };
  const svg = (body) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  const SVG_ICONS = {
    // round-bottomed flask
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    chevron: svg('<path d="m7 10 5 5 5-5"/>'),
    circle: svg('<circle cx="12" cy="12" r="8.5"/>'),
    check: svg('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4.3L20 16"/><path d="M20 21v-5h-5"/>'),
  };

  /** The icon for an equipment slot or a consumable's name ("Potent Malevolence Philtre"). */
  function iconFor(type) {
    const t = String(type || '').trim().toLowerCase();
    const key = IMAGE_ICONS[t] ? t : t.includes('philtre') ? 'philtre' : t.includes('scroll') ? 'scroll' : IMAGE_ICONS[t] ? t : 'potion';
    const holder = el('span', 'ce-icon');
    if (IMAGE_ICONS[key]) {
      const img = el('img');
      img.src = IMAGE_ICONS[key];
      img.alt = '';
      holder.append(img);
    } else {
      holder.innerHTML = SVG_ICONS[key];
    }
    return holder;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- the class search ----------

  /**
   * A search box over a list of items with a dropdown of matches, like the
   * website's command menu: type to filter, arrows and Enter to pick, Escape to
   * close. While closed it shows the chosen item.
   * @param {{items: {name: string, type?: string}[], placeholder: string, value: string,
   *          fallbackType?: string, onSelect: (item) => void}} options
   */
  function ClassSearch({ items, placeholder, value, fallbackType = 'Class', onSelect }) {
    const root = el('div', 'ce-search');
    const field = el('label', 'ce-search-field');
    const searchIcon = el('span', 'ce-search-icon');
    searchIcon.innerHTML = SVG_ICONS.search;
    const input = el('input', 'ce-search-input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    const listId = `ce-search-list-${Math.random().toString(36).slice(2, 8)}`;
    input.setAttribute('aria-controls', listId);
    const chevron = el('span', 'ce-search-chevron');
    chevron.innerHTML = SVG_ICONS.chevron;
    field.append(searchIcon, input, chevron);

    const list = el('ul', 'ce-search-list');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    root.append(field, list);

    let current = value;
    let matches = [];
    let active = 0;

    const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

    /** Whether every letter of the query appears in the name, in order. */
    function inOrder(name, query) {
      let at = 0;
      for (const ch of query) {
        at = name.indexOf(ch, at);
        if (at < 0) return false;
        at++;
      }
      return true;
    }

    /** Best matches first: name starts with the query, then a word does, then anywhere. */
    function filter(query) {
      const q = normalize(query);
      if (!q) return items.slice();
      const scored = [];
      for (const item of items) {
        const name = normalize(item.name);
        const words = name.split(' ');
        const initials = words.map((w) => w[0]).join('');
        let score = -1;
        if (name.startsWith(q)) score = 0;
        else if (words.some((w) => w.startsWith(q))) score = 1;
        else if (name.includes(q)) score = 2;
        else if (initials.startsWith(q.replace(/ /g, ''))) score = 3; // "vh" → Void Highlord
        else if (inOrder(name.replace(/ /g, ''), q.replace(/ /g, ''))) score = 4; // "vhl" → Void HighLord
        if (score >= 0) scored.push([score, item]);
      }
      return scored.sort((a, b) => a[0] - b[0]).map(([, item]) => item);
    }

    /** The name with the typed part marked. */
    function highlighted(name, query) {
      const span = el('span', 'ce-search-name');
      const q = query.trim().toLowerCase();
      const at = q ? name.toLowerCase().indexOf(q) : -1;
      if (at < 0) {
        span.textContent = name;
      } else {
        span.append(name.slice(0, at), el('mark', null, name.slice(at, at + q.length)), name.slice(at + q.length));
      }
      return span;
    }

    function render(query) {
      matches = filter(query);
      active = Math.max(0, matches.findIndex((item) => item.name === current));
      if (query.trim()) active = 0;
      list.replaceChildren();
      if (!matches.length) {
        list.append(el('li', 'ce-search-empty', 'No classes found.'));
        return;
      }
      matches.forEach((item, i) => {
        const option = el('li', 'ce-search-option');
        option.id = `${listId}-${i}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(item.name === current));
        option.append(iconFor(item.type || fallbackType), highlighted(item.name, query));
        if (item.name === current) option.append(Object.assign(el('span', 'ce-search-current'), { innerHTML: SVG_ICONS.check }));
        option.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the box
        option.addEventListener('click', () => choose(item));
        option.addEventListener('mousemove', () => setActive(i, false));
        list.append(option);
      });
      setActive(active, true);
    }

    function setActive(index, scroll) {
      const options = list.querySelectorAll('.ce-search-option');
      if (!options.length) return;
      active = (index + options.length) % options.length;
      options.forEach((option, i) => option.classList.toggle('is-active', i === active));
      input.setAttribute('aria-activedescendant', options[active].id);
      if (scroll) options[active].scrollIntoView({ block: 'nearest' });
    }

    function open() {
      if (!list.hidden) return;
      list.hidden = false;
      root.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      input.value = '';
      input.placeholder = current || placeholder;
      render('');
    }

    function close() {
      list.hidden = true;
      root.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      input.value = current;
      input.placeholder = placeholder;
    }

    function choose(item) {
      current = item.name;
      close();
      input.blur();
      onSelect(item);
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('blur', close);
    input.addEventListener('input', () => {
      if (list.hidden) open();
      render(input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) open();
        else setActive(active + (e.key === 'ArrowDown' ? 1 : -1), true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!list.hidden && matches[active]) choose(matches[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        input.blur();
      }
    });

    input.value = current;
    return {
      element: root,
      setValue(name) {
        current = name;
        if (list.hidden) input.value = name;
      },
    };
  }

  // ---------- the class card ----------

  const EQUIPMENT = [
    ['Weapon', 'sword'],
    ['Class', 'class'],
    ['Helm', 'helm'],
    ['Cape', 'cloak'],
  ];
  const CONSUMABLES = [
    ['Elixir', 'elixir'],
    ['Tonic', 'tonic'],
    ['Active', 'consumable'],
  ];

  /** One "icon  Label ......... value" line; the value slides when it changes. */
  function Row(label, iconType) {
    const row = el('div', 'ce-row');
    if (label === 'Active') row.classList.add('is-top');
    const term = el('dt', 'ce-row-label');
    const icon = iconFor(iconType);
    term.append(icon, label);
    const detail = el('dd', 'ce-row-value');
    row.append(term, detail);
    let shown = null;

    return {
      element: row,
      set(value, { animate = true, iconOf } = {}) {
        const text = value || '—';
        if (iconOf) {
          const next = iconFor(iconOf(value));
          term.firstChild.replaceWith(next);
        }
        if (text === shown) return;
        const span = el('span', 'ce-value', text);
        const old = detail.querySelector('.ce-value:not(.is-leaving)');
        if (old && animate) {
          old.classList.add('is-leaving');
          old.addEventListener('animationend', () => old.remove(), { once: true });
          setTimeout(() => old.remove(), TRANSITION_MS + 100); // in case animations are off
          span.classList.add('is-entering');
        } else if (old) {
          old.remove();
        }
        detail.append(span);
        shown = text;
      },
    };
  }

  /** The boss buttons (Standard first), with a green pill that slides to the chosen one. */
  function BossButtons(onSelect) {
    const wrap = el('div', 'ce-bosses');
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Loadout');
    const pill = el('span', 'ce-boss-pill');
    wrap.append(pill);
    let selected = null;
    let locked = false;

    function movePill(animate) {
      const button = wrap.querySelector('.ce-boss.is-selected');
      if (!button) {
        pill.hidden = true;
        return;
      }
      pill.hidden = false;
      pill.classList.toggle('no-motion', !animate);
      pill.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`;
      pill.style.width = `${button.offsetWidth}px`;
      pill.style.height = `${button.offsetHeight}px`;
    }

    function mark(animate) {
      for (const button of wrap.querySelectorAll('.ce-boss')) {
        const isSelected = button.dataset.boss === selected;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-checked', String(isSelected));
        button.tabIndex = isSelected ? 0 : -1;
        button.querySelector('.ce-boss-mark').innerHTML = isSelected ? SVG_ICONS.check : SVG_ICONS.circle;
      }
      movePill(animate);
    }

    wrap.addEventListener('click', (e) => {
      const button = e.target.closest('.ce-boss');
      if (!button || locked || button.dataset.boss === selected) return;
      selected = button.dataset.boss;
      mark(true);
      onSelect(selected);
      locked = true;
      wrap.classList.add('is-locked');
      setTimeout(() => {
        locked = false;
        wrap.classList.remove('is-locked');
      }, TRANSITION_MS);
    });
    wrap.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const buttons = [...wrap.querySelectorAll('.ce-boss')];
      const at = buttons.findIndex((b) => b.dataset.boss === selected);
      const next = buttons[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
    // The pill follows its button when the card reflows (window resized, columns change).
    new ResizeObserver(() => movePill(false)).observe(wrap);

    return {
      element: wrap,
      set(bosses, boss) {
        wrap.querySelectorAll('.ce-boss').forEach((b) => b.remove());
        for (const name of bosses) {
          const button = el('button', 'ce-boss');
          button.type = 'button';
          button.dataset.boss = name;
          button.setAttribute('role', 'radio');
          // Sheet names like "ultra-dage" read as "Ultra Dage" (capitalised by page.css).
          button.append(el('span', 'ce-boss-mark'), el('span', 'ce-boss-name', name.replace(/[-_]+/g, ' ')));
          wrap.append(button);
        }
        selected = boss;
        mark(false);
      },
    };
  }

  /**
   * The chosen class: name, boss buttons, the loadout, and the class picture.
   * update(entry) switches class; the chosen boss is kept when the new class has it.
   */
  function ClassCard() {
    const card = el('article', 'ce-card');
    const info = el('div', 'ce-card-info');
    const title = el('h3', 'ce-card-title');
    const media = el('div', 'ce-card-media');
    const image = el('img', 'ce-card-image');
    image.alt = '';
    image.decoding = 'async';
    image.addEventListener('load', () => media.classList.remove('is-missing', 'is-loading'));
    image.addEventListener('error', () => {
      media.classList.remove('is-loading');
      media.classList.add('is-missing');
    });
    media.append(image);

    let entry = null;
    let boss = STANDARD;
    const bosses = BossButtons((name) => {
      boss = name;
      show(true);
    });
    const equipment = EQUIPMENT.map(([label, key]) => [Row(label, label), key]);
    const consumables = CONSUMABLES.map(([label, key]) => [Row(label, label === 'Active' ? 'potion' : label), key]);
    const equipmentList = el('dl', 'ce-rows');
    equipmentList.append(...equipment.map(([row]) => row.element));
    const consumableList = el('dl', 'ce-rows');
    consumableList.append(...consumables.map(([row]) => row.element));

    info.append(title, el('hr', 'ce-sep'), bosses.element, el('hr', 'ce-sep'), equipmentList, el('hr', 'ce-sep'), consumableList);
    card.append(info, media);

    /** Standard first, then the bosses in the guide's order. */
    function bossNames() {
      const names = Object.keys(entry.bossLoadouts).filter((name) => name !== STANDARD);
      return [STANDARD, ...names];
    }

    function activeLoadout() {
      return entry.bossLoadouts[boss] || entry.generalLoadout;
    }

    function show(animate) {
      const loadout = activeLoadout();
      for (const [row, key] of equipment) row.set(loadout[key], { animate });
      for (const [row, key] of consumables) {
        row.set(loadout[key], { animate, iconOf: key === 'consumable' ? (value) => value : null });
      }
    }

    return {
      element: card,
      update(next) {
        const sameClass = entry && entry.name === next.name;
        entry = next;
        title.textContent = entry.name;
        if (!entry.bossLoadouts[boss] && boss !== STANDARD) boss = STANDARD;
        bosses.set(bossNames(), boss);
        show(Boolean(sameClass));
        if (!sameClass) {
          media.classList.add('is-loading');
          media.classList.remove('is-missing');
          image.alt = entry.name;
          image.src = IMAGE_URL(entry.name);
        }
      },
    };
  }

  // ---------- the tab ----------

  function relativeTime(ms) {
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function start() {
    const root = document.getElementById('ce-root');
    if (!root) return;
    const host = window.lodestarPlugins;

    const footer = el('p', 'ce-footer');
    const footerText = el('span');
    const refresh = el('button', 'ce-refresh');
    refresh.type = 'button';
    refresh.innerHTML = `${SVG_ICONS.refresh}<span>Refresh</span>`;
    footer.append(footerText, refresh);

    let search = null;
    let card = null;
    let classes = [];

    function select(name) {
      const entry = classes.find((c) => c.name === name) || classes[0];
      card.update(entry);
      search.setValue(entry.name);
      try {
        localStorage.setItem(REMEMBER_KEY, entry.name);
      } catch {
        // storage blocked: just don't remember
      }
    }

    function showFooter(result) {
      footerText.textContent = result.stale
        ? `Couldn't reach aqw.app (${result.error}). Showing the guide from ${relativeTime(result.fetchedAt)}.`
        : `${classes.length} classes · updated ${relativeTime(result.fetchedAt)}`;
      footer.classList.toggle('is-stale', Boolean(result.stale));
    }

    async function load(refreshNow) {
      refresh.disabled = true;
      let result;
      try {
        result = await host.invoke(PLUGIN, 'classes', { refresh: refreshNow });
      } catch (err) {
        refresh.disabled = false;
        if (!classes.length) {
          const message = el('div', 'ce-error');
          const retry = el('button', 'pill-button', 'Try again');
          retry.type = 'button';
          retry.addEventListener('click', () => {
            root.replaceChildren(el('p', 'ce-hint', 'Loading the class guide…'));
            load(true);
          });
          message.append(el('p', null, `Couldn't load the class guide: ${err.message}`), retry);
          root.replaceChildren(message);
        } else {
          footerText.textContent = `Couldn't refresh: ${err.message}`;
          footer.classList.add('is-stale');
        }
        return;
      }
      refresh.disabled = false;
      const previous = search ? classes.find((c) => c.name === localStorage.getItem(REMEMBER_KEY))?.name : null;
      classes = result.classes.slice().sort((a, b) => a.name.localeCompare(b.name));

      let saved = previous;
      if (!saved) {
        try {
          saved = localStorage.getItem(REMEMBER_KEY);
        } catch {
          saved = null;
        }
      }
      const first = classes.find((c) => c.name === saved) || classes[0];

      search = ClassSearch({
        items: classes.map((c) => ({ name: c.name, type: 'Class' })),
        placeholder: 'Search classes…',
        value: first.name,
        fallbackType: 'Class',
        onSelect: (item) => select(item.name),
      });
      card = ClassCard();
      const box = el('div', 'ce-search-box');
      box.append(search.element);
      root.replaceChildren(box, card.element, footer);
      select(first.name);
      showFooter(result);
    }

    refresh.addEventListener('click', () => load(true));
    if (!host) {
      root.textContent = 'This page only works in the Lodestar desktop app.';
      return;
    }
    load(false);
  }

  start();
})();
