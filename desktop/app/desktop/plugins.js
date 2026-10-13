// Desktop app: plugin pages as tabs, and Settings → Plugins (install, turn on
// or off, remove). Loaded after desktop.js (see scripts/copy-extension.mjs).
// The plugins themselves are run by desktop/plugin-host.js in the main process.
(() => {
  const host = window.lodestarPlugins;
  if (!host) return;

  const PUZZLE_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.4 4.2a2.3 2.3 0 1 0-4.6 0V6H7a1 1 0 0 0-1 1v3.8h1.8a2.3 2.3 0 1 1 0 4.6H6V19a1 1 0 0 0 1 1h3.8v-1.8a2.3 2.3 0 1 1 4.6 0V20H19a1 1 0 0 0 1-1v-3.8h-1.8a2.3 2.3 0 1 1 0-4.6H20V7a1 1 0 0 0-1-1h-3.6z"/></svg>';

  // ---------- plugin pages as tabs ----------

  async function addPages() {
    const tabs = document.querySelector('.tabs');
    const settingsView = document.getElementById('settings-view');
    if (!tabs || !settingsView) return;

    for (const page of await host.pages()) {
      const name = `plugin-${page.id}`;

      const button = document.createElement('button');
      button.className = 'tab';
      button.type = 'button';
      button.id = `tab-${name}`;
      button.setAttribute('role', 'tab');
      button.dataset.tab = name;
      button.setAttribute('aria-controls', `${name}-view`);
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      if (page.icon) {
        // A mask, so the plugin's icon takes the tab's text colour like the built-in ones.
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.style.setProperty('--icon', `url("${page.icon}")`);
        button.append(icon);
      } else {
        button.insertAdjacentHTML('beforeend', PUZZLE_ICON);
      }
      const label = document.createElement('span');
      label.textContent = page.title;
      button.append(label);
      tabs.append(button);

      const panel = document.createElement('section');
      panel.id = `${name}-view`;
      panel.className = 'tab-panel tab-page plugin-page';
      panel.dataset.plugin = page.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.hidden = true;
      settingsView.before(panel);

      try {
        if (page.css) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = page.css;
          document.head.append(link);
        }
        if (page.html) panel.innerHTML = await (await fetch(page.html)).text();
        if (page.script) {
          const script = document.createElement('script');
          script.src = page.script;
          script.dataset.plugin = page.id;
          document.body.append(script);
        }
      } catch (err) {
        panel.textContent = `Couldn't load this plugin's page: ${err.message}`;
      }
    }
    Tabs.refresh();
  }

  // ---------- Settings → Plugins ----------

  const group = document.createElement('div');
  group.className = 'settings-group plugins-group';
  group.innerHTML = `
    <h3>Plugins</h3>
    <p class="settings-hint">Extra features that aren't part of the standard app. Install one from its .zip file; changes apply when Lodestar restarts.</p>
    <ul class="plugin-list" id="plugin-list"></ul>
    <div class="settings-actions">
      <button type="button" id="plugin-install" class="pill-button">Install plugin…</button>
      <button type="button" id="plugin-folder" class="pill-button">Open folder</button>
    </div>
    <div class="plugin-restart" id="plugin-restart" hidden>
      <span>Restart Lodestar to apply the changes.</span>
      <button type="button" id="plugin-restart-now" class="pill-button">Restart now</button>
    </div>
    <p id="plugin-status" class="check-status" role="status" hidden></p>`;
  const importGroup = document.getElementById('import-chrome')?.closest('.settings-group');
  const dataGroup = document.getElementById('export-data')?.closest('.settings-group');
  const anchor = importGroup || dataGroup;
  if (anchor) anchor.before(group);
  else document.getElementById('settings-view')?.append(group);

  const list = group.querySelector('#plugin-list');
  const statusLine = group.querySelector('#plugin-status');
  const restartBox = group.querySelector('#plugin-restart');
  let changed = false;

  function setStatus(message, isError = false) {
    statusLine.hidden = !message;
    statusLine.textContent = message || '';
    statusLine.classList.toggle('is-error', isError);
  }

  /** One line on what the plugin is doing, and what will change after a restart. */
  function describe(plugin) {
    if (plugin.pendingRemoval) return ['Removed when Lodestar restarts.', 'pending'];
    if (plugin.status === 'pending') return ['Installed. It starts when Lodestar restarts.', 'pending'];
    if (plugin.pendingUpdate) return ['New version installed. It starts when Lodestar restarts.', 'pending'];
    if (plugin.status === 'incompatible') return [`Can't run here: ${plugin.error}.`, 'error'];
    if (plugin.status === 'error') return [`Couldn't start: ${plugin.error}`, 'error'];
    if (plugin.status === 'running' && !plugin.enabled) return ['Turns off when Lodestar restarts.', 'pending'];
    if (plugin.status === 'disabled' && plugin.enabled) return ['Turns on when Lodestar restarts.', 'pending'];
    if (plugin.status === 'running') return [plugin.hasPage ? 'On. Its page is in the tab row.' : 'On.', 'on'];
    return ['Off.', 'off'];
  }

  function button(label, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pill-button plugin-action';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  async function act(fn, message) {
    try {
      await fn();
      changed = true;
      if (message) setStatus(message);
    } catch (err) {
      setStatus(err.message, true);
    }
    render();
  }

  async function render() {
    const plugins = await host.list();
    list.replaceChildren();
    if (!plugins.length) {
      const empty = document.createElement('li');
      empty.className = 'plugin-empty';
      empty.textContent = 'No plugins installed.';
      list.append(empty);
    }
    for (const plugin of plugins) {
      const item = document.createElement('li');
      item.className = 'plugin-item';

      const head = document.createElement('div');
      head.className = 'plugin-head';
      const title = document.createElement('strong');
      title.textContent = plugin.name;
      head.append(title);
      if (plugin.version) {
        const version = document.createElement('span');
        version.className = 'plugin-version';
        version.textContent = `v${plugin.version}`;
        head.append(version);
      }
      if (plugin.source === 'development') {
        const dev = document.createElement('span');
        dev.className = 'plugin-version';
        dev.textContent = 'from desktop/plugins';
        head.append(dev);
      }
      item.append(head);

      if (plugin.description) {
        const description = document.createElement('p');
        description.className = 'plugin-description';
        description.textContent = plugin.description;
        item.append(description);
      }

      const [text, kind] = describe(plugin);
      const state = document.createElement('p');
      state.className = `plugin-state is-${kind}`;
      state.textContent = text;
      item.append(state);

      const actions = document.createElement('div');
      actions.className = 'settings-actions plugin-actions';
      if (plugin.pendingRemoval) {
        actions.append(button('Keep', () => act(() => host.keep(plugin.id))));
      } else if (plugin.status !== 'pending' && plugin.status !== 'incompatible') {
        actions.append(
          button(plugin.enabled ? 'Turn off' : 'Turn on', () => act(() => host.setEnabled(plugin.id, !plugin.enabled)))
        );
      }
      if (!plugin.pendingRemoval && plugin.source !== 'development') {
        actions.append(button('Remove', () => act(() => host.remove(plugin.id))));
      }
      if (actions.childElementCount) item.append(actions);
      list.append(item);
    }

    const pending = plugins.some((plugin) => describe(plugin)[1] === 'pending');
    restartBox.hidden = !(pending || changed);
  }

  group.querySelector('#plugin-install').addEventListener('click', async () => {
    setStatus('');
    try {
      const installed = await host.install();
      if (!installed) return; // cancelled
      changed = true;
      setStatus(`${installed.replaces ? 'Updated' : 'Installed'} ${installed.name}${installed.version ? ` ${installed.version}` : ''}. Restart Lodestar to start it.`);
    } catch (err) {
      setStatus(`Couldn't install that plugin: ${err.message}`, true);
    }
    render();
  });
  group.querySelector('#plugin-folder').addEventListener('click', () => host.openFolder());
  group.querySelector('#plugin-restart-now').addEventListener('click', () => host.restart());

  render();
  addPages();
})();
