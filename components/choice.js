// Radio buttons that save to storage.
//
//   <div class="segmented" role="radiogroup">
//     <label><input type="radio" name="tooltip-placement" value="side"><span>To the side</span></label>
//   </div>
//
//   Choice.bind('tooltip-placement', STORAGE_KEYS.tooltipPlacement, 'side');
const Choice = (() => {
  async function bind(name, key, fallback) {
    const radios = [...document.querySelectorAll(`input[name="${name}"]`)];
    radios.forEach((radio) =>
      radio.addEventListener('change', () => {
        if (radio.checked) ext.storage.local.set({ [key]: radio.value });
      })
    );
    const value = (await ext.storage.local.get(key))[key] || fallback;
    radios.forEach((radio) => {
      radio.checked = radio.value === value;
    });
  }

  return { bind };
})();
