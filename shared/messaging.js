// Content-script / popup side of the background fetch API.
// background.js defines functions with the same names that fetch directly,
// so shared modules (aqcloset.js, wiki-parser.js) work in every context.

async function sendToBackground(message) {
  try {
    return (await ext.runtime.sendMessage(message)) ?? null;
  } catch {
    return null; // background unavailable, or the extension was reloaded
  }
}

/**
 * @param {string} url
 * @param {{timeoutMs?: number}} [options] - default 6s; the background caps it at 60s
 * @returns {Promise<{html: string, baseUrl: string}|{error: string}|null>}
 *   null only when the background couldn't be reached at all
 */
function fetchPage(url, options = {}) {
  return sendToBackground({ type: 'FETCH_PAGE', url, timeoutMs: options.timeoutMs });
}

/** @returns {Promise<string|null>} */
function fetchText(url) {
  return sendToBackground({ type: 'FETCH_TEXT', url });
}
