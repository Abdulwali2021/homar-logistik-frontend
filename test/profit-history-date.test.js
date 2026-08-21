'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  effectiveDateFromChange,
  formatEffectiveDateTime,
  realignProfitHistoryRows
} = require('../profit-history-date');

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

test('eksisterende pluss flyttes fra registreringsdag til SAMEN-dato', () => {
  const history = [
    {
      id:'old', date:'2026-08-20', createdAt:'2026-08-20T01:48:29Z',
      budgetTotal:32675.75, totalExpense:953.94, profitLoss:31779.55, change:0
    },
    {
      id:'wrong-day', date:'2026-08-21', createdAt:'2026-08-21T06:37:19Z',
      budgetTotal:33148.06, totalExpense:1009.63, profitLoss:32251.86, change:472.31
    }
  ];
  const state = {
    homar_samen:[{
      date:'2026-08-20', qty:10, price:5.569,
      createdAt:'2026-08-21T05:16:50Z'
    }]
  };
  const repaired = realignProfitHistoryRows(history, key => state[key] || []);
  assert.equal(repaired[1].date, '2026-08-20');
  assert.match(formatEffectiveDateTime(repaired[1], 'nb-NO'), /^20\.8\.2026,/);
});

test('eldre hendelser flytter ikke en senere historikkrad', () => {
  const history = [{
    date:'2026-08-21', createdAt:'2026-08-21T14:00:00Z', change:20
  }];
  const state = {
    homar_samen:[{ date:'2026-08-20', createdAt:'2026-08-21T05:00:00Z' }]
  };
  const repaired = realignProfitHistoryRows(history, key => state[key] || []);
  assert.equal(repaired[0].date, '2026-08-21');
});
