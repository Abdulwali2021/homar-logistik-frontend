(function () {
    'use strict';

    const CUSTOMER_KEY = 'homar_kunde';
    const BUDGET_KEY = 'homar_budsjet';
    const EPS = 0.005;

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function money(value) {
        const n = Number(value) || 0;
        return Math.round((n + Number.EPSILON) * 10000) / 10000;
    }

    function currentWafi() {
        const budget = readJson(BUDGET_KEY, {});
        return Math.max(0, Number(budget.wafi) || 0);
    }

    function adjustWafi(delta) {
        delta = money(delta);
        if (Math.abs(delta) < EPS) return true;

        const budget = readJson(BUDGET_KEY, {});
        const oldWafi = Math.max(0, Number(budget.wafi) || 0);
        const nextWafi = money(oldWafi + delta);

        if (nextWafi < -EPS) {
            alert('WAFI KAN IKKE GÅ UNDER 0. BETALINGEN KAN IKKE REDUSERES ELLER SLETTES FØR WAFI HAR NOK SALDO.');
            return false;
        }

        budget.wafi = Math.max(0, nextWafi);
        localStorage.setItem(BUDGET_KEY, JSON.stringify(budget));
        return true;
    }

    function linkedAmount(payment) {
        if (!payment || payment.wafiLinkedAmount === undefined || payment.wafiLinkedAmount === null) return 0;
        const value = Number(payment.wafiLinkedAmount);
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function linkedOrderTotal(order) {
        const payments = Array.isArray(order && order.payments) ? order.payments : [];
        return money(payments.reduce((sum, payment) => sum + linkedAmount(payment), 0));
    }

    function refreshAfterWafiChange() {
        try {
            if (typeof window.loadData === 'function') window.loadData();
            else if (typeof window.renderBudsjetValues === 'function') window.renderBudsjetValues();
        } catch (_) {}
    }

    const originalSaveCustomerPayment = window.saveCustomerPayment;
    if (typeof originalSaveCustomerPayment === 'function') {
        window.saveCustomerPayment = function () {
            const orderIndex = parseInt(document.getElementById('modalIndex')?.value || '-1', 10);
            const paymentIndex = parseInt(document.getElementById('modalPaymentIndex')?.value || '-1', 10);
            const beforeList = readJson(CUSTOMER_KEY, []);
            const beforeOrder = beforeList[orderIndex];
            const beforePayments = Array.isArray(beforeOrder && beforeOrder.payments) ? beforeOrder.payments : [];
            const beforePayment = paymentIndex > -1 ? beforePayments[paymentIndex] : null;
            const oldLinked = linkedAmount(beforePayment);
            const enteredAmount = Number(document.getElementById('modalPaymentAmount')?.value || 0);

            if (beforePayment && oldLinked > enteredAmount + EPS) {
                const reduction = oldLinked - Math.max(0, enteredAmount);
                if (currentWafi() + EPS < reduction) {
                    alert('KAN IKKE REDUSERE BETALINGEN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE ' + reduction.toFixed(2) + '.');
                    return;
                }
            }

            const beforeCount = beforePayments.length;
            const result = originalSaveCustomerPayment.apply(this, arguments);

            const afterList = readJson(CUSTOMER_KEY, []);
            const afterOrder = afterList[orderIndex];
            const afterPayments = Array.isArray(afterOrder && afterOrder.payments) ? afterOrder.payments : [];
            let afterIndex = paymentIndex;
            if (afterIndex < 0 && afterPayments.length > beforeCount) afterIndex = beforeCount;
            const afterPayment = afterIndex > -1 ? afterPayments[afterIndex] : null;
            if (!afterPayment) return result;

            const newLinked = Math.max(0, Number(afterPayment.amount) || 0);
            const delta = money(newLinked - oldLinked);

            if (!adjustWafi(delta)) return result;

            afterPayment.wafiLinkedAmount = newLinked;
            afterPayment.wafiLinkedAt = afterPayment.wafiLinkedAt || new Date().toISOString();
            afterPayment.wafiLinkedBy = String(window.getCurrentUser ? window.getCurrentUser() : 'ADMIN').toUpperCase();
            localStorage.setItem(CUSTOMER_KEY, JSON.stringify(afterList));
            refreshAfterWafiChange();
            return result;
        };
    }

    const originalDeleteCustomerPayment = window.deleteCustomerPayment;
    if (typeof originalDeleteCustomerPayment === 'function') {
        window.deleteCustomerPayment = function (paymentIndex) {
            const orderIndex = parseInt(document.getElementById('modalIndex')?.value || '-1', 10);
            const beforeList = readJson(CUSTOMER_KEY, []);
            const beforeOrder = beforeList[orderIndex];
            const beforePayments = Array.isArray(beforeOrder && beforeOrder.payments) ? beforeOrder.payments : [];
            const payment = beforePayments[paymentIndex];
            const linked = linkedAmount(payment);

            if (linked > currentWafi() + EPS) {
                alert('KAN IKKE SLETTE BETALINGEN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE ' + linked.toFixed(2) + '.');
                return;
            }

            const beforeCount = beforePayments.length;
            const result = originalDeleteCustomerPayment.apply(this, arguments);
            const afterList = readJson(CUSTOMER_KEY, []);
            const afterPayments = Array.isArray(afterList[orderIndex] && afterList[orderIndex].payments)
                ? afterList[orderIndex].payments : [];

            if (afterPayments.length < beforeCount && linked > 0) {
                adjustWafi(-linked);
                refreshAfterWafiChange();
            }
            return result;
        };
    }

    const originalDeleteCustomer = window.deleteCustomer;
    if (typeof originalDeleteCustomer === 'function') {
        window.deleteCustomer = function (index) {
            const beforeList = readJson(CUSTOMER_KEY, []);
            const order = beforeList[index];
            const linked = linkedOrderTotal(order);
            if (linked > currentWafi() + EPS) {
                alert('KAN IKKE SLETTE KUNDEORDREN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE BETALINGENE PÅ ' + linked.toFixed(2) + '.');
                return;
            }

            const beforeCount = beforeList.length;
            const result = originalDeleteCustomer.apply(this, arguments);
            const afterList = readJson(CUSTOMER_KEY, []);
            if (afterList.length < beforeCount && linked > 0) {
                adjustWafi(-linked);
                refreshAfterWafiChange();
            }
            return result;
        };
    }

    const originalUndoLatestDeletion = window.undoLatestDeletion;
    if (typeof originalUndoLatestDeletion === 'function') {
        window.undoLatestDeletion = function () {
            const trash = readJson('homar_trash', []);
            const available = Array.isArray(trash)
                ? trash.filter(entry => Number(entry && entry.expiresAt) > Date.now())
                    .sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0))
                : [];
            const latest = available[0];
            const restoreWafi = latest && latest.mode === 'customer' ? linkedOrderTotal(latest.item) : 0;
            const beforeCount = readJson(CUSTOMER_KEY, []).length;
            const result = originalUndoLatestDeletion.apply(this, arguments);
            const afterCount = readJson(CUSTOMER_KEY, []).length;
            if (restoreWafi > 0 && afterCount > beforeCount) {
                adjustWafi(restoreWafi);
                refreshAfterWafiChange();
            }
            return result;
        };
    }

    console.info('HOMAR: KUNDE-betalinger er koblet til WAFI.');
})();