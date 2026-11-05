// One row with a name, a short description and an on/off switch.
//
//   const { item, input } = SwitchRow.create({ id, label, description }, true, (on) => save(on));
//   list.append(item);
const SwitchRow = (() => {
  function create({ id, label, description }, checked, onToggle) {
    const item = document.createElement('li');
    const row = Object.assign(document.createElement('label'), { className: 'feature-item' });
    const text = Object.assign(document.createElement('span'), { className: 'feature-text' });
    const name = Object.assign(document.createElement('span'), { className: 'feature-name', textContent: label });
    const about = Object.assign(document.createElement('span'), { className: 'feature-description', textContent: description || '' });
    text.append(name, about);
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'feature-switch', checked });
    input.dataset.feature = id;
    input.addEventListener('change', () => onToggle(input.checked));
    row.append(text, input);
    item.append(row);
    return { item, input };
  }

  return { create };
})();
