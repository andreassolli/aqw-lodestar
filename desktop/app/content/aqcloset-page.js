// aqcloset.com: a switch for the hover tooltip, and real wiki links on item
// names so the right-click "Add to Items to farm" / "Try on" menus work there.
(() => {
  // Registered from JS so the font URL works in both Chrome and Firefox.
  const poppins = new FontFace('Poppins', `url(${ext.runtime.getURL('fonts/Poppins-Regular.ttf')})`, { weight: '400' });
  poppins.load().then((font) => document.fonts.add(font)).catch(() => {});

  function addTooltipToggle() {
    const header = document.querySelector('#sort-row');
    if (!header || document.getElementById('toggle-tooltip')) return;
    header.insertAdjacentHTML(
      'beforeend',
      `<div class="toggle-tooltip">
         <input type="checkbox" id="toggle-tooltip" />
         <label for="toggle-tooltip"><span>Toggle tooltip</span></label>
       </div>`
    );
  }

  function linkItem(object) {
    if (object.dataset.aqwtLinked === '1') return;
    const nameEl = object.querySelector('.label .name');
    const url = nameEl && wikiUrlFromName(nameEl.textContent);
    if (!url) return;

    object.dataset.aqwtLinked = '1';

    const link = nameEl.tagName === 'A' ? nameEl : document.createElement('a');
    if (link !== nameEl) {
      nameEl.replaceWith(link);
      link.appendChild(nameEl);
    }
    link.href = url;
    link.dataset.aqwtGenerated = '1'; // hover-tooltip.js handles these via the .object branch
    link.style.color = 'inherit';
    link.style.textDecoration = 'inherit';
    // Keep AQCloset's own click behavior; only block navigating to the wiki.
    link.addEventListener('click', (e) => e.preventDefault());
  }

  addTooltipToggle();
  document.querySelectorAll('.object').forEach(linkItem);

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('.object')) linkItem(node);
        node.querySelectorAll('.object').forEach(linkItem);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
