// Order of the lists: yours first, then what's on now, then by how soon.
const ListTiming = (() => {
  const FRIDAY_13TH_SOON_DAYS = 7;
  const DAY_EVENT_WINDOW_DAYS = 7; // days either side a birthday counts as on now
  const DAY_MS = 86400000;
  const DAYS_PER_MONTH = 30.44;

  function nextFriday13th(today) {
    for (let i = 0; i < 24; i++) {
      const day = new Date(today.getFullYear(), today.getMonth() + i, 13);
      if (day.getDay() === 5 && day >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) return day;
    }
    return null;
  }

  // Months until the event. 0 if it's on, Infinity if the list has no months.
  function monthsAway(list, today) {
    const current = today.getMonth() + 1;
    if (Number.isInteger(list.day) && Array.isArray(list.months) && list.months.length === 1) {
      const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const onDay = (year) => new Date(year, list.months[0] - 1, list.day);
      // This year, or next year if this year's already passed.
      let date = onDay(today.getFullYear());
      if ((midnight - date) / DAY_MS > DAY_EVENT_WINDOW_DAYS) date = onDay(today.getFullYear() + 1);
      const days = (date - midnight) / DAY_MS;
      return Math.abs(days) <= DAY_EVENT_WINDOW_DAYS ? 0 : days / DAYS_PER_MONTH;
    }
    if (list.months === 'friday13th') {
      const next = nextFriday13th(today);
      if (!next) return Infinity;
      const days = (next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS;
      return days <= FRIDAY_13TH_SOON_DAYS ? 0 : days / DAYS_PER_MONTH;
    }
    if (!Array.isArray(list.months) || !list.months.length) return Infinity;
    return Math.min(...list.months.map((month) => (month - current + 12) % 12));
  }

  // Your lists, then on now, then the rest by how soon. Config order breaks ties.
  function listsByTiming(lists = ITEM_LISTS, today = new Date()) {
    const personal = lists.filter((list) => list.source === 'inventory' || list.source === 'farm');
    const events = lists
      .filter((list) => !personal.includes(list))
      .map((list, i) => ({ list, i, away: monthsAway(list, today) }))
      .sort((a, b) => a.away - b.away || a.i - b.i);
    return {
      personal,
      now: events.filter((event) => event.away === 0).map((event) => event.list),
      later: events.filter((event) => event.away !== 0).map((event) => event.list),
    };
  }

  // Same thing as [heading, lists] pairs, skipping empty groups.
  function listGroups(lists = ITEM_LISTS, today = new Date()) {
    const { personal, now, later } = listsByTiming(lists, today);
    return [['Your lists', personal], ['On now', now], ['Coming up', later]].filter(([, group]) => group.length);
  }

  return { listsByTiming, listGroups };
})();
