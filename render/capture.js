// Turns the character canvas into an image cropped to the character. Runs in the
// page's world right before main-world.js. Only load it there, a file listed for
// both worlds might only run in one.
(() => {
  const ALPHA_MIN = 16; // fainter than this doesn't count (glow edges)
  const BACKGROUND_TOLERANCE = 28; // how close to the background color still counts as background
  const PADDING = 4; // px around the character

  // Box around everything that isn't transparent or background. The background
  // is the corner color if all four corners match, otherwise only transparency counts.
  function characterBox({ data, width, height }) {
    const at = (x, y) => (y * width + x) * 4;
    const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
    const near = (i, j, tolerance) => Math.max(...[0, 1, 2, 3].map((k) => Math.abs(data[i + k] - data[j + k]))) <= tolerance;
    const background = corners.every((corner) => near(corner, corners[0], 12)) && data[corners[0] + 3] > ALPHA_MIN ? corners[0] : null;

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = at(x, y);
        if (data[i + 3] <= ALPHA_MIN) continue;
        if (background !== null && near(i, background, BACKGROUND_TOLERANCE)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    const x = Math.max(0, minX - PADDING);
    const y = Math.max(0, minY - PADDING);
    return { x, y, width: Math.min(width, maxX + PADDING + 1) - x, height: Math.min(height, maxY + PADDING + 1) - y };
  }

  // Draws the canvas inside a frame since WebGL can clear it right after. Skips
  // empty frames until the character shows up.
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

      const box = characterBox(snap.ctx.getImageData(0, 0, snap.c.width, snap.c.height));
      if (!box) continue; // empty frame, try the next one

      let out = snap.c;
      if (crop) {
        out = document.createElement('canvas');
        out.width = box.width;
        out.height = box.height;
        out.getContext('2d').drawImage(snap.c, -box.x, -box.y);
      }
      return new Promise((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, quality),
      );
    }
    throw new Error('The canvas stayed empty');
  }

  globalThis.AqwCapture = { grabBlob, characterBox };
})();
