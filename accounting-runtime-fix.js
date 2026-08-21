(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const BUDGET_KEY='homar_budsjet';
const EXPENSE_KEYS=new Set(['homar_samen','homar_gari','homar_qarash','homar_dhagaxshid']);
const BUSINESS_KEYS=[
  'homar_lager','homar_samen','homar_shamito','homar_kunde',
  'homar_dhagaxshid','homar_gari','homar_qarash','homar_budsjet'
];
const ACCOUNTING_VERSION=1;
const EPS=0.005;
const previousSetItem=Storage.prototype.setItem;
const nativeFetch=window.fetch.bind(window);
const REVISION_KEY='homar_server_state_revision';
const PENDING_SYNC_KEY='homar_pending_sync_keys';
let internalWrite=false;
let atomicQueue=Promise.resolve();
let conflictReloadScheduled=false;

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

function requestUrl(input){
  if(typeof input==='string')return input;
  if(input&&typeof input.url==='string')return input.url;
  return String(input||'');
}

function isStatePath(url,path){
  try{
    return new URL(url,window.location.href).pathname===path;
  }catch(_){
    return false;
  }
}

function rememberRevision(value){
  const revision=Number(value);
  if(!Number.isInteger(revision)||revision<0)return;
  previousSetItem.call(localStorage,REVISION_KEY,String(revision));
}

function readRevision(){
  const revision=Number(localStorage.getItem(REVISION_KEY));
  return Number.isInteger(revision)&&revision>=0?revision:null;
}

function collectBusinessState(){
  const state={};
  BUSINESS_KEYS.forEach(function(key){
    const value=readJson(key,undefined);
    if(value!==undefined)state[key]=value;
  });
  return state;
}

async function responseJson(response){
  try{return await response.clone().json();}catch(_){return null;}
}

async function fetchCurrentRevision(url,headers){
  const stateUrl=url.replace(/\/state(?:\?.*)?$/,'/state');
  const response=await nativeFetch(stateUrl,{method:'GET',headers:headers||{},cache:'no-store'});
  const payload=await responseJson(response);
  if(response.ok&&payload)rememberRevision(payload.revision);
  return readRevision()===null?0:readRevision();
}

async function atomicBusinessRequest(input,init,url){
  let revision=readRevision();
  if(revision===null)revision=await fetchCurrentRevision(url,init&&init.headers);

  const atomicUrl=url.replace(/\/state(?:\?.*)?$/,'/state/business');
  const options=Object.assign({},init||{}, {
    method:'PUT',
    body:JSON.stringify({state:collectBusinessState(),expectedRevision:revision})
  });
  const response=await nativeFetch(atomicUrl,options);
  const payload=await responseJson(response);

  if(response.ok&&payload){
    rememberRevision(payload.revision);
    if(payload.state&&payload.state.homar_budsjet){
      previousSetItem.call(localStorage,BUDGET_KEY,JSON.stringify(payload.state.homar_budsjet));
    }
    return response;
  }

  if(response.status===409&&payload&&
    (payload.code==='STATE_CONFLICT'||payload.code==='WAFI_INSUFFICIENT')){
    if(payload.code==='STATE_CONFLICT')rememberRevision(payload.currentRevision);
    previousSetItem.call(localStorage,PENDING_SYNC_KEY,'[]');
    if(!conflictReloadScheduled){
      conflictReloadScheduled=true;
      alert(payload.code==='STATE_CONFLICT'
        ? 'DATA BLE OPPDATERT PÅ EN ANNEN ENHET. SIDEN LASTES INN PÅ NYTT SLIK AT INGEN DATA OVERSKRIVES.'
        : 'ENDRINGEN BLE IKKE LAGRET FORDI WAFI IKKE HAR NOK SALDO. SIDEN LASTES INN PÅ NYTT.');
      setTimeout(function(){window.location.reload();},50);
    }
  }
  return response;
}

window.fetch=function(input,init){
  const url=requestUrl(input);
  const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();

  if(method==='GET'&&isStatePath(url,'/api/state')){
    return nativeFetch(input,init).then(async function(response){
      const payload=await responseJson(response);
      if(response.ok&&payload)rememberRevision(payload.revision);
      return response;
    });
  }

  if(method==='PUT'&&isStatePath(url,'/api/state')){
    let body=null;
    try{body=JSON.parse(String(init&&init.body||'{}'));}catch(_){body=null;}
    const state=body&&body.state;
    const hasState=state&&typeof state==='object'&&!Array.isArray(state);
    const hasBusinessState=hasState&&BUSINESS_KEYS.some(function(key){
      return Object.prototype.hasOwnProperty.call(state,key);
    });
    if(hasBusinessState){
      const remainingState={};
      Object.keys(state).forEach(function(key){
        if(!BUSINESS_KEYS.includes(key))remainingState[key]=state[key];
      });
      const request=atomicQueue.then(async function(){
        const atomicResponse=await atomicBusinessRequest(input,init||{},url);
        if(!atomicResponse.ok||!Object.keys(remainingState).length)return atomicResponse;
        return nativeFetch(url,Object.assign({},init||{}, {
          method:'PUT',
          body:JSON.stringify({state:remainingState})
        }));
      });
      atomicQueue=request.catch(function(){});
      return request;
    }
  }

  return nativeFetch(input,init);
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

console.info('HOMAR: UTGIFT/WAFI/LAGER SYNKRONISERES ATOMISK. SHAMITO PÅVIRKER BARE LAGER.');
})();
