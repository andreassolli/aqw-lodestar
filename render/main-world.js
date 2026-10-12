// Runs in the page's own JavaScript world (manifest "world": "MAIN") on
// account.aq.com, because it needs the page's Ruffle Flash player
// (window.RufflePlayer), which content scripts can't see. account-page.js asks
// for a render with window.postMessage({ source: 'aqwt-render-request', ... })
// and gets the image back as { source: 'aqwt-render-result', blob }.
// Everything stays inside this function so nothing leaks into the page.
(() => {
  /** Same as render/capture.js (used by content scripts); this world can't share code with them. */
  async function grabBlob(canvas, { crop = true, type = 'image/webp', quality = 0.92, tries = 30 } = {}) {
    for (let i = 0; i < tries; i++) {
      const snap = await new Promise((resolve) =>
        requestAnimationFrame(() => {
          const c = document.createElement('canvas');
          c.width = canvas.width;
          c.height = canvas.height;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(canvas, 0, 0);
          resolve({ c, ctx });
        }),
      );

      const { data, width, height } = snap.ctx.getImageData(0, 0, snap.c.width, snap.c.height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) continue;

      let out = snap.c;
      if (crop) {
        out = document.createElement('canvas');
        out.width = maxX - minX + 1;
        out.height = maxY - minY + 1;
        out.getContext('2d').drawImage(snap.c, -minX, -minY);
      }
      return new Promise((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality),
      );
    }
    throw new Error('The canvas stayed empty');
  }

  const W = 640;
  const H = 370;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout, message) {
    const end = performance.now() + timeout;
    while (performance.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(50);
    }
    throw new Error(message);
  }

  async function render({ swf, flashVars, scale, delay }) {
    await waitFor(() => window.RufflePlayer, 10000, "The page's Ruffle is not available");

    // Invisible but inside the viewport, so the browser doesn't throttle it
    const host = document.createElement('div');
    host.style.cssText =
      `position:fixed;top:0;left:0;width:${W * scale}px;height:${H * scale}px;` +
      'opacity:0;pointer-events:none;z-index:-1;overflow:hidden';
    document.body.appendChild(host);

    try {
      const player = window.RufflePlayer.newest().createPlayer();
      player.style.width = `${W * scale}px`;
      player.style.height = `${H * scale}px`;
      host.appendChild(player);

      const t0 = performance.now();
      player.load({
        url: swf,
        allowScriptAccess: true,
        base: 'https://game.aq.com/', // relative game-file paths resolve here, not on account.aq.com
        parameters: Object.fromEntries(new URLSearchParams(flashVars)),
        wmode: 'transparent',
        letterbox: 'off',
        autoplay: 'on',
        splashScreen: false,
        unmuteOverlay: 'hidden',
        quality: 'best',
        scale: 'showAll',
        forceScale: true,
      });

      const canvas = await waitFor(
        () => player.shadowRoot?.querySelector('canvas'),
        20000,
        'Ruffle did not start',
      );
      await sleep(Math.max(0, delay - (performance.now() - t0)));
      return await grabBlob(canvas);
    } finally {
      host.remove();
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'aqwt-render-request') return;
    const { id } = e.data;
    try {
      const blob = await render(e.data);
      window.postMessage({ source: 'aqwt-render-result', id, ok: true, blob }, location.origin);
    } catch (err) {
      window.postMessage(
        { source: 'aqwt-render-result', id, ok: false, error: String(err?.message || err) },
        location.origin,
      );
    }
  });
})();
