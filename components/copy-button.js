// A chip that copies its text when you click it, like "/join manaharvest".
//
//   list.append(CopyButton.create('/join manaharvest', { className: 'join-command' }));
const CopyButton = (() => {
  const DONE_MS = 1200;

  function create(text, { className = '', title = `Copy "${text}"` } = {}) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: `copy-button ${className}`.trim(), title });
    const label = Object.assign(document.createElement('code'), { textContent: text });
    const done = Object.assign(document.createElement('span'), { className: 'copy-button-done', textContent: 'Copied', hidden: true });
    button.append(label, done);
    let timer = null;
    button.addEventListener('click', async () => {
      const ok = await copyToClipboard(text);
      done.textContent = ok ? 'Copied' : "Couldn't copy";
      done.hidden = false;
      button.classList.toggle('is-copied', ok);
      clearTimeout(timer);
      timer = setTimeout(() => {
        done.hidden = true;
        button.classList.remove('is-copied');
      }, DONE_MS);
    });
    return button;
  }

  return { create };
})();
