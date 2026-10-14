// Wiki item pages where Imgur is blocked (see shared/image-proxy.js): the
// item's own picture is swapped for its AQCloset thumbnail when AQCloset has an
// item with exactly this name, and loaded through the image proxy otherwise.
// Other Imgur images on the page are proxied by ImageProxy itself.
(() => {
  if (!PAGE.isWiki || location.pathname.startsWith('/search-items-by-tag')) return;
  if (!WikiParser.isItemPage(document) || WikiParser.isNonItemCategory(document)) return;

  const content = document.getElementById('page-content');
  if (!content) return;

  // ImageProxy may already have pointed an image at the proxy; it keeps the original.
  const originalSrc = (img) => img.getAttribute(ImageProxy.ORIGINAL_ATTR) || img.getAttribute('src') || '';

  // The item's picture: the male/female tabs if there are any, otherwise the
  // first Imgur image on the page.
  const tabImages = ['#wiki-tab-0-0 img', '#wiki-tab-0-1 img'].map((s) => content.querySelector(s)).filter(Boolean);
  const itemImages = (tabImages.length ? tabImages : [...content.querySelectorAll('img')])
    .filter((img) => ImageProxy.isImgur(originalSrc(img)))
    .slice(0, tabImages.length ? 2 : 1);
  if (!itemImages.length) return;

  // Claimed, so ImageProxy leaves them to this script.
  const originals = new Map(itemImages.map((img) => [img, new URL(originalSrc(img), location.href).href]));
  itemImages.forEach((img) => img.setAttribute(ImageProxy.OWNER_ATTR, 'wiki-images'));

  let closetPromise = null;
  const findOnCloset = () => {
    const name = getBaseName(WikiParser.getTitle(document) || '');
    closetPromise = closetPromise || Aqcloset.findItemPreview(name, { exact: true }).catch(() => ({ images: [] }));
    return closetPromise;
  };

  function showOriginal(img) {
    img.onerror = null;
    img.removeAttribute(ImageProxy.ORIGINAL_ATTR);
    img.classList.remove('aqwt-closet-image');
    img.removeAttribute('title');
    img.src = originals.get(img);
  }

  async function replace() {
    const { images } = await findOnCloset();
    if (!ImageProxy.isActive()) return; // turned off while AQCloset answered

    itemImages.forEach((img, i) => {
      const original = originals.get(img);
      const closet = images[Math.min(i, images.length - 1)];
      if (!closet) {
        ImageProxy.useProxy(img, original);
        return;
      }
      img.onerror = () => {
        img.onerror = null;
        img.classList.remove('aqwt-closet-image');
        ImageProxy.useProxy(img, original); // thumbnail missing: proxy the wiki image after all
      };
      img.classList.add('aqwt-closet-image');
      img.title = 'Picture from AQCloset (Imgur is blocked here)';
      img.src = closet;
    });
  }

  function apply(active) {
    if (active) replace();
    else itemImages.forEach(showOriginal);
  }

  ImageProxy.ready.then(() => {
    apply(ImageProxy.isActive());
    ImageProxy.onChange(apply);
  });
})();
