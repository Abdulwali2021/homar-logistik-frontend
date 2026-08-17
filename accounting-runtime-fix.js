(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const BUDGET_KEY='homar_budsjet';
const EXPENSE_KEYS=new Set(['homar_samen','homar_gari','homar_qarash','homar_dhagaxshid']);
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
  }catch(_){return fallback;}
}

function readJson(key,fallback){return parseRaw(localStorage.getItem(key),fallback);}
function active(row){return !!(row&&!row.deleted&&!row.deletedAt);}

function currentBudget(){
  const data=readJson(BUDGET_KEY,{});
  data.bank=Math.max(0,Number(data.bank)||0);
  data.wafi=Math.max(0,Number(data.wafi)||0);
  return data;
}

function writeBudget(data){
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
    return sum+payments.reduce(function(s,payment){
      return s+Math.max(0,Number(payment&&payment.amount)||0);
    },0);
  },0));
}

function expenseTotalForKey(key,list){
  if(!Array.isArray(list))return 0;
  return money(list.reduce(function(sum,row){
    if(!active(row))return sum;
    if(key==='homar_samen'){
      return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||Number(row.driverPrice)||0);
    }
    if(key==='homar_gari') return sum+(Number(row.qty)||0)*(Number(row.price)||0);
    if(key==='homar_qarash') return sum+(Number(row.antall)||0)*(Number(row.price)||0);
    if(key==='homar_dhagaxshid') return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||0);
    return sum;
  },0));
}

function totalExpensesWith(keyOverride,listOverride){
  let total=0;
  EXPENSE_KEYS.forEach(function(key){
    total+=expenseTotalForKey(key,key===keyOverride?listOverride:readJson(key,[]));
  });
  return money(total);
}

function applyWafiDelta(delta,kind){
  delta=money(delta);
  if(Math.abs(delta)<EPS)return true;
  const budget=currentBudget();
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
      console.info('HOMAR: WAFI OPPDATERT FRA KUNDEBETALING:',deltaPaid);
    }
    return result;
  }

  if(EXPENSE_KEYS.has(key)){
    const oldTotal=totalExpensesWith(null,null);
    const newList=parseRaw(value,[]);
    const newTotal=totalExpensesWith(key,newList);
    const deltaExpense=money(newTotal-oldTotal);

    if(deltaExpense>EPS&&currentBudget().wafi+EPS<deltaExpense){
      alert('KAN IKKE REGISTRERE ELLER ØKE UTGIFTEN. WAFI HAR IKKE NOK SALDO.');
      return;
    }

    const result=previousSetItem.call(this,key,value);
    if(Math.abs(deltaExpense)>=EPS){
      applyWafiDelta(-deltaExpense,'expense');
      console.info('HOMAR: WAFI OPPDATERT FRA UTGIFT:',-deltaExpense);
    }
    return result;
  }

  return previousSetItem.call(this,key,value);
};

window.homarAccountingTestState=function(){
  return {
    wafi:currentBudget().wafi,
    customerPaid:paidTotal(readJson(CUSTOMER_KEY,[])),
    expenses:totalExpensesWith(null,null)
  };
};

function restoreWrongShamitoWafiDeductionV2(){
  const rawBudget=localStorage.getItem(BUDGET_KEY);
  const shamito=readJson('homar_shamito',[]);
  if(!rawBudget||!Array.isArray(shamito)||shamito.length===0)return false;

  const budget=currentBudget();
  if(budget.shamitoWafiRefundV2===true)return true;

  const shamitoTotal=money(
    shamito.reduce(function(sum,row){
      if(!active(row))return sum;
      return sum+(Number(row.qty)||0)*(Number(row.price)||0);
    },0)
  );

  if(shamitoTotal<=EPS)return false;

  budget.wafi=money(budget.wafi+shamitoTotal);
  budget.shamitoWafiSeparatedV1=true;
  budget.shamitoWafiRefundV2=true;
  budget.shamitoWafiRefundAmountV2=shamitoTotal;
  budget.shamitoWafiRefundedAtV2=new Date().toISOString();
  writeBudget(budget);

  if(typeof window.renderBudsjetValues==='function'){
    try{window.renderBudsjetValues();}catch(_){}
  }

  console.info('HOMAR: TIDLIGERE SHAMITO-TREKK ER NÅ FØRT TILBAKE TIL WAFI:',shamitoTotal);
  return true;
}

let shamitoRefundAttempts=0;
const shamitoRefundTimer=setInterval(function(){
  shamitoRefundAttempts+=1;
  if(restoreWrongShamitoWafiDeductionV2()||shamitoRefundAttempts>=60){
    clearInterval(shamitoRefundTimer);
  }
},500);

setTimeout(restoreWrongShamitoWafiDeductionV2,0);
window.addEventListener('load',restoreWrongShamitoWafiDeductionV2);

console.info('HOMAR: SHAMITO REDUSERER KUN LAGER. TIDLIGERE FEILTREKK RETTES ETTER DATAINNLASTING (V6).');
})();