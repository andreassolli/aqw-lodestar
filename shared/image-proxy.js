// Imgur blocks the UK (every image turns into a "not available" picture) and most
// wiki images are on Imgur. Where it's blocked we load them through a proxy
// instead, and wiki-images.js swaps the item picture for the AQCloset one.
//
// Every Imgur <img> gets handled, including ones added later. Images with
// data-aqwt-image-owner are left to whoever owns them.
const ImageProxy = (() => {
  // Tried in order until one works. Imgur rate limits busy proxies, so we have a
  // few. The last one that worked goes first next time.
  const enc = encodeURIComponent;
  const PROXIES = [
    { name: 'duckduckgo', build: (u) => `https://external-content.duckduckgo.com/iu/?u=${enc(u)}` },
    { name: 'wp.com', build: (u) => `https://i0.wp.com/${u.replace(/^https?:\/\//, '')}?ssl=1` },
    { name: 'google', build: (u) => `https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&url=${enc(u)}` },
    { name: 'wsrv.nl', build: (u) => `https://wsrv.nl/?n=-1&url=${enc(u)}` }, // n=-1 keeps GIFs animated
  ];
  const PREFERRED_KEY = 'imgurProxyPreferred';
  const ORIGINAL_ATTR = 'data-aqwt-original-src';
  const OWNER_ATTR = 'data-aqwt-image-owner';

  let active = false;
  let preferred = 0;
  const listeners = [];
  const hasDocument = typeof document !== 'undefined';
  const handled = new WeakSet();
  const proxiedOriginals = new Map();

  function isImgur(src) {
    try {
      const host = new URL(src, location.href).hostname;
      return host === 'imgur.com' || host.endsWith('.imgur.com');
    } catch {
      return false;
    }
  }

  const absolute = (src) => new URL(src, location.href).href;

  function proxied(src, attempt = 0) {
    return PROXIES[(preferred + attempt) % PROXIES.length].build(absolute(src));
  }

  function url(src) {
    if (!active || !src || !isImgur(src)) return src;
    const result = proxied(src);
    proxiedOriginals.set(result, absolute(src));
    return result;
  }

  function remember(index) {
    if (index === preferred) return;
    preferred = index;
    ext.storage.local.set({ [PREFERRED_KEY]: PROXIES[index].name }).catch(() => {});
  }

  // On error move to the next proxy. When one works it becomes the first choice.
  function useProxy(img, original, currentAttempt = null, onFail = null) {
    img.setAttribute(ORIGINAL_ATTR, original);
    img.removeAttribute('srcset');
    let attempt = currentAttempt ?? 0;
    const start = preferred;
    const done = () => {
      img.removeEventListener('error', onError);
      img.removeEventListener('load', onLoad);
      handled.delete(img);
    };
    const stillOurs = () => img.getAttribute(ORIGINAL_ATTR) === original;
    function onError() {
      if (!stillOurs()) return done();
      if (++attempt >= PROXIES.length) {
        done();
        if (onFail) onFail();
        return;
      }
      img.src = PROXIES[(start + attempt) % PROXIES.length].build(original);
    }
    function onLoad() {
      if (stillOurs()) remember((start + attempt) % PROXIES.length);
      done();
    }
    handled.add(img);
    img.addEventListener('error', onError);
    img.addEventListener('load', onLoad);
    if (currentAttempt === null) img.src = PROXIES[start].build(original);
  }

  function restore(img) {
    if (!img.hasAttribute(ORIGINAL_ATTR)) return;
    img.src = img.getAttribute(ORIGINAL_ATTR);
    img.removeAttribute(ORIGINAL_ATTR);
  }

  function rewrite(img) {
    if (img.hasAttribute(OWNER_ATTR) || handled.has(img)) return;
    if (!active) return restore(img);
    const current = img.getAttribute('src');
    if (!current) return;
    if (isImgur(current)) useProxy(img, absolute(current));
    // Set from url() somewhere else, give it the fallbacks too.
    else if (proxiedOriginals.has(current)) useProxy(img, proxiedOriginals.get(current), 0);
  }

  const rewriteAll = (root) => {
    if (root.tagName === 'IMG') rewrite(root);
    root.querySelectorAll?.('img').forEach(rewrite);
  };

  async function isBlockedHere() {
    const hints = hasDocument ? [...document.images].map((img) => img.src).filter(isImgur).slice(0, 5) : [];
    try {
      const result = await ext.runtime.sendMessage({ type: 'CHECK_IMGUR', hints });
      return !!(result && result.blocked);
    } catch {
      return false;
    }
  }

  async function computeActive() {
    const stored = await ext.storage.local.get(PREFERRED_KEY);
    const pick = PROXIES.findIndex((proxy) => proxy.name === stored[PREFERRED_KEY]);
    if (pick >= 0) preferred = pick;
    // Only replace where Imgur is blocked. The old imgurImages setting is ignored.
    return isBlockedHere();
  }

  async function update() {
    const next = await computeActive();
    const changed = next !== active;
    active = next;
    if (hasDocument) rewriteAll(document);
    if (changed) listeners.forEach((fn) => fn(active));
  }

  const ready = update().catch(() => {});

  if (hasDocument) {
    ready.then(() => {
      new MutationObserver((mutations) => {
        if (!active) return;
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') rewrite(mutation.target);
          else mutation.addedNodes.forEach((node) => node.nodeType === Node.ELEMENT_NODE && rewriteAll(node));
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    });
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[PREFERRED_KEY]) {
      const pick = PROXIES.findIndex((proxy) => proxy.name === changes[PREFERRED_KEY].newValue);
      if (pick >= 0) preferred = pick;
    }
    if (changes[STORAGE_KEYS.imgurCheck]) update();
  });

  return {
    url,
    proxied,
    useProxy,
    isImgur,
    ready,
    OWNER_ATTR,
    ORIGINAL_ATTR,
    isActive: () => active,
    onChange: (fn) => listeners.push(fn),
  };
})();
