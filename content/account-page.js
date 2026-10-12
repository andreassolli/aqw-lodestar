// account.aq.com: rarity badges on item links (from the daily item catalog), a
// "try on" button that opens the character's outfit in the AQCloset wardrobe
// (built from the character page's own FlashVars), and a menu to download the
// character's picture (render/capture.js, render/main-world.js).
(() => {
  /** Wiki path of an item link ("/void-highlord-class"), or null. */
  function linkPath(link) {
    const href = link.getAttribute('href');
    const path = href && href.split('.com')[1];
    return path || null;
  }

  /**
   * Adds rarity badges to item links, looked up in the daily item catalog (by
   * name, then by wiki path) through the background. Links are checked once.
   */
  async function tagLinks(links) {
    const todo = links.filter((link) => !link.dataset.aqwtRarity && !link.querySelector('.aqwt-rarity'));
    if (!todo.length) return;
    todo.forEach((link) => (link.dataset.aqwtRarity = '1'));

    const response = await lookupItems(todo.map((link) => ({ name: getItemLinkLabel(link), path: linkPath(link) })));
    if (!response || !Array.isArray(response.items)) {
      todo.forEach((link) => delete link.dataset.aqwtRarity); // try again with the next batch
      return;
    }
    response.items.forEach((match, i) => {
      if (!match) return;
      const key = RARITY_LABELS[match.rarity] ? match.rarity : getRarity(match);
      if (key && !todo[i].querySelector('.aqwt-rarity')) todo[i].appendChild(createRarityBadge(key));
    });
  }

  function tagItemLinks() {
    tagLinks([...document.querySelectorAll('a.item')]);

    // The inventory table fills in after load: collect new links and look them up once per frame.
    let pending = [];
    let scheduled = false;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('a.item')) pending.push(node);
          pending.push(...node.querySelectorAll('a.item'));
        }
      }
      if (scheduled || !pending.length) return;
      scheduled = true;
      requestAnimationFrame(() => {
        const links = pending.filter((link) => link.isConnected);
        pending = [];
        scheduled = false;
        tagLinks(links);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  const SHIRT_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
    </svg>`;

  /** The character page's FlashVars (the outfit it shows), or null. */
  function readFlashVars() {
    const param = [...document.querySelectorAll('param')].find((p) => p.name.toLowerCase() === 'flashvars');
    if (param && param.value) return param.value;
    const embed = document.querySelector('embed[flashvars]');
    if (embed) return embed.getAttribute('flashvars');
    // The Flash player script (Ruffle) may have replaced the original elements.
    const match = document.documentElement.innerHTML.match(/(?:name="FlashVars" value|flashvars)="([^"]*)"/i);
    if (!match) return null;
    const decoder = document.createElement('textarea');
    decoder.innerHTML = match[1];
    return decoder.value;
  }

  const pageFlashVars = readFlashVars(); // read early, before the Flash player script changes the page

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
      const flashVars = pageFlashVars || readFlashVars();
      const shownCharacter = flashVars ? Aqcloset.parseFlashVars(flashVars).strName || '' : '';

      // The page already describes the outfit; only ask AQCloset when the name in
      // the box is a different character that hasn't been searched yet.
      if (flashVars && (!username || username.toLowerCase() === shownCharacter.toLowerCase())) {
        window.open(Aqcloset.wardrobeUrlFromFlashVars(flashVars), '_blank', 'noopener');
        return;
      }
      ext.runtime.sendMessage({ type: 'OPEN_WARDROBE', username }).catch(() => {});
    });

    column.appendChild(button);
  }

  addTryOnButton();

  const RENDER_SCALE = 3;
  const RENDER_DELAY_MS = 4000; // ms the SWF runs before capture; tune for the pose you want

  const DOWNLOAD_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
    </svg>`;

  function shownCharacterName() {
    const flashVars = pageFlashVars || readFlashVars();
    const fromPage = flashVars ? Aqcloset.parseFlashVars(flashVars).strName : '';
    const name = (fromPage || document.querySelector('input.form-control[name="id"]')?.value || '').trim();
    return name.replace(/[^\w.-]/g, '_') || 'character';
  }

  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* Option 1: the image Ruffle is showing on this page */
  function findPageCanvas() {
    const host = document.querySelector('ruffle-player, ruffle-embed, ruffle-object');
    return host?.shadowRoot?.querySelector('canvas') || null;
  }

  async function downloadShown() {
    const canvas = findPageCanvas();
    if (!canvas) throw new Error('The character is not rendered on this page yet');
    saveBlob(await AqwCapture.grabBlob(canvas), `${shownCharacterName()}.webp`);
  }

  async function renderWithOwnSwf(flashVars) {
    const swf = ext.runtime.getURL('render/CharacterRender.swf');
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Rendering timed out')), 60000);

      function onMessage(e) {
        if (e.source !== window || e.data?.source !== 'aqwt-render-result' || e.data.id !== id) return;
        finish(e.data.ok ? null : new Error(e.data.error), e.data.blob);
      }
      function finish(err, blob) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        err ? reject(err) : resolve(blob);
      }

      window.addEventListener('message', onMessage);
      window.postMessage(
        { source: 'aqwt-render-request', id, swf, flashVars, scale: RENDER_SCALE, delay: RENDER_DELAY_MS },
        location.origin,
      );
    });
  }

  async function downloadCustom() {
    const flashVars = pageFlashVars || readFlashVars();
    if (!flashVars) throw new Error('No FlashVars found on this page');
    saveBlob(await renderWithOwnSwf(flashVars), `${shownCharacterName()}-hd.webp`);
  }

  /* UI: one button, small menu */
  function addDownloadMenu() {
    if (document.getElementById('aqwt-download-menu')) return;
    const column = document.querySelector('.col-3.col-md-4.col-lg-4');
    if (!column || !document.querySelector('input.btn.btn-primary[type="submit"][value="Search"]')) return;

    const wrap = document.createElement('div');
    wrap.id = 'aqwt-download-menu';
    wrap.style.cssText = 'position:relative;display:inline-block';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.title = 'Download character image';
    button.insertAdjacentHTML('beforeend', DOWNLOAD_ICON);

    const menu = document.createElement('div');
    menu.style.cssText =
      'display:none;position:absolute;z-index:1000;top:100%;left:0;min-width:230px;padding:4px 0;' +
      'background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.2)';

    async function run(action) {
      menu.style.display = 'none';
      button.disabled = true;
      try {
        await action();
      } catch (err) {
        console.error(err);
        alert(`Download failed: ${err.message}`);
      } finally {
        button.disabled = false;
      }
    }

    for (const [label, action] of [
      ['Image shown on this page', downloadShown],
      ['Render with custom SWF (HD)', downloadCustom],
    ]) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = label;
      item.style.cssText =
        'display:block;width:100%;padding:6px 12px;border:0;background:none;text-align:left;cursor:pointer;color:#212529';
      item.addEventListener('mouseenter', () => (item.style.background = '#f1f3f5'));
      item.addEventListener('mouseleave', () => (item.style.background = 'none'));
      item.addEventListener('click', () => run(action));
      menu.appendChild(item);
    }

    button.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) menu.style.display = 'none';
    });

    wrap.append(button, menu);
    column.appendChild(wrap);
  }

  function makeSearchRowFlex() {
    const row = document.querySelector('input.form-control[name="id"]')?.closest('.row');
    row?.classList.add('aqwt-search-row');
  }

  addDownloadMenu();
  makeSearchRowFlex();
  tagItemLinks();
})();
