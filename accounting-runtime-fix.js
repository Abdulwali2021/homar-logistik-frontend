(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const BUDGET_KEY='homar_budsjet';
const EXPENSE_KEYS=new Set(['homar_samen','homar_gari','homar_qarash','homar_shamito','homar_dhagaxshid']);
const EXPENSE_SECTIONS='#sectionSamen,#sectionGari,#sectionQarash,#sectionShamito,#sectionDhagaxshid';
const EPS=0.005;
const previousSetItem=Storage.prototype.setItem;
let customerActionUntil=0;
let expenseActionUntil=0;

function now(){return Date.now();}
function money(value){const n=Number(value)||0;return Math.round((n+Number.EPSILON)*10000)/10000;}
function parseRaw(raw,fallback){try{const v=JSON.parse(raw);return v===null?fallback:v;}catch(_){return fallback;}}
function readJson(key,fallback){return parseRaw(localStorage.getItem(key),fallback);}
function active(row){return !!(row&&!row.deleted&&!row.deletedAt);}

function currentBudget(){
  const data=readJson(BUDGET_KEY,{});
  data.bank=Math.max(0,Number(data.bank)||0);
  data.wafi=Math.max(0,Number(data.wafi)||0);
  return data;
}

function writeBudgetDirect(data){
  data.wafi=Math.max(0,money(data.wafi));
  previousSetItem.call(localStorage,BUDGET_KEY,JSON.stringify(data));
}

function customerPaidTotalFromList(list){
  if(!Array.isArray(list))return 0;
  return money(list.reduce(function(sum,order){
    if(!active(order))return sum;
    const payments=Array.isArray(order.payments)?order.payments:[];
    return sum+payments.reduce(function(s,p){return s+Math.max(0,Number(p&&p.amount)||0);},0);
  },0));
}

function expenseFromList(key,list){
  if(!Array.isArray(list))return 0;
  return money(list.filter(active).reduce(function(sum,row){
    if(key==='homar_samen') return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driverPrice)||0);
    if(key==='homar_gari') return sum+(Number(row.qty)||0)*(Number(row.price)||0);
    if(key==='homar_qarash') return sum+(Number(row.antall)||0)*(Number(row.price)||0);
    if(key==='homar_shamito') return sum+(Number(row.qty)||0)*(Number(row.price)||0);
    if(key==='homar_dhagaxshid') return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||0);
    return sum;
  },0));
}

function totalExpensesWithOverride(changedKey,newValue){
  let total=0;
  EXPENSE_KEYS.forEach(function(key){
    const list=key===changedKey?newValue:readJson(key,[]);
    total+=expenseFromList(key,list);
  });
  return money(total);
}

function markCustomerAction(){customerActionUntil=now()+4000;}
function markExpenseAction(){expenseActionUntil=now()+4000;}

function markFromElement(target){
  if(!target||!target.closest)return;
  const onclick=String((target.closest('[onclick]')||{}).getAttribute?.('onclick')||'');
  if(target.closest('#statusModal')||/CustomerPayment|openCustomerPayment|toggleTableRowStatus|deleteCustomer\s*\(|undoLatestDeletion/i.test(onclick)) markCustomerAction();
  if(target.closest(EXPENSE_SECTIONS)||/undoLatestDeletion/i.test(onclick)) markExpenseAction();
}

document.addEventListener('pointerdown',function(event){markFromElement(event.target);},true);
document.addEventListener('click',function(event){markFromElement(event.target);},true);
document.addEventListener('keydown',function(event){
  if(event.key!=='Enter')return;
  const target=event.target;
  if(target&&target.closest&&target.closest('#statusModal'))markCustomerAction();
  if(target&&target.closest&&target.closest(EXPENSE_SECTIONS))markExpenseAction();
},true);

Storage.prototype.setItem=function(key,value){
  if(this!==localStorage) return previousSetItem.call(this,key,value);

  if(key===CUSTOMER_KEY && now()<=customerActionUntil){
    const oldList=readJson(CUSTOMER_KEY,[]);
    const newList=parseRaw(String(value),[]);
    const oldPaid=customerPaidTotalFromList(oldList);
    const newPaid=customerPaidTotalFromList(newList);
    const delta=money(newPaid-oldPaid);
    const budget=currentBudget();

    if(delta< -EPS && budget.wafi+EPS<Math.abs(delta)){
      alert('KAN IKKE REDUSERE ELLER SLETTE BETALINGEN. WAFI HAR IKKE NOK SALDO TIL Å TREKKE TILBAKE BELØPET.');
      return;
    }

    const result=previousSetItem.call(this,key,value);
    if(Math.abs(delta)>=EPS){
      budget.wafi=money(budget.wafi+delta);
      writeBudgetDirect(budget);
      console.info('HOMAR WAFI: kundebetaling endret med',delta);
    }
    return result;
  }

  if(EXPENSE_KEYS.has(key) && now()<=expenseActionUntil){
    const oldTotal=totalExpensesWithOverride(null,null);
    const newList=parseRaw(String(value),[]);
    const newTotal=totalExpensesWithOverride(key,newList);
    const deltaExpense=money(newTotal-oldTotal);
    const budget=currentBudget();

    if(deltaExpense>EPS && budget.wafi+EPS<deltaExpense){
      alert('KAN IKKE REGISTRERE ELLER ØKE UTGIFTEN. WAFI HAR IKKE NOK SALDO.');
      return;
    }

    const result=previousSetItem.call(this,key,value);
    if(Math.abs(deltaExpense)>=EPS){
      budget.wafi=money(budget.wafi-deltaExpense);
      writeBudgetDirect(budget);
      console.info('HOMAR WAFI: utgift endret med',deltaExpense);
    }
    return result;
  }

  return previousSetItem.call(this,key,value);
};

window.homarAccountingTestState=function(){
  return {
    wafi:currentBudget().wafi,
    customerPaid:customerPaidTotalFromList(readJson(CUSTOMER_KEY,[])),
    expenses:totalExpensesWithOverride(null,null)
  };
};

console.info('HOMAR: DIREKTE KOBLING KUNDEBETALING -> WAFI OG UTGIFT -> WAFI ER AKTIV.');
})();