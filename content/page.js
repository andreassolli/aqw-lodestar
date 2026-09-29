// Which site/page this content script is running on.
const PAGE = {
  isWiki: location.hostname === 'aqwwiki.wikidot.com',
  isAqcloset: location.hostname === 'aqcloset.com',
  isAccount: location.hostname === 'account.aq.com',
  isCharPage: location.href.includes('account.aq.com/CharPage'),
  isInventory: location.href.includes('account.aq.com/AQW/Inventory'),
};

// Content CSS can't portably reference extension files (the URL scheme differs
// between Chrome and Firefox), so expose the ones it needs as CSS variables.
for (const [name, file] of [['circle', 'circle.png'], ['circlecheck', 'circlecheck.png']]) {
  document.documentElement.style.setProperty(`--aqwt-icon-${name}`, `url("${ext.runtime.getURL(`icons/${file}`)}")`);
}
