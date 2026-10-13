// The Ultra tab: each boss's attack pattern, and whether the plugin is
// listening to the game. Lodestar loads this after page.html is in place.
const AttackPatterns = (() => {
  const patterns = {
    eternal: {
      name: 'The Eternal',

      intro: [
        { text: '4x Auto Attacks', type: 'normal' },
        {
          text: '"I will make you see the truth." (Truth)',
          type: 'truth'
        },
        {
          text: '"You shall listen." (Listen)',
          type: 'listen'
        }
      ],

      loop: [
        {
          text: '"All stand equal beneath the eyes of the Eternal." (Zone/Equal)',
          type: 'zone'
        },
        {
          text: '"I will make you see the truth." (Truth)',
          type: 'truth'
        },
        { text: 'Auto Attack', type: 'normal' },
        {
          text: '"You shall listen." (Listen)',
          type: 'listen'
        },
        {
          text: '"I will make you see the truth." (Truth)',
          type: 'truth'
        },
        { text: '2x Auto Attacks', type: 'normal' },
        {
          text: '"All stand equal beneath the eyes of the Eternal." (Zone/Equal)',
          type: 'zone'
        },
        {
          text: '"You shall listen." (Listen)',
          type: 'listen'
        },
        {
          text: '"I will make you see the truth." (Truth)',
          type: 'truth'
        },
        { text: '2x Auto Attacks', type: 'normal' },
        {
          text: '"I will make you see the truth." (Truth)',
          type: 'truth'
        },
        {
          text: '"You shall listen." (Listen)',
          type: 'listen'
        }
      ]
    },

    // Example of another pattern.
    // Replace this with a real boss pattern.
    example: {
      name: 'Example Pattern',

      intro: [
        { text: '2x Auto Attacks', type: 'normal' },
        { text: '"Prepare yourself."', type: 'truth' }
      ],

      loop: [
        { text: 'Auto Attack', type: 'normal' },
        { text: '"Listen carefully."', type: 'listen' },
        { text: '2x Auto Attacks', type: 'normal' },
        { text: '"The attack begins."', type: 'zone' }
      ]
    }
  };

  const content = document.getElementById('attack-pattern-content');
  const selector = document.getElementById('attack-pattern-select');

  function createAttack(attack) {
    const p = document.createElement('p');
    p.className = `attack ${attack.type}`;
    p.textContent = attack.text;
    return p;
  }

  function createSection(name, attacks) {
    const section = document.createElement('div');
    section.className = 'pattern-section';

    const label = document.createElement('div');
    label.className = `section-label ${name.toLowerCase()}-label`;

    const labelText = document.createElement('p');
    labelText.textContent = name;

    label.appendChild(labelText);

    const sectionContent = document.createElement('div');
    sectionContent.className = 'section-content';

    attacks.forEach(attack => {
      sectionContent.appendChild(createAttack(attack));
    });

    section.append(label, sectionContent);

    return section;
  }

  function render(patternId) {
    const pattern = patterns[patternId];

    if (!pattern) {
      content.replaceChildren();
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'attack-pattern';

    wrapper.append(
      createSection('Intro', pattern.intro),
      createSection('Loop', pattern.loop)
    );

    content.replaceChildren(wrapper);
  }

  // Whether main.js is listening to the game, shown above the pattern.
  const PLUGIN_ID = 'ultra-assistant';
  const status = document.getElementById('ultra-status');

  function showStatus(state) {
    if (!status || !state) return;
    status.textContent = state.message;
    status.classList.toggle('is-listening', state.listening);
    status.classList.toggle('is-error', !state.listening && state.message !== 'Starting…');
  }

  function init() {
    if (!content || !selector) return;

    selector.addEventListener('change', () => {
      render(selector.value);
    });

    render(selector.value);

    const plugins = window.lodestarPlugins;
    if (plugins) {
      plugins.on(PLUGIN_ID, 'status', showStatus);
      plugins.invoke(PLUGIN_ID, 'status').then(showStatus).catch(() => {});
    }
  }

  return { init, render };
})();

// The page is already loaded when Lodestar adds this script, so start right away.
AttackPatterns.init();
