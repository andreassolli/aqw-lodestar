// Settings: the tabs, Options and About. The Data tab is in settings-data.js.
const Settings = (() => {
  const IS_DESKTOP = Boolean(window.lodestarDesktop);

  let tabs = null;
  const showPanel = (name) => tabs && tabs.show(name);

  async function initFeatures() {
    const list = document.getElementById('feature-list');
    await Features.ready;
    for (const feature of Features.LIST.filter((f) => !IS_DESKTOP || f.desktop)) {
      list.append(SwitchRow.create(feature, Features.isOn(feature.id), (on) => Features.set(feature.id, on)).item);
    }
  }

  // Version number, and the footer's About link opens this tab.
  function initAbout() {
    document.getElementById('about-version').textContent = `v${ext.runtime.getManifest().version}`;
    document.getElementById('footer-about').addEventListener('click', () => {
      Tabs.show('settings');
      showPanel('about');
    });
  }

  function init() {
    // Remove the browser-only stuff in the app.
    if (IS_DESKTOP) document.querySelectorAll('#settings-view [data-extension-only]').forEach((element) => element.remove());
    tabs = TabList.create(document.querySelector('.settings-tabs'), { rememberAs: 'lodestar-settings-panel' });
    Choice.bind('tooltip-placement', STORAGE_KEYS.tooltipPlacement, 'side');
    initFeatures();
    initAbout();
    HelpTip.init(document);
  }

  return { IS_DESKTOP, init, showPanel };
})();
