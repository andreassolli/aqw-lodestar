// account.aq.com (content script): turns the character's Flash canvas into an
// image file, cropped to the character. Used by account-page.js for "Image shown
// on this page"; render/main-world.js has its own copy for the HD render.
(() => {
  /**
   * Draws a canvas into a 2D canvas and encodes it. The draw happens inside an
   * animation frame because a WebGL canvas can be cleared once its frame is shown,
   * and empty frames are skipped until one has pixels.
   */
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
      if (maxX < 0) continue; // nothing drawn in this frame, try the next one

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

  globalThis.AqwCapture = { grabBlob };
})();
