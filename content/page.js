const PAGE = {
  isWiki: location.hostname === 'aqwwiki.wikidot.com',
  isAqcloset: location.hostname === 'aqcloset.com',
  isAccount: location.hostname === 'account.aq.com',
  isCharPage: location.href.includes('account.aq.com/CharPage'),
  isInventory: location.href.includes('account.aq.com/AQW/Inventory'),
  isBonusPacks: location.hostname === 'account.aq.com' && location.pathname.toLowerCase() === '/aqw/choosebonus',
};

// Content CSS can't point at extension files the same way in Chrome and
// Firefox, so we pass them in as CSS variables.
for (const [name, file] of [['circle', 'circle.png'], ['circlecheck', 'circlecheck.png']]) {
  document.documentElement.style.setProperty(`--aqwt-icon-${name}`, `url("${ext.runtime.getURL(`icons/${file}`)}")`);
}
