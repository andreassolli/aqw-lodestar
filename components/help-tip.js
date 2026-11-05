// The little "?" next to a heading. Hover shows the text, click keeps it open.
//
//   <h3>Backup <button type="button" class="help-tip" data-help="Longer text"></button></h3>
//   HelpTip.init(document);
const HelpTip = (() => {
  const MARGIN = 8; // px kept between the bubble and the window's edges
  let bubble = null;
  let shownFor = null;
  let pinned = false;

  function ensureBubble() {
    if (bubble) return bubble;
    bubble = Object.assign(document.createElement('div'), { className: 'help-tip-bubble', id: 'help-tip-bubble', hidden: true });
    bubble.setAttribute('role', 'tooltip');
    document.body.append(bubble);
    return bubble;
  }

  function show(tip, { pin = false } = {}) {
    const box = ensureBubble();
    box.textContent = tip.dataset.help;
    box.hidden = false;
    shownFor = tip;
    pinned = pin;
    tip.setAttribute('aria-describedby', box.id);
    tip.setAttribute('aria-expanded', String(pin));
    const at = tip.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - MARGIN * 2);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(MARGIN, Math.min(at.left + at.width / 2 - width / 2, window.innerWidth - width - MARGIN))}px`;
    const below = at.bottom + 6;
    box.style.top = `${below + box.offsetHeight > window.innerHeight - MARGIN ? Math.max(MARGIN, at.top - 6 - box.offsetHeight) : below}px`;
  }

  function hide() {
    if (!bubble || bubble.hidden) return;
    bubble.hidden = true;
    shownFor?.removeAttribute('aria-describedby');
    shownFor?.setAttribute('aria-expanded', 'false');
    shownFor = null;
    pinned = false;
  }

  function init(root = document) {
    const tipOf = (target) => target.closest?.('.help-tip[data-help]');
    root.addEventListener('mouseover', (e) => {
      const tip = tipOf(e.target);
      if (tip && !pinned) show(tip);
    });
    root.addEventListener('mouseout', (e) => {
      if (tipOf(e.target) && !pinned) hide();
    });
    root.addEventListener('focusin', (e) => {
      const tip = tipOf(e.target);
      if (tip && !pinned) show(tip);
    });
    root.addEventListener('focusout', (e) => {
      if (tipOf(e.target) && !pinned) hide();
    });
    root.addEventListener('click', (e) => {
      const tip = tipOf(e.target);
      if (!tip) {
        if (pinned && !bubble.contains(e.target)) hide();
        return;
      }
      e.preventDefault(); // a "?" inside a <label> mustn't flip its switch
      if (pinned && shownFor === tip) hide();
      else show(tip, { pin: true });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
    // Hide on scroll since the bubble would be in the wrong spot.
    document.addEventListener('scroll', hide, true);
    const label = (tip) => {
      if (!tip.getAttribute('aria-label')) tip.setAttribute('aria-label', 'More about this');
      if (!tip.textContent.trim()) tip.textContent = '?';
    };
    root.querySelectorAll?.('.help-tip[data-help]').forEach(label);
    new MutationObserver(() => root.querySelectorAll?.('.help-tip[data-help]:not([aria-label])').forEach(label)).observe(
      root.body || root,
      { childList: true, subtree: true }
    );
  }

  return { init, hide };
})();
