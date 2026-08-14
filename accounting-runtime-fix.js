(function () {
'use strict';

const CUSTOMER_KEY = 'homar_kunde';
const BUDGET_KEY = 'homar_budsjet';
const EXPENSE_KEYS = new Set(['homar_samen','homar_gari','homar_qarash','homar_shamito','homar_dhagaxshid']);
const EPS = 0.005;
let accountingGuard = false;

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value === null ? fallback : value;
    } catch (_) { return fallback; }
}

function money(value) {
    const n = Number(value) || 0;
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function getBudget() {
    const data = readJson(BUDGET_KEY, {});
    data.bank = Math.max(0, Number(data.bank) || 0);
    data.wafi = Math.max(0, Number(data.wafi) || 0);
    return data;
}

function writeBudget(data) {
    data.wafi = Math.max(0, money(data.wafi));
    localStorage.setItem(BUDGET_KEY, JSON.stringify(data));
}

function currentWafi() { return getBudget().wafi; }

function adjustWafi(delta, message) {
    delta = money(delta);
    if (Math.abs(delta) < EPS) return true;
    const budget = getBudget();
    const next = money(budget.wafi + delta);
    if (next < -EPS) {
        alert(message || 'WAFI KAN IKKE GÅ UNDER 0.');
        return false;
    }
    budget.wafi = Math.max(0, next);
    writeBudget(budget);
    return true;
}

function linkedAmount(payment) {
    if (!payment || payment.wafiLinkedAmount === undefined || payment.wafiLinkedAmount === null) return 0;
    const value = Number(payment.wafiLinkedAmount);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function linkedOrderTotal(order) {
    const payments = Array.isArray(order && order.payments) ? order.payments : [];
    return money(payments.reduce((sum, p) => sum + linkedAmount(p), 0));
}

function refresh() {
    try {
        if (typeof window.loadData === 'function') window.loadData();
        else if (typeof window.renderBudsjetValues === 'function') window.renderBudsjetValues();
    } catch (_) {}
}

// KUNDE-BETALINGER -> WAFI
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
        const entered = Math.max(0, Number(document.getElementById('modalPaymentAmount')?.value || 0));

        if (oldLinked > entered + EPS && currentWafi() + EPS < oldLinked - entered) {
            alert('KAN IKKE REDUSERE BETALINGEN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE FORSKJELLEN.');
            return;
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
        if (!adjustWafi(delta, 'WAFI KAN IKKE GÅ UNDER 0 NÅR BETALINGEN ENDRES.')) return result;

        afterPayment.wafiLinkedAmount = newLinked;
        afterPayment.wafiLinkedAt = afterPayment.wafiLinkedAt || new Date().toISOString();
        afterPayment.wafiLinkedBy = String(window.getCurrentUser ? window.getCurrentUser() : 'ADMIN').toUpperCase();
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify(afterList));
        refresh();
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
            alert('KAN IKKE SLETTE BETALINGEN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE BELØPET.');
            return;
        }
        const beforeCount = beforePayments.length;
        const result = originalDeleteCustomerPayment.apply(this, arguments);
        const afterList = readJson(CUSTOMER_KEY, []);
        const afterPayments = Array.isArray(afterList[orderIndex] && afterList[orderIndex].payments) ? afterList[orderIndex].payments : [];
        if (afterPayments.length < beforeCount && linked > 0) {
            adjustWafi(-linked);
            refresh();
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
            alert('KAN IKKE SLETTE KUNDEORDREN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE BETALINGENE.');
            return;
        }
        const beforeCount = beforeList.length;
        const result = originalDeleteCustomer.apply(this, arguments);
        const afterList = readJson(CUSTOMER_KEY, []);
        if (afterList.length < beforeCount && linked > 0) {
            adjustWafi(-linked);
            refresh();
        }
        return result;
    };
}

const originalUndoLatestDeletion = window.undoLatestDeletion;
if (typeof originalUndoLatestDeletion === 'function') {
    window.undoLatestDeletion = function () {
        const trash = readJson('homar_trash', []);
        const available = Array.isArray(trash) ? trash.filter(e => Number(e && e.expiresAt) > Date.now()).sort((a,b) => new Date(b.deletedAt||0)-new Date(a.deletedAt||0)) : [];
        const latest = available[0];
        const restoreWafi = latest && latest.mode === 'customer' ? linkedOrderTotal(latest.item) : 0;
        const beforeCount = readJson(CUSTOMER_KEY, []).length;
        const result = originalUndoLatestDeletion.apply(this, arguments);
        const afterCount = readJson(CUSTOMER_KEY, []).length;
        if (restoreWafi > 0 && afterCount > beforeCount) {
            adjustWafi(restoreWafi);
            refresh();
        }
        return result;
    };
}

// UTGIFT -> WAFI. Første kjøring lagrer dagens totale utgift som startpunkt uten å endre gammel saldo.
function calculateAllExpenses() {
    if (typeof window.calculateUtgiftTotals === 'function') {
        return money(window.calculateUtgiftTotals(function(){ return true; }).total);
    }
    return 0;
}

function ensureExpenseBaseline() {
    const budget = getBudget();
    if (!Number.isFinite(Number(budget.wafiExpenseLinkedTotal))) {
        budget.wafiExpenseLinkedTotal = calculateAllExpenses();
        writeBudget(budget);
    }
}

ensureExpenseBaseline();

const priorSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
    if (this !== localStorage || !EXPENSE_KEYS.has(key) || accountingGuard) {
        return priorSetItem.call(this, key, value);
    }

    const previousRaw = this.getItem(key);
    const budgetBefore = getBudget();
    const oldLinkedTotal = Number.isFinite(Number(budgetBefore.wafiExpenseLinkedTotal)) ? Number(budgetBefore.wafiExpenseLinkedTotal) : calculateAllExpenses();

    priorSetItem.call(this, key, value);
    const newTotal = calculateAllExpenses();
    const deltaExpense = money(newTotal - oldLinkedTotal);

    if (deltaExpense > EPS && currentWafi() + EPS < deltaExpense) {
        accountingGuard = true;
        try { priorSetItem.call(this, key, previousRaw === null ? '[]' : previousRaw); }
        finally { accountingGuard = false; }
        alert('KAN IKKE REGISTRERE ELLER ØKE UTGIFTEN. WAFI HAR IKKE NOK SALDO.');
        return;
    }

    accountingGuard = true;
    try {
        const budget = getBudget();
        budget.wafi = Math.max(0, money(budget.wafi - deltaExpense));
        budget.wafiExpenseLinkedTotal = newTotal;
        priorSetItem.call(localStorage, BUDGET_KEY, JSON.stringify(budget));
    } finally { accountingGuard = false; }
};

console.info('HOMAR: KUNDE-BETALING OG UTGIFT ER KOBLET TIL WAFI.');
})();