'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../accounting-runtime-fix.js'), 'utf8');

function setup() {
  class Storage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
  }
  const localStorage = new Storage();
  const requests = [];
  const window = {
    location: { href:'https://example.test/', reload(){} },
    fetch: async (url, options = {}) => {
      requests.push({ url:String(url), options });
      if (String(url).endsWith('/api/state/business')) {
        return new Response(JSON.stringify({ ok:true, revision:1 }), {
          status:200,
          headers:{ 'content-type':'application/json' }
        });
      }
      return new Response(JSON.stringify({ state:{}, revision:0 }), {
        status:200,
        headers:{ 'content-type':'application/json' }
      });
    }
  };
  const context = {
    Storage,
    localStorage,
    window,
    URL,
    Response,
    console,
    alert(){},
    setTimeout(fn){ fn(); }
  };
  vm.runInNewContext(source, context);
  return { localStorage, requests, window };
}

test('UTGIFT trekker WAFI lokalt og SHAMITO gjør det ikke', () => {
  const { localStorage } = setup();
  localStorage.setItem('homar_budsjet', JSON.stringify({ bank:0, wafi:1000 }));
  localStorage.setItem('homar_samen', JSON.stringify([{ qty:2, price:100 }]));
  assert.equal(JSON.parse(localStorage.getItem('homar_budsjet')).wafi, 800);
  localStorage.setItem('homar_shamito', JSON.stringify([{ qty:10, price:20 }]));
  assert.equal(JSON.parse(localStorage.getItem('homar_budsjet')).wafi, 800);
});

test('business state sendes samlet til atomisk endepunkt', async () => {
  const { localStorage, requests, window } = setup();
  localStorage.setItem('homar_server_state_revision', '0');
  localStorage.setItem('homar_budsjet', JSON.stringify({ bank:0, wafi:1000 }));
  localStorage.setItem('homar_lager', JSON.stringify([{ type:'A', qty:5 }]));
  localStorage.setItem('homar_samen', JSON.stringify([{ type:'A', qty:1, price:20 }]));

  await window.fetch('https://homar-logistik.onrender.com/api/state', {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ state:{ homar_samen:[] } })
  });

  const atomic = requests.find(request => request.url.endsWith('/api/state/business'));
  assert.ok(atomic);
  const body = JSON.parse(atomic.options.body);
  assert.equal(body.expectedRevision, 0);
  assert.deepEqual(body.state.homar_lager, [{ type:'A', qty:5 }]);
  assert.deepEqual(body.state.homar_samen, [{ type:'A', qty:1, price:20 }]);
  assert.equal(body.state.homar_budsjet.wafi, 980);
  assert.equal(localStorage.getItem('homar_server_state_revision'), '1');
});
