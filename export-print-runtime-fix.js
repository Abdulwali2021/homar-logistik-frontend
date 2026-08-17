(function () {
  'use strict';

  const views = [
    ['sectionLager', 'lagerTable', 'LAGER'],
    ['sectionLogistics', 'logisticsTable', 'SAMEN'],
    ['sectionGari', 'gariTable', 'GARI'],
    ['sectionShamito', 'shamitoTable', 'SHAMITO'],
    ['sectionDhagaxshid', 'dhagaxshidTable', 'DHAGAX SHID'],
    ['sectionKunde', 'customerTable', 'KUNDE'],
    ['sectionQarash', 'qarashTable', 'QARASH']
  ];

  function isVisible(element) {
    if (!element || element.classList.contains('hidden')) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function currentView() {
    for (const entry of views) {
      const section = document.getElementById(entry[0]);
      const table = document.getElementById(entry[1]);
      if (isVisible(section) && table) {
        return { section, table, title: entry[2] };
      }
    }

    const visibleTable = Array.from(document.querySelectorAll('table'))
      .find(table => isVisible(table));

    return visibleTable
      ? { section: visibleTable.closest('div'), table: visibleTable, title: 'HOMAR' }
      : null;
  }

  function periodText() {
    const select = document.getElementById('archiveModeSelect');
    const mode = select ? select.value : 'all';

    if (mode === 'range') {
      const from = document.getElementById('archiveStartDateInput');
      const to = document.getElementById('archiveEndDateInput');
      return 'FRA ' + (from && from.value ? from.value : '-') +
        ' TIL ' + (to && to.value ? to.value : '-');
    }

    if (mode === 'month') {
      const month = document.getElementById('archiveMonthInput');
      return 'MÅNED ' + (month && month.value ? month.value : '-');
    }

    if (mode === 'today') {
      return 'DAGENS DATO';
    }

    return 'ALLE REGISTRERINGER';
  }

  function customerFilterText() {
    const section = document.getElementById('sectionKunde');
    if (!isVisible(section)) return '';

    const active = section.querySelector('.filter-btn.active-filter');
    const search = document.getElementById('searchTextInput');
    const parts = [];

    if (active) parts.push('STATUS: ' + active.textContent.trim());
    if (search && search.value.trim()) {
      parts.push('KUNDE: ' + search.value.trim().toUpperCase());
    }

    return parts.join(' | ');
  }

  function removeUnwantedColumns(table) {
    const clone = table.cloneNode(true);
    const sourceHeaders = Array.from(table.tHead ? table.tHead.querySelectorAll('th') : []);
    const removeIndexes = [];

    sourceHeaders.forEach((header, index) => {
      const title = header.textContent.replace(/[▲▼]/g, '').trim().toUpperCase();
      const style = window.getComputedStyle(header);
      if (
        title === 'HANDLING' ||
        title === 'OPPRETTET AV' ||
        style.display === 'none' ||
        header.classList.contains('hidden')
      ) {
        removeIndexes.push(index);
      }
    });

    removeIndexes
      .sort((a, b) => b - a)
      .forEach(index => {
        clone.querySelectorAll('tr').forEach(row => {
          if (row.cells[index]) row.deleteCell(index);
        });
      });

    clone.querySelectorAll('button').forEach(button => {
      button.replaceWith(document.createTextNode(button.textContent.trim()));
    });

    clone.querySelectorAll('[style*="display:none"]').forEach(element => element.remove());

    return clone;
  }

  function summaryHtml(view) {
    const summary = view.section && view.section.querySelector('.summary-bar');
    return summary ? summary.cloneNode(true).outerHTML : '';
  }

  function reportHtml(view) {
    const table = removeUnwantedColumns(view.table);
    const extra = customerFilterText();

    return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<title>HOMAR - ${view.title}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;padding:24px}
h1{margin:0 0 8px;color:#176b35}
.meta{margin-bottom:18px;font-weight:bold}
.summary-bar{display:flex;gap:24px;flex-wrap:wrap;background:#edf7ef;border:1px solid #86c995;padding:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #777;padding:7px;text-align:left}
th{background:#176b35;color:#fff}
tr:nth-child(even){background:#f4f4f4}
.footer{margin-top:18px;font-size:11px;color:#555}
@media print{body{padding:0}button{display:none}}
</style>
</head>
<body>
<h1>HOMAR LOGISTIK – ${view.title}</h1>
<div class="meta">${periodText()}${extra ? ' | ' + extra : ''}</div>
${summaryHtml(view)}
${table.outerHTML}
<div class="footer">SKREVET UT: ${new Date().toLocaleString('nb-NO')}</div>
</body>
</html>`;
  }

  function safeFileName(value) {
    return String(value || 'HOMAR')
      .toUpperCase()
      .replace(/[^A-ZÆØÅ0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  window.exportCurrentHomarView = function () {
    const view = currentView();
    if (!view) {
      alert('FANT INGEN TABELL Å LASTE NED.');
      return;
    }

    const html = reportHtml(view);
    const blob = new Blob(['\ufeff', html], {
      type: 'application/vnd.ms-excel;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = safeFileName('HOMAR_' + view.title + '_' + date) + '.xls';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  window.printCurrentHomarView = function () {
    const view = currentView();
    if (!view) {
      alert('FANT INGEN OVERSIKT Å SKRIVE UT.');
      return;
    }

    const popup = window.open('', '_blank', 'width=1100,height=800');

    if (!popup) {
      alert('NETTLESEREN BLOKKERTE UTSKRIFTSVINDUET. TILLAT POPUP OG PRØV IGJEN.');
      return;
    }

    popup.document.open();
    popup.document.write(reportHtml(view));
    popup.document.close();

    popup.onload = function () {
      popup.focus();
      popup.print();
    };
  };

  function addButtons() {
    const bar = document.querySelector('.archive-bar');
    if (!bar || document.getElementById('homarExportButtons')) return;

    const box = document.createElement('div');
    box.id = 'homarExportButtons';
    box.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;';
    box.innerHTML =
      '<button type="button" onclick="exportCurrentHomarView()" ' +
      'style="background:#217346;color:white;padding:7px 12px;">LAST NED EXCEL</button>' +
      '<button type="button" onclick="printCurrentHomarView()" ' +
      'style="background:#343a40;color:white;padding:7px 12px;">SKRIV UT / PDF</button>';

    bar.appendChild(box);
  }

  addButtons();
  setTimeout(addButtons, 300);

  console.info('HOMAR: EXCEL-EKSPORT OG UTSKRIFT ER AKTIV.');
})();