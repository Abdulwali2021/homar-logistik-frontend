(function () {
  'use strict';

  const sortState = new Map();
  let scheduled = false;

  function cleanText(value) {
    return String(value || '')
      .replace(/[▲▼]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sortableValue(text) {
    const value = cleanText(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { type: 'date', value: value };
    }

    const numberText = value
      .replace(/\s/g, '')
      .replace(/(?:KR|NOK|USD|\$)/gi, '')
      .replace(',', '.');

    if (/^-?\d+(?:\.\d+)?$/.test(numberText)) {
      return { type: 'number', value: Number(numberText) };
    }

    return {
      type: 'text',
      value: value.toLocaleUpperCase('nb-NO')
    };
  }

  function compareValues(a, b) {
    const left = sortableValue(a);
    const right = sortableValue(b);

    if (left.type === right.type && left.type === 'number') {
      return left.value - right.value;
    }

    if (left.type === right.type && left.type === 'date') {
      return left.value.localeCompare(right.value);
    }

    return String(left.value).localeCompare(
      String(right.value),
      'nb-NO',
      { numeric: true, sensitivity: 'base' }
    );
  }

  function sortTable(table, columnIndex, direction, remember) {
    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody) return;

    const rows = Array.from(tbody.rows);
    const dataRows = rows.filter(row => row.cells.length > columnIndex && row.cells.length > 1);
    const messageRows = rows.filter(row => !dataRows.includes(row));

    const sorted = dataRows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((a, b) => {
        const result = compareValues(
          a.row.cells[columnIndex].textContent,
          b.row.cells[columnIndex].textContent
        );
        return result === 0
          ? a.originalIndex - b.originalIndex
          : result * direction;
      })
      .map(entry => entry.row);

    const alreadySorted = sorted.every((row, index) => dataRows[index] === row);
    if (!alreadySorted) {
      sorted.forEach(row => tbody.appendChild(row));
      messageRows.forEach(row => tbody.appendChild(row));
    }

    if (remember) {
      sortState.set(table.id, { columnIndex, direction });
    }

    updateHeaderArrows(table, columnIndex, direction);
  }

  function updateHeaderArrows(table, activeIndex, direction) {
    const headers = table.tHead ? Array.from(table.tHead.querySelectorAll('th')) : [];
    headers.forEach((header, index) => {
      const original = header.dataset.sortOriginal || cleanText(header.textContent);
      header.dataset.sortOriginal = original;
      header.textContent =
        original + (index === activeIndex ? (direction === 1 ? ' ▲' : ' ▼') : '');
    });
  }

  function prepareTable(table) {
    if (!table.id || !table.tHead) return;

    const headers = Array.from(table.tHead.querySelectorAll('th'));
    headers.forEach((header, columnIndex) => {
      const title = cleanText(header.textContent).toLocaleUpperCase('nb-NO');
      if (
        title === 'HANDLING' ||
        title === 'OPPRETTET AV' ||
        header.dataset.sortReady === '1'
      ) {
        return;
      }

      header.dataset.sortReady = '1';
      header.dataset.sortOriginal = cleanText(header.textContent);
      header.title = 'TRYKK FOR Å SORTERE';
      header.style.cursor = 'pointer';
      header.style.userSelect = 'none';

      header.addEventListener('click', function () {
        const previous = sortState.get(table.id);
        const direction =
          previous && previous.columnIndex === columnIndex
            ? previous.direction * -1
            : 1;

        sortTable(table, columnIndex, direction, true);
      });
    });

    const state = sortState.get(table.id);
    if (state) {
      sortTable(table, state.columnIndex, state.direction, false);
    }
  }

  function prepareAllTables() {
    document.querySelectorAll('table').forEach(prepareTable);
  }

  function schedulePrepare() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(function () {
      scheduled = false;
      prepareAllTables();
    });
  }

  prepareAllTables();

  const observer = new MutationObserver(schedulePrepare);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.info('HOMAR: SORTERING PÅ TABELLKOLONNER ER AKTIV.');
})();