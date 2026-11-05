// Runs in the page's own JS world because it needs Ruffle, which content scripts
// can't see. account-page.js posts 'aqwt-render-request' and gets the image back
// as 'aqwt-render-result'. mode: 'shown' grabs the picture already on the page.
(() => {
  // From capture.js. Looked up when used so a missing file gives a clear error.
  const grabBlob = (...args) => {
    if (!globalThis.AqwCapture) throw new Error('render/capture.js did not load');
    return globalThis.AqwCapture.grabBlob(...args);
  };

  async function grabShown() {
    const host = document.querySelector('ruffle-player, ruffle-embed, ruffle-object');
    const canvas = host?.shadowRoot?.querySelector('canvas');
    if (!canvas) throw new Error('The character is not rendered on this page yet');
    return grabBlob(canvas);
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

    // Invisible but on screen so the browser doesn't throttle it.
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
        base: 'https://game.aq.com/', // game files resolve from here, not account.aq.com
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
      const blob = e.data.mode === 'shown' ? await grabShown() : await render(e.data);
      window.postMessage({ source: 'aqwt-render-result', id, ok: true, blob }, location.origin);
    } catch (err) {
      window.postMessage(
        { source: 'aqwt-render-result', id, ok: false, error: String(err?.message || err) },
        location.origin,
      );
    }
  });
})();
