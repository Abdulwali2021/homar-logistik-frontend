(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const BUDGET_KEY='homar_budsjet';
const EXPENSE_KEYS=['homar_samen','homar_gari','homar_qarash','homar_dhagaxshid','homar_shamito'];

function parseJson(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null||raw===undefined)return fallback;
    const value=JSON.parse(raw);
    return value===null?fallback:value;
  }catch(_){
    return fallback;
  }
}

function active(row){
  return !!(row&&!row.deleted&&!row.deletedAt);
}

function paidTotal(list){
  if(!Array.isArray(list))return 0;
  return list.reduce(function(sum,order){
    if(!active(order))return sum;
    const payments=Array.isArray(order.payments)?order.payments:[];
    return sum+payments.reduce(function(paymentSum,payment){
      return paymentSum+Math.max(0,Number(payment&&payment.amount)||0);
    },0);
  },0);
}

function expenseTotal(){
  return EXPENSE_KEYS.reduce(function(total,key){
    const list=parseJson(key,[]);
    if(!Array.isArray(list))return total;
    return total+list.reduce(function(sum,row){
      if(!active(row))return sum;
      if(key==='homar_samen'){
        return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||Number(row.driverPrice)||0);
      }
      if(key==='homar_gari'||key==='homar_shamito'){
        return sum+(Number(row.qty)||0)*(Number(row.price)||0);
      }
      if(key==='homar_qarash'){
        return sum+(Number(row.antall)||0)*(Number(row.price)||0);
      }
      if(key==='homar_dhagaxshid'){
        return sum+(Number(row.qty)||0)*(Number(row.price)||0)+(Number(row.driver)||0);
      }
      return sum;
    },0);
  },0);
}

// Kun status/diagnose: Denne filen skal aldri skrive til WAFI.
// WAFI endres bare eksplisitt fra WAFI/BUDSJET-grensesnittet.
window.homarAccountingTestState=function(){
  const budget=parseJson(BUDGET_KEY,{});
  return {
    wafi:Math.max(0,Number(budget.wafi)||0),
    customerPaid:paidTotal(parseJson(CUSTOMER_KEY,[])),
    expenses:expenseTotal(),
    wafiAutomaticChanges:false
  };
};

console.info('HOMAR: WAFI ER LÅST TIL EKSPLISITT REGISTRERT BELØP. BETALINGER, UTGIFTER, SHAMITO OG VALUTAKURS ENDRER IKKE WAFI.');
})();