(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HomarProfitHistoryDates = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DATE_KEYS = new Set([
    'homar_lager',
    'homar_samen',
    'homar_shamito',
    'homar_kunde',
    'homar_dhagaxshid',
    'homar_gari',
    'homar_qarash'
  ]);
  function validDate(value) {
    const text = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function same(valueA, valueB) {
    return JSON.stringify(valueA) === JSON.stringify(valueB);
  }

  function changedPair(oldRows, newRows) {
    const before = rows(oldRows);
    const after = rows(newRows);

    if (after.length > before.length) {
      const added = after.find(item => !before.some(previous => same(previous, item)));
      return { oldItem: null, newItem: added || after[after.length - 1] || null };
    }
    if (after.length < before.length) {
      const removed = before.find(item => !after.some(next => same(next, item)));
      return { oldItem: removed || before[before.length - 1] || null, newItem: null };
    }

    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      if (!same(before[index], after[index])) {
        return { oldItem: before[index] || null, newItem: after[index] || null };
      }
    }
    return { oldItem: null, newItem: null };
  }

  function changedPaymentDate(oldItem, newItem) {
    const pair = changedPair(oldItem && oldItem.payments, newItem && newItem.payments);
    const payment = pair.newItem || pair.oldItem;
    return validDate(payment && payment.date);
  }

  function effectiveDateFromChange(key, oldValue, newValue) {
    if (!DATE_KEYS.has(String(key || ''))) return '';
    const pair = changedPair(oldValue, newValue);
    if (!pair.oldItem && !pair.newItem) return '';

    if (key === 'homar_kunde') {
      const paymentDate = changedPaymentDate(pair.oldItem, pair.newItem);
      if (paymentDate) return paymentDate;
    }

    return validDate(pair.newItem && pair.newItem.date) ||
      validDate(pair.oldItem && pair.oldItem.date);
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function money(value) {
    const number = Number(value) || 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function hasTotals(row, budgetTotal, totalExpense, profitLoss) {
    return money(row && row.budgetTotal) === budgetTotal &&
      money(row && row.totalExpense) === totalExpense &&
      money(row && row.profitLoss) === profitLoss;
  }

  // Engangsreparasjon av regresjonen som slo 19.08 sammen med 20.08.
  // Den er med vilje begrenset til de eksakte kjente radene og endrer ingen
  // annen historikk. Nye tilbakedaterte registreringer får datoen ved lagring.
  function restoreLostAugust19History(historyRows) {
    const history = rows(historyRows);
    if (history.some(row => validDate(row && row.date) === '2026-08-19')) return history;

    const august20Index = history.findIndex(row =>
      validDate(row && row.date) === '2026-08-20' &&
      hasTotals(row, 32675.75, 953.94, 31779.55)
    );
    const august21Index = history.findIndex(row =>
      validDate(row && row.date) === '2026-08-21' &&
      hasTotals(row, 33148.06, 1009.63, 32251.86)
    );
    if (august20Index < 0 || august21Index < 0) return history;

    const august20 = history[august20Index];
    const august21 = history[august21Index];
    const repaired = history.filter((_, index) =>
      index !== august20Index && index !== august21Index
    );

    repaired.push({
      ...august20,
      id: 'PROFIT-20260819-RESTORED',
      createdAt: '2026-08-19T18:38:48.000Z',
      date: '2026-08-19',
      baselineBudgetTotal: 32212.99,
      baselineTotalExpense: 896.20,
      baselineProfitLoss: 31316.79,
      change: 462.76,
      repairedFromDate: '2026-08-20'
    });
    repaired.push({
      ...august21,
      date: '2026-08-20',
      baselineBudgetTotal: 32675.75,
      baselineTotalExpense: 953.94,
      baselineProfitLoss: 31779.55,
      change: 472.31,
      repairedFromDate: '2026-08-21'
    });
    return repaired;
  }

  function formatEffectiveDateTime(row, locale) {
    const dateKey = validDate(row && row.date) || localDateKey(row && row.createdAt);
    const parts = dateKey.split('-');
    const timestamp = new Date(row && row.createdAt || '');
    const time = Number.isFinite(timestamp.getTime())
      ? timestamp.toLocaleTimeString(locale || 'nb-NO')
      : '00:00:00';
    if (parts.length !== 3) return time;
    return Number(parts[2]) + '.' + Number(parts[1]) + '.' + parts[0] + ', ' + time;
  }

  function filterHistoryRows(historyRows, mode, filters) {
    const selectedMode = ['day', 'month', 'year', 'all'].includes(mode) ? mode : 'day';
    const selected = filters && typeof filters === 'object' ? filters : {};
    return rows(historyRows).filter(row => {
      const rowDate = validDate(row && row.date) || localDateKey(row && row.createdAt);
      if (selectedMode === 'day') return rowDate === validDate(selected.day);
      if (selectedMode === 'month') return rowDate.slice(0, 7) === String(selected.month || '');
      if (selectedMode === 'year') return rowDate.slice(0, 4) === String(selected.year || '');
      return true;
    });
  }

  return {
    DATE_KEYS,
    effectiveDateFromChange,
    filterHistoryRows,
    formatEffectiveDateTime,
    localDateKey,
    restoreLostAugust19History,
    validDate
  };
});
