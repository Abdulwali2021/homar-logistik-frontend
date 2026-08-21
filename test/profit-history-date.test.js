'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  effectiveDateFromChange,
  filterHistoryRows,
  formatEffectiveDateTime,
  restoreLostAugust19History
} = require('../profit-history-date');

test('DAG-filter finner nøyaktig 20.08 og er standard i grensesnittet', () => {
  const history = [
    { id:'20', date:'2026-08-20', createdAt:'2026-08-21T05:16:50Z' },
    { id:'21', date:'2026-08-21', createdAt:'2026-08-21T06:37:19Z' }
  ];
  assert.deepEqual(
    filterHistoryRows(history, 'day', { day:'2026-08-20' }).map(row => row.id),
    ['20']
  );

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="profitHistoryMode" value="day"/);
  assert.match(html, /id="profitHistoryDayBox">/);
  assert.match(html, /data-profit-history-mode="day"[^>]*aria-pressed="true"/);
});

test('SAMEN sender valgt rapportdato direkte før profit beregnes', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /localStorage\.setItem\("homar_samen"[\s\S]{0,180}rememberProfitChangeDate\(date, "homar_samen"\)[\s\S]{0,180}loadData\(\)/);
  assert.match(html, /localStorage\.setItem\("homar_samen"[\s\S]{0,180}rememberProfitChangeDate\(item\.date, "homar_samen"\)[\s\S]{0,180}loadData\(\)/);
});

test('alle daterte rapportområder sender valgt dato til profit', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const key of ['lager', 'samen', 'shamito', 'gari', 'qarash', 'dhagaxshid']) {
    assert.match(html, new RegExp('rememberProfitChangeDate\\(date, "homar_' + key + '"\\)'));
  }
  assert.match(html, /rememberProfitChangeDate\(paymentDate, "homar_kunde"\)/);
});

test('ny SAMEN registrert i dag bruker valgt arbeidsdato', () => {
  const createdAt = '2026-08-21T05:16:50.000Z';
  const date = effectiveDateFromChange('homar_samen', [], [{
    date:'2026-08-20', qty:10, price:5, createdAt
  }]);
  assert.equal(date, '2026-08-20');
});

test('redigering og sletting beholder registreringens dato', () => {
  const before = [{ date:'2026-08-20', qty:10, price:5, createdAt:'2026-08-20T10:00:00Z' }];
  const after = [{ ...before[0], qty:12, updatedAt:'2026-08-21T05:16:50Z' }];
  assert.equal(effectiveDateFromChange('homar_samen', before, after), '2026-08-20');
  assert.equal(effectiveDateFromChange('homar_samen', before, []), '2026-08-20');
});

test('kundebetaling bruker betalingsdato', () => {
  const before = [{ date:'2026-08-10', payments:[] }];
  const after = [{
    date:'2026-08-10',
    payments:[{ date:'2026-08-20', amount:100, createdAt:'2026-08-21T05:16:50Z' }]
  }];
  assert.equal(effectiveDateFromChange('homar_kunde', before, after), '2026-08-20');
});

test('gjenoppretter eldre rader uten date-felt fra createdAt', () => {
  const history = [
    {
      id:'old', createdAt:'2026-08-20T07:24:20Z',
      budgetTotal:32675.75, totalExpense:953.94, profitLoss:31779.55, change:0
    },
    {
      id:'wrong-day', createdAt:'2026-08-21T06:47:24Z',
      budgetTotal:33148.06, totalExpense:1009.63, profitLoss:32251.86, change:0
    }
  ];
  const repaired = restoreLostAugust19History(history);
  assert.deepEqual(repaired.map(row => row.date), ['2026-08-19', '2026-08-20']);
  assert.equal(repaired[0].change, 462.76);
  assert.equal(repaired[1].change, 472.31);
  assert.match(formatEffectiveDateTime(repaired[0], 'nb-NO'), /^19\.8\.2026,/);
  assert.match(formatEffectiveDateTime(repaired[1], 'nb-NO'), /^20\.8\.2026,/);
});

test('annen historikk flyttes aldri automatisk', () => {
  const history = [
    { id:'19', date:'2026-08-19', budgetTotal:10, totalExpense:1, profitLoss:9 },
    { id:'21', date:'2026-08-21', budgetTotal:20, totalExpense:2, profitLoss:18 }
  ];
  assert.strictEqual(restoreLostAugust19History(history), history);
  assert.deepEqual(restoreLostAugust19History(history), history);
});

test('oppretter ikke en ekstra 19.08-rad når eldre rad bare har createdAt', () => {
  const history = [
    { id:'19', createdAt:'2026-08-19T18:38:48Z', budgetTotal:1, totalExpense:0, profitLoss:1 },
    { id:'20', createdAt:'2026-08-20T07:24:20Z', budgetTotal:32675.75, totalExpense:953.94, profitLoss:31779.55 },
    { id:'21', createdAt:'2026-08-21T06:47:24Z', budgetTotal:33148.06, totalExpense:1009.63, profitLoss:32251.86 }
  ];
  assert.strictEqual(restoreLostAugust19History(history), history);
});

test('normalisering bruker innebygd gjenoppretting uten ekstern avhengighet', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /realignProfitHistoryRows/);
  assert.match(html, /function restoreKnownLostAugust19History\(rows\)/);
  assert.match(html, /let repaired = restoreKnownLostAugust19History\(rows\)/);
  assert.doesNotMatch(html, /window\.HomarProfitHistoryDates\.restoreLostAugust19History/);
  assert.match(html, /20260821-inline-profit-recovery-19/);
});

test('hovedkoden gjenoppretter skjermbildets rader uten hjelpefil', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const recoveryCode = html.slice(
    html.indexOf('function profitHistoryStoredDate'),
    html.indexOf('function normalizeProfitHistoryRows')
  );
  const numberCode = html.slice(
    html.indexOf('function profitHistoryNumber'),
    html.indexOf('function rememberProfitChangeDate')
  );
  const context = { result:null };
  vm.runInNewContext(numberCode + recoveryCode + `
    result = restoreKnownLostAugust19History([
      { id:'old', createdAt:'2026-08-20T07:24:20Z', budgetTotal:32675.75, totalExpense:953.94, profitLoss:31779.55, change:0 },
      { id:'new', createdAt:'2026-08-21T06:47:24Z', budgetTotal:33148.06, totalExpense:1009.63, profitLoss:32251.86, change:0 }
    ]);
  `, context);
  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.map(row => row.date), ['2026-08-19', '2026-08-20']);
  assert.deepEqual(result.map(row => row.change), [462.76, 472.31]);
});
