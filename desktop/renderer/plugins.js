// Desktop: plugin pages as tabs, and the Plugins section in Settings.
// The plugins themselves run in plugin-host.js.
(() => {
  const host = window.lodestarPlugins;
  if (!host) return;

  // Set when a plugin page is popped out, then only that page shows.
  const POPOUT = new URLSearchParams(location.search).get('popout');
  const POPOUT_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

  const PUZZLE_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.4 4.2a2.3 2.3 0 1 0-4.6 0V6H7a1 1 0 0 0-1 1v3.8h1.8a2.3 2.3 0 1 1 0 4.6H6V19a1 1 0 0 0 1 1h3.8v-1.8a2.3 2.3 0 1 1 4.6 0V20H19a1 1 0 0 0 1-1v-3.8h-1.8a2.3 2.3 0 1 1 0-4.6H20V7a1 1 0 0 0-1-1h-3.6z"/></svg>';

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
        // A mask so the icon takes the tab's text color.
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
        if (page.popout && !POPOUT) panel.prepend(popoutButton(page));
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

    if (POPOUT) {
      const page = (await host.pages()).find((p) => `plugin-${p.id}` === POPOUT);
      document.documentElement.classList.add('is-popout');
      if (page) document.title = `${page.title} – AQW Lodestar`;
      Tabs.show(POPOUT, { remember: false }); // leaves the main window's remembered tab alone
    }
  }

  function popoutButton(page) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-button plugin-popout';
    button.title = 'Open in its own window';
    button.setAttribute('aria-label', `Open ${page.title} in its own window`);
    button.innerHTML = POPOUT_ICON;
    button.addEventListener('click', () => host.popout(page.id).catch((err) => console.error(err)));
    return button;
  }

  // Our own plugins get switches in Features. The Plugins section is only for
  // installing, updating and removing zips.
  const OWN_PLUGINS = ['item-lists', 'class-enhancements', 'ultra-assistant'];
  const isOwn = (plugin) => plugin.builtIn || plugin.source === 'development' || OWN_PLUGINS.includes(plugin.id);

  const featuresGroup = document.getElementById('features-group');
  const featuresHelp = document.getElementById('features-help');
  if (featuresHelp) featuresHelp.dataset.help = "Turn off what you don't use. A change applies when Lodestar restarts.";
  const ownList = document.createElement('ul');
  ownList.className = 'feature-list feature-list-plugins';
  const featuresRestart = document.createElement('div');
  featuresRestart.className = 'plugin-restart';
  featuresRestart.hidden = true;
  featuresRestart.innerHTML = '<span>Restart Lodestar to apply the changes.</span><button type="button" class="pill-button">Restart now</button>';
  featuresRestart.querySelector('button').addEventListener('click', () => host.restart());
  featuresGroup?.querySelector('.feature-list')?.before(ownList);
  featuresGroup?.append(featuresRestart);

  // What the switch turns on. Uses "summary" or the start of the description.
  function summary(plugin) {
    if (plugin.summary) return plugin.summary;
    return (plugin.description || '').split(/(?<=[.:])\s/)[0].replace(/:$/, '.');
  }

  function renderOwn(plugins) {
    ownList.replaceChildren();
    for (const plugin of plugins) {
      const [text, kind] = describe(plugin);
      const about = kind === 'pending' || kind === 'error' ? text : summary(plugin);
      const { item, input } = SwitchRow.create({ id: `plugin-${plugin.id}`, label: plugin.name, description: about }, plugin.enabled, (on) =>
        act(() => host.setEnabled(plugin.id, on))
      );
      input.disabled = plugin.status === 'incompatible' || plugin.status === 'pending' || plugin.pendingRemoval;

      const options = plugin.options || [];
      if (options.length) {
        const sub = document.createElement('ul');
        sub.className = 'feature-list feature-sub';
        for (const option of options) {
          const row = SwitchRow.create(option, option.value, async (on) => {
            try {
              await host.setOption(plugin.id, option.id, on);
              // Let open pages update right away.
              window.dispatchEvent(new CustomEvent('lodestar:plugin-option', { detail: { id: plugin.id, key: option.id, value: on } }));
            } catch (err) {
              row.input.checked = !on;
              setStatus(err.message, true);
            }
          });
          row.input.disabled = !plugin.enabled;
          sub.append(row.item);
        }
        item.append(sub);
      }
      ownList.append(item);
    }
  }

  const group = document.createElement('div');
  group.className = 'settings-group plugins-group';
  group.innerHTML = `
    <h3>Plugins <button type="button" class="help-tip" data-help="Install a plugin from its .zip file, or update or remove one you installed. Lodestar's own plugins are turned on and off in Features above. Changes apply when Lodestar restarts."></button></h3>
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
  (document.getElementById('settings-options') || document.getElementById('settings-view'))?.append(group);

  const list = group.querySelector('#plugin-list');
  const statusLine = group.querySelector('#plugin-status');
  const restartBox = group.querySelector('#plugin-restart');
  let changed = false;

  const setStatus = StatusLine(statusLine);

  // One line on what the plugin is doing and what changes after a restart.
  function describe(plugin) {
    if (plugin.pendingRemoval && plugin.builtIn) return ['Goes back to the version that comes with Lodestar when it restarts.', 'pending'];
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
    const all = await host.list();
    renderOwn(all.filter(isOwn));
    // Installed zips: other people's plugins and newer versions of ours.
    const plugins = all.filter((plugin) => !isOwn(plugin) || plugin.source === 'installed');
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
      if (plugin.builtIn) {
        const builtIn = document.createElement('span');
        builtIn.className = 'plugin-version';
        builtIn.textContent = plugin.source === 'built-in' ? 'comes with Lodestar' : 'updated';
        head.append(builtIn);
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
      } else if (plugin.status !== 'pending' && plugin.status !== 'incompatible' && !isOwn(plugin)) {
        actions.append(
          button(plugin.enabled ? 'Turn off' : 'Turn on', () => act(() => host.setEnabled(plugin.id, !plugin.enabled)))
        );
      }
      if (!plugin.pendingRemoval && plugin.source === 'installed') {
        // Removing an update to a built-in plugin goes back to the built-in one.
        actions.append(button(plugin.builtIn ? 'Use built-in version' : 'Remove', () => act(() => host.remove(plugin.id))));
      }
      if (actions.childElementCount) item.append(actions);
      list.append(item);
    }

    const pending = all.some((plugin) => describe(plugin)[1] === 'pending');
    restartBox.hidden = !(pending || changed);
    featuresRestart.hidden = restartBox.hidden;
  }

  group.querySelector('#plugin-install').addEventListener('click', async () => {
    setStatus('');
    try {
      const installed = await host.install();
      if (!installed) return;
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
