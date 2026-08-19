(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const BUDGET_KEY='homar_budsjet';
const EXPENSE_KEYS=new Set(['homar_samen','homar_gari','homar_qarash','homar_dhagaxshid']);
const ACCOUNTING_VERSION=1;
const EPS=0.005;
const previousSetItem=Storage.prototype.setItem;
let internalWrite=false;

function money(value){
  const n=Number(value)||0;
  return Math.round((n+Number.EPSILON)*10000)/10000;
}

function parseRaw(raw,fallback){
  try{
    if(raw===null||raw===undefined)return fallback;
    const value=JSON.parse(String(raw));
    return value===null?fallback:value;
  }catch(_){
    return fallback;
  }
}

function readJson(key,fallback){
  return parseRaw(localStorage.getItem(key),fallback);
}

function active(row){
  return !!(row&&!row.deleted&&!row.deletedAt);
}

function currentBudget(){
  const data=readJson(BUDGET_KEY,{});
  data.bank=Math.max(0,Number(data.bank)||0);
  data.wafi=Math.max(0,Number(data.wafi)||0);
  return data;
}

function writeBudget(data){
  data.bank=Math.max(0,money(data.bank));
  data.wafi=Math.max(0,money(data.wafi));
  internalWrite=true;
  try{
    previousSetItem.call(localStorage,BUDGET_KEY,JSON.stringify(data));
  }finally{
    internalWrite=false;
  }
}

function paidTotal(list){
  if(!Array.isArray(list))return 0;
  return money(list.reduce(function(sum,order){
    if(!active(order))return sum;
    const payments=Array.isArray(order.payments)?order.payments:[];
    return sum+payments.reduce(function(paymentSum,payment){
      return paymentSum+Math.max(0,Number(payment&&payment.amount)||0);
    },0);
  },0));
}

function expenseTotalForKey(key,list){
  if(!Array.isArray(list))return 0;
  return money(list.reduce(function(sum,row){
    if(!active(row))return sum;
    if(key==='homar_samen'){
      return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driverPrice)||Number(row.driver)||0);
    }
    if(key==='homar_gari'){
      return sum+(Number(row.qty)||0)*(Number(row.price)||0);
    }
    if(key==='homar_qarash'){
      return sum+(Number(row.antall)||0)*(Number(row.price)||0);
    }
    if(key==='homar_dhagaxshid'){
      return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||Number(row.driverPrice)||0);
    }
    return sum;
  },0));
}

function totalExpensesWith(keyOverride,listOverride){
  let total=0;
  EXPENSE_KEYS.forEach(function(key){
    total+=expenseTotalForKey(
      key,
      key===keyOverride?listOverride:readJson(key,[])
    );
  });
  return money(total);
}

function ensureAccountingBaseline(){
  const budget=currentBudget();
  const hasBaseline=Number.isFinite(Number(budget.wafiExpenseBaselineTotal));
  if(Number(budget.wafiExpenseAutoVersion)>=ACCOUNTING_VERSION&&hasBaseline){
    return budget;
  }
  budget.wafiExpenseBaselineTotal=totalExpensesWith(null,null);
  budget.wafiExpenseAutoVersion=ACCOUNTING_VERSION;
  budget.wafiExpenseEnabledAt=new Date().toISOString();
  writeBudget(budget);
  return budget;
}

function canApplyExpenseDelta(delta){
  delta=money(delta);
  if(delta<=EPS)return true;
  return ensureAccountingBaseline().wafi+EPS>=delta;
}

function applyWafiDelta(delta,kind){
  delta=money(delta);
  if(Math.abs(delta)<EPS)return true;
  const budget=ensureAccountingBaseline();
  const next=money(budget.wafi+delta);
  if(next< -EPS){
    alert(kind==='payment'
      ? 'KAN IKKE REDUSERE ELLER SLETTE BETALINGEN. WAFI HAR IKKE NOK SALDO.'
      : 'KAN IKKE REGISTRERE ELLER ØKE UTGIFTEN. WAFI HAR IKKE NOK SALDO.');
    return false;
  }
  budget.wafi=Math.max(0,next);
  writeBudget(budget);
  return true;
}

Storage.prototype.setItem=function(key,value){
  if(this!==localStorage||internalWrite){
    return previousSetItem.call(this,key,value);
  }

  if(key===CUSTOMER_KEY){
    const oldList=readJson(CUSTOMER_KEY,[]);
    const newList=parseRaw(value,[]);
    const deltaPaid=money(paidTotal(newList)-paidTotal(oldList));

    if(deltaPaid< -EPS&&currentBudget().wafi+EPS<Math.abs(deltaPaid)){
      alert('KAN IKKE REDUSERE ELLER SLETTE BETALINGEN. WAFI HAR IKKE NOK SALDO.');
      return;
    }

    const result=previousSetItem.call(this,key,value);
    if(Math.abs(deltaPaid)>=EPS){
      applyWafiDelta(deltaPaid,'payment');
    }
    return result;
  }

  if(EXPENSE_KEYS.has(key)){
    ensureAccountingBaseline();
    const oldTotal=totalExpensesWith(null,null);
    const newList=parseRaw(value,[]);
    const newTotal=totalExpensesWith(key,newList);
    const deltaExpense=money(newTotal-oldTotal);

    if(!canApplyExpenseDelta(deltaExpense)){
      alert('KAN IKKE REGISTRERE ELLER ØKE UTGIFTEN. WAFI HAR IKKE NOK SALDO.');
      return;
    }

    const result=previousSetItem.call(this,key,value);
    if(Math.abs(deltaExpense)>=EPS){
      applyWafiDelta(-deltaExpense,'expense');
    }
    return result;
  }

  return previousSetItem.call(this,key,value);
};

window.homarEnsureAccountingBaseline=ensureAccountingBaseline;
window.homarCanApplyExpenseDelta=canApplyExpenseDelta;
window.homarAccountingTestState=function(){
  const budget=ensureAccountingBaseline();
  return {
    wafi:budget.wafi,
    customerPaid:paidTotal(readJson(CUSTOMER_KEY,[])),
    expenses:totalExpensesWith(null,null),
    expenseBaseline:money(budget.wafiExpenseBaselineTotal),
    wafiAutomaticChanges:true,
    shamitoAffectsWafi:false
  };
};

console.info('HOMAR: UTGIFT TREKKES FRA WAFI. SHAMITO PÅVIRKER BARE LAGER.');
})();