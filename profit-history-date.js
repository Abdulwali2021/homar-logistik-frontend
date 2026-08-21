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
  const REPAIR_WINDOW_MS = 6 * 60 * 60 * 1000;

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

  function utcDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.getUTCFullYear() + '-' +
      String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0');
  }

  function timestampBelongsToDate(timestamp, dateKey) {
    return localDateKey(timestamp) === dateKey || utcDateKey(timestamp) === dateKey;
  }

  function eventFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    const effectiveDate = validDate(row.date);
    const timestamp = new Date(row.updatedAt || row.createdAt || '').getTime();
    if (!effectiveDate || !Number.isFinite(timestamp)) return null;
    return { effectiveDate, timestamp };
  }

  function collectBusinessEvents(readValue) {
    const events = [];
    DATE_KEYS.forEach(key => {
      rows(readValue(key)).forEach(row => {
        const rowEvent = eventFromRow(row);
        if (rowEvent) events.push(rowEvent);

        if (key === 'homar_kunde') {
          rows(row && row.payments).forEach(payment => {
            const paymentEvent = eventFromRow(payment);
            if (paymentEvent) events.push(paymentEvent);
          });
        }

        if (key === 'homar_lager') {
          rows(row && row.contributions).forEach(contribution => {
            const contributionEvent = eventFromRow(contribution);
            if (contributionEvent) events.push(contributionEvent);
          });
        }
      });
    });
    return events;
  }

  function realignProfitHistoryRows(historyRows, readValue) {
    const events = collectBusinessEvents(readValue);
    return rows(historyRows).map(row => {
      const rowDate = validDate(row && (row.date || localDateKey(row.createdAt)));
      const snapshotTime = new Date(row && row.createdAt || '').getTime();
      const change = Math.abs(Number(row && row.change) || 0);
      if (!rowDate || !Number.isFinite(snapshotTime) || change < 0.005) return row;

      const candidate = events
        .filter(event => event.effectiveDate !== rowDate)
        .filter(event => timestampBelongsToDate(event.timestamp, rowDate))
        .filter(event => snapshotTime >= event.timestamp - 5000)
        .filter(event => Math.abs(snapshotTime - event.timestamp) <= REPAIR_WINDOW_MS)
        .sort((a, b) => Math.abs(snapshotTime - a.timestamp) - Math.abs(snapshotTime - b.timestamp))[0];

      return candidate ? { ...row, date: candidate.effectiveDate } : row;
    });
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

  return {
    DATE_KEYS,
    effectiveDateFromChange,
    formatEffectiveDateTime,
    localDateKey,
    realignProfitHistoryRows,
    validDate
  };
});
