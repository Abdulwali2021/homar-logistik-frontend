(function () {
  'use strict';

  const LIVE_KEYS = new Set([
    'homar_lager', 'homar_samen', 'homar_gari', 'homar_shamito',
    'homar_dhagaxshid', 'homar_kunde', 'homar_qarash', 'homar_budsjet',
    'homar_trash'
  ]);

  let refreshQueued = false;
  let refreshing = false;

  function dashboardIsOpen() {
    const dashboard = document.getElementById('dashboardSection');
    return dashboard && !dashboard.classList.contains('hidden');
  }

  function refreshHomarNow() {
    refreshQueued = false;
    if (refreshing || !dashboardIsOpen()) return;

    refreshing = true;
    try {
      if (typeof window.loadData === 'function') {
        window.loadData();
      } else if (typeof window.renderAllTables === 'function') {
        window.renderAllTables();
        if (typeof window.populateItemDropdowns === 'function') {
          window.populateItemDropdowns();
        }
      }
    } catch (error) {
      console.error('HOMAR kunne ikke oppdatere visningen med en gang:', error);
    } finally {
      refreshing = false;
    }
  }

  function queueImmediateRefresh() {
    if (refreshQueued || refreshing) return;
    refreshQueued = true;

    // Kjør etter at registreringsfunksjonen er helt ferdig, men før brukeren
    // rekker å utføre neste handling.
    Promise.resolve().then(refreshHomarNow);
  }

  const previousSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const oldValue = this === localStorage ? this.getItem(key) : null;
    const result = previousSetItem.call(this, key, value);

    if (this === localStorage && LIVE_KEYS.has(key) && oldValue !== String(value)) {
      queueImmediateRefresh();
    }

    return result;
  };

  // Oppdater også straks når samme HOMAR-side er åpen i en annen fane.
  window.addEventListener('storage', function (event) {
    if (event.storageArea === localStorage && LIVE_KEYS.has(event.key)) {
      queueImmediateRefresh();
    }
  });

  // Ekstra sikkerhet etter knapper som registrerer, oppdaterer, sletter
  // eller lagrer betaling.
  document.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button) return;

    const action = [
      button.getAttribute('onclick') || '',
      button.id || '',
      button.textContent || ''
    ].join(' ').toUpperCase();

    if (/REGISTRER|OPPDATER|LAGRE|SLETT|BETAL|GODKJENN/.test(action)) {
      setTimeout(queueImmediateRefresh, 0);
      setTimeout(queueImmediateRefresh, 250);
    }
  }, true);

  window.refreshHomarImmediately = queueImmediateRefresh;
  console.info('HOMAR: ØYEBLIKKELIG OPPDATERING ER AKTIV.');
})();