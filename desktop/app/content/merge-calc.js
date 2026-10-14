// Wiki merge shops and quests: totals up required materials and compares them
// against the saved inventory. Merge shops get a "Calculator" tab; quests get
// a panel above the tabs with a turn-in multiplier.
(() => {
  const PANEL_ID = 'calc-merge-extension';

  const pageTitle = document.querySelector('#page-title')?.textContent || '';
  const breadcrumbs = [...document.querySelectorAll('#breadcrumbs a')].map((a) => a.textContent);
  const pageMentions = (word) => pageTitle.includes(word) || breadcrumbs.some((text) => text.includes(word));

  const isMergePage = pageMentions('Merge');
  const isQuestPage = !isMergePage && pageMentions('Quest');
  if (!isMergePage && !isQuestPage) return;

  // Quest pages can have several tab sets; follow whichever one was clicked last.
  let activeNavset = document.querySelector('.yui-navset');
  document.addEventListener('click', (e) => {
    const navset = e.target instanceof Element && e.target.closest('.yui-navset');
    if (navset) activeNavset = navset;
  });

  function countInventory(rawInventory) {
    const counts = {};
    if (!Array.isArray(rawInventory)) return counts;
    rawInventory.forEach((item) => {
      const name = getBaseName(item.name);
      counts[name] = (counts[name] || 0) + parseInt(item.quantity || 1, 10);
    });
    return counts;
  }

  const parseQty = (text) => parseInt(text.replace(/,/g, ''), 10);
  const addTo = (totals, name, qty) => {
    totals[name] = (totals[name] || 0) + qty;
  };

  function parseMergeRequirements(inventory, filterAC, filterLegend) {
    const requiredTotals = {};
    let countItems = 0;
    let ownedShopItems = 0;

    document.querySelectorAll('.wiki-content-table tr').forEach((tr) => {
      const [, tdItem, tdPrice] = tr.querySelectorAll('td');
      const itemLink = tdItem && tdPrice && tdItem.querySelector('a');
      if (!itemLink) return;

      const html = tdItem.innerHTML;
      const text = tdItem.textContent;
      const isAC = html.includes('acsmall.png') || html.includes('aclarge.png') || /\bAC\b/.test(text);
      const isLegend =
        html.includes('membersmall.png') || html.includes('memberlarge.png') ||
        html.includes('legendsmall.png') || /\bLegend\b/i.test(text);

      if ((filterAC || filterLegend) && !((filterAC && isAC) || (filterLegend && isLegend))) return;

      countItems++;
      if (inventory[getBaseName(itemLink.textContent)]) {
        ownedShopItems++;
        return;
      }

      tdPrice.querySelectorAll('a').forEach((material) => {
        const qtyMatch = (material.nextSibling?.textContent || '').match(/x\s*([\d,]+)/i);
        addTo(requiredTotals, getBaseName(material.textContent), qtyMatch ? parseQty(qtyMatch[1]) : 1);
      });
    });

    return { requiredTotals, countItems, ownedShopItems };
  }

  function parseQuestRequirements(multiplier) {
    const requiredTotals = {};
    const activeTab = activeNavset?.querySelector('.yui-content > div[style*="block"]');
    const questTitle = activeNavset?.querySelector('.yui-nav .selected a em')?.textContent || '';
    if (!activeTab) return { requiredTotals, countItems: 0, questTitle };

    const label = [...activeTab.querySelectorAll('strong, b')].find(
      (tag) => tag.textContent.includes('Items Required:') || tag.textContent.includes('Requires:')
    );
    let list = label?.parentElement.nextElementSibling;
    while (list && list.tagName !== 'UL') list = list.nextElementSibling;
    if (!list) return { requiredTotals, countItems: 0, questTitle };

    [...list.children].forEach((li) => {
      if (li.tagName !== 'LI') return;
      const clone = li.cloneNode(true);
      clone.querySelectorAll('ul, img').forEach((el) => el.remove());

      const text = clone.textContent.replace(/[\n\r\t]/g, '').trim();
      const match = text && text.match(/^(.*?)(?:\s*x\s*([\d,]+))?$/i);
      if (!match) return;

      const name = getBaseName(match[1].trim().replace(/"/g, ''));
      addTo(requiredTotals, name, (match[2] ? parseQty(match[2]) : 1) * multiplier);
    });

    return { requiredTotals, countItems: 1, questTitle };
  }

  function filterCheckbox(id, label, checked) {
    return `
      <label class="aqwt-calc-filter-opt">
        <span class="aqwt-checkbox-icon${checked ? ' is-checked' : ''}" id="${id}-icon"></span>
        <input class="aqwt-hidden-toggle" type="checkbox" id="${id}" ${checked ? 'checked' : ''} /> ${label}
      </label>`;
  }

  function requirementsTable(requiredTotals, inventory) {
    const rows = Object.entries(requiredTotals).map(([material, needed]) => {
      const have = inventory[material] || 0;
      const missing = Math.max(0, needed - have);
      return `
        <tr>
          <td class="aqwt-cell-name">${escapeHtml(material)}</td>
          <td class="aqwt-cell-center">x${needed}</td>
          <td class="aqwt-cell-center aqwt-cell-have">x${have}</td>
          <td class="aqwt-cell-center aqwt-cell-${missing === 0 ? 'ready' : 'missing'}">x${missing === 0 ? 'Ready' : missing}</td>
        </tr>`;
    });

    return `
      <table class="wiki-content-table" ${isQuestPage ? 'id="quest-table"' : ''}>
        <thead><tr><th>Requirement</th><th>Needed</th><th>You Have</th><th>Missing</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  }

  function calculatorHtml(state, data, inventory) {
    const title = isQuestPage
      ? `Quest Farm Calculator - <span class="aqwt-calc-quest-name">${escapeHtml(data.questTitle)}</span>`
      : 'Merge Calculator';

    const controls = isMergePage
      ? `<div class="aqwt-calc-filters">
           ${filterCheckbox('chk-merge-ac', 'Only AC', state.filterAC)}
           ${filterCheckbox('chk-merge-legend', 'Only Legend', state.filterLegend)}
         </div>`
      : `<div class="aqwt-calc-filters">
           <span class="aqwt-calc-filters-label">Quest Turn-ins:</span>
           <input type="number" id="quest-multiplier-input" class="aqwt-quest-input" min="1" value="${state.multiplier}">
         </div>`;

    let body;
    if (isMergePage && data.countItems === 0) {
      body = '<div class="aqwt-calc-empty">No items match the selected filters.</div>';
    } else if (isMergePage && data.ownedShopItems === data.countItems) {
      body = `
        <div class="aqwt-calc-complete">
          <h2>100% Completed!</h2>
          <p>You already own all items from this shop (based on current filters).</p>
        </div>`;
    } else {
      body = requirementsTable(data.requiredTotals, inventory);
    }

    return `
      <div class="aqwt-calc">
        <div class="aqwt-calc-header"><h3 class="aqwt-calc-title">${title}</h3></div>
        <div class="aqwt-calc-body">${controls}${body}</div>
      </div>`;
  }

  /** Makes the navset's tabs (including our added one) switch panes by index. */
  function attachTabSwitching(navList, contentList) {
    if (navList.dataset.aqwtTabsBound === 'true') return;
    navList.dataset.aqwtTabsBound = 'true';

    navList.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li || li.parentElement !== navList) return;

      const index = [...navList.children].indexOf(li);
      if (!contentList.children[index]) return;

      [...navList.children].forEach((item) => item.classList.toggle('selected', item === li));
      [...contentList.children].forEach((pane, i) => {
        pane.style.display = i === index ? 'block' : 'none';
      });
    });
  }

  /** Quest pages: a panel above the tab set. */
  function mountQuestPanel(html) {
    let pane = document.getElementById(PANEL_ID);
    if (!pane) {
      pane = document.createElement('div');
      pane.id = PANEL_ID;
      const content = document.querySelector('#page-content');
      if (activeNavset) activeNavset.parentNode.insertBefore(pane, activeNavset);
      else if (content) content.insertBefore(pane, content.firstChild);
    }
    pane.innerHTML = html;
  }

  /** Merge pages: an extra "Calculator" tab in the shop's tab set. */
  function mountMergeTab(html) {
    let pane = document.getElementById(PANEL_ID);
    if (pane) {
      pane.innerHTML = html; // refresh in place so an open tab stays open
      return;
    }

    const navset = document.querySelector('.yui-navset');
    const navList = navset?.querySelector('.yui-nav');
    const contentList = navset?.querySelector('.yui-content');
    if (!navList || !contentList) return;

    const tab = document.createElement('li');
    tab.id = 'aqwt-calc-tab-li';
    tab.innerHTML = '<a href="javascript:;"><em>Calculator</em></a>';
    navList.appendChild(tab);

    pane = document.createElement('div');
    pane.id = PANEL_ID;
    pane.style.display = 'none'; // don't take over whichever tab is open
    pane.innerHTML = html;
    contentList.appendChild(pane);

    attachTabSwitching(navList, contentList);
  }

  function createCalculator(inventory) {
    const state = { filterAC: false, filterLegend: false, multiplier: 1 };

    function update(changes = {}) {
      Object.assign(state, changes);
      try {
        const data = isMergePage
          ? parseMergeRequirements(inventory, state.filterAC, state.filterLegend)
          : parseQuestRequirements(state.multiplier);

        if (data.countItems === 0 && !state.filterAC && !state.filterLegend) return;

        const html = calculatorHtml(state, data, inventory);
        if (isMergePage) mountMergeTab(html);
        else mountQuestPanel(html);
        bindControls();
      } catch (err) {
        console.error('Calculator error:', err);
      }
    }

    function bindFilter(id, key) {
      const input = document.getElementById(id);
      const icon = document.getElementById(`${id}-icon`);
      if (!input) return;
      input.addEventListener('change', () => update({ [key]: input.checked }));
      // The visible icon sits outside the hidden checkbox's hit area.
      if (icon) icon.addEventListener('click', () => update({ [key]: !input.checked }));
    }

    function bindControls() {
      if (isMergePage) {
        bindFilter('chk-merge-ac', 'filterAC');
        bindFilter('chk-merge-legend', 'filterLegend');
        return;
      }
      const input = document.getElementById('quest-multiplier-input');
      if (!input) return;
      input.addEventListener('change', () => {
        const value = parseInt(input.value, 10);
        update({ multiplier: Number.isNaN(value) || value < 1 ? 1 : value });
      });
    }

    return { update };
  }

  ext.storage.local.get(STORAGE_KEYS.inventory).then((result) => {
    const calculator = createCalculator(countInventory(result[STORAGE_KEYS.inventory]));
    calculator.update();

    if (isQuestPage) {
      // Recalculate for the newly selected quest after the wiki switches tabs.
      document.querySelectorAll('.yui-nav a').forEach((tab) => {
        tab.addEventListener('click', () => setTimeout(() => calculator.update(), 50));
      });
    }
  });
})();
