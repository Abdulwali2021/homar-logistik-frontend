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
const ADDITIVE_NUMBER_FIELDS=new Set(['qty','quantity','antall']);
const previousSetItem=Storage.prototype.setItem;
const nativeFetch=window.fetch.bind(window);
const REVISION_KEY='homar_server_state_revision';
const BASE_STATE_KEY='homar_server_state_base_v2';
const PENDING_SYNC_KEY='homar_pending_sync_keys';
let internalWrite=false;
let atomicQueue=Promise.resolve();
let atomicInFlight=false;
let lastNoticeAt=0;

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
  if(this!==localStorage||internalWrite||window.__homarApplyingRemoteState){
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

function jsonEqual(a,b){
  return JSON.stringify(a)===JSON.stringify(b);
}

function plainObject(value){
  return !!(value&&typeof value==='object'&&!Array.isArray(value));
}

function cloneValue(value){
  if(value===undefined)return undefined;
  try{return JSON.parse(JSON.stringify(value));}catch(_){return value;}
}

function rowIdentity(row){
  if(!plainObject(row))return null;
  const explicitId=row._syncId||row.id||row.uuid||row.paymentId;
  if(explicitId!==undefined&&explicitId!==null&&String(explicitId)){
    return 'id:'+String(explicitId);
  }
  if(row.createdAt){
    return 'created:'+String(row.createdAt)+':'+
      String(row.createdBy||row.user||row.username||'');
  }
  const name=row.type||row.name||row.navn||row.kundeNavn||
    row.gariType||row.phone||row.telefon||'';
  const dateValue=row.date||row.dato||row.betaltDato||'';
  if(name||dateValue){
    return 'legacy:'+String(name).trim().toUpperCase()+':'+
      String(dateValue)+':'+String(row.createdBy||'');
  }
  return 'value:'+JSON.stringify(row);
}

function mergeArrayValue(baseValue,localValue,remoteValue){
  const baseRows=Array.isArray(baseValue)?baseValue:[];
  const localRows=Array.isArray(localValue)?localValue:[];
  const remoteRows=Array.isArray(remoteValue)?remoteValue:[];
  const baseById=new Map(baseRows.map(function(row){return [rowIdentity(row),row];}));
  const localById=new Map(localRows.map(function(row){return [rowIdentity(row),row];}));
  const remoteById=new Map(remoteRows.map(function(row){return [rowIdentity(row),row];}));
  const result=[];

  remoteRows.forEach(function(remoteRow){
    const id=rowIdentity(remoteRow);
    const baseHas=baseById.has(id);
    const localHas=localById.has(id);
    if(!baseHas){
      result.push(localHas
        ? mergeConcurrentValue(undefined,localById.get(id),remoteRow)
        : remoteRow);
      return;
    }
    const baseRow=baseById.get(id);
    if(!localHas){
      if(!jsonEqual(remoteRow,baseRow))result.push(remoteRow);
      return;
    }
    result.push(mergeConcurrentValue(baseRow,localById.get(id),remoteRow));
  });

  localRows.forEach(function(localRow){
    const id=rowIdentity(localRow);
    if(!baseById.has(id)&&!remoteById.has(id))result.push(localRow);
  });
  return result;
}

function mergeObjectValue(baseValue,localValue,remoteValue){
  const base=plainObject(baseValue)?baseValue:{};
  const local=plainObject(localValue)?localValue:{};
  const remote=plainObject(remoteValue)?remoteValue:{};
  const result={};
  const keys=new Set(Object.keys(base).concat(Object.keys(local),Object.keys(remote)));

  keys.forEach(function(key){
    const baseHas=Object.prototype.hasOwnProperty.call(base,key);
    const localHas=Object.prototype.hasOwnProperty.call(local,key);
    const remoteHas=Object.prototype.hasOwnProperty.call(remote,key);
    if(!localHas){
      if(remoteHas&&(!baseHas||!jsonEqual(remote[key],base[key])))result[key]=remote[key];
      return;
    }
    if(!remoteHas){
      if(!baseHas)result[key]=local[key];
      return;
    }
    if(!baseHas){
      result[key]=jsonEqual(local[key],remote[key])?local[key]:remote[key];
      return;
    }
    result[key]=mergeConcurrentValue(base[key],local[key],remote[key],key);
  });
  return result;
}

function mergeConcurrentValue(baseValue,localValue,remoteValue,fieldName){
  if(jsonEqual(localValue,baseValue))return remoteValue;
  if(jsonEqual(remoteValue,baseValue))return localValue;
  if(jsonEqual(localValue,remoteValue))return localValue;
  if(ADDITIVE_NUMBER_FIELDS.has(fieldName)&&
    Number.isFinite(Number(baseValue))&&
    Number.isFinite(Number(localValue))&&
    Number.isFinite(Number(remoteValue))){
    return Number(baseValue)+
      (Number(localValue)-Number(baseValue))+
      (Number(remoteValue)-Number(baseValue));
  }
  if(Array.isArray(localValue)&&Array.isArray(remoteValue)){
    return mergeArrayValue(baseValue,localValue,remoteValue);
  }
  if(plainObject(localValue)&&plainObject(remoteValue)){
    return mergeObjectValue(baseValue,localValue,remoteValue);
  }
  return remoteValue;
}

function mergeBusinessState(baseState,localState,remoteState){
  const base=plainObject(baseState)?baseState:{};
  const local=plainObject(localState)?localState:{};
  const remote=plainObject(remoteState)?remoteState:{};
  const merged=Object.assign({},remote);
  BUSINESS_KEYS.forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(local,key))return;
    merged[key]=mergeConcurrentValue(base[key],local[key],remote[key]);
  });
  return merged;
}

function readBaseState(){
  return readJson(BASE_STATE_KEY,{});
}

function rememberBaseState(state){
  if(!plainObject(state))return;
  previousSetItem.call(localStorage,BASE_STATE_KEY,JSON.stringify(cloneValue(state)));
}

function pendingBusinessSync(){
  const pending=readJson(PENDING_SYNC_KEY,[]);
  return Array.isArray(pending)&&pending.some(function(key){return BUSINESS_KEYS.includes(key);});
}

function clearBusinessPending(){
  const pending=readJson(PENDING_SYNC_KEY,[]);
  const keep=Array.isArray(pending)
    ? pending.filter(function(key){return !BUSINESS_KEYS.includes(key);})
    : [];
  previousSetItem.call(localStorage,PENDING_SYNC_KEY,JSON.stringify(keep));
}

function applyServerState(state){
  if(!plainObject(state))return;
  window.__homarApplyingRemoteState=true;
  try{
    BUSINESS_KEYS.forEach(function(key){
      if(Object.prototype.hasOwnProperty.call(state,key)){
        previousSetItem.call(localStorage,key,JSON.stringify(state[key]));
      }
    });
  }finally{
    window.__homarApplyingRemoteState=false;
  }
  if(typeof window.refreshHomarImmediately==='function'){
    window.refreshHomarImmediately();
  }else if(typeof window.loadData==='function'){
    window.loadData();
  }
}

function showSyncNotice(message,isError){
  let box=document.getElementById('homarLiveSyncNotice');
  if(!box){
    box=document.createElement('div');
    box.id='homarLiveSyncNotice';
    box.setAttribute('role','status');
    box.setAttribute('aria-live','polite');
    Object.assign(box.style,{
      position:'fixed',right:'16px',bottom:'16px',zIndex:'100000',
      maxWidth:'420px',padding:'12px 16px',borderRadius:'10px',
      boxShadow:'0 4px 18px rgba(0,0,0,.22)',fontWeight:'700'
    });
    document.body.appendChild(box);
  }
  box.textContent=message;
  box.style.background=isError?'#fff3cd':'#e8f5e9';
  box.style.color=isError?'#856404':'#155724';
  box.style.display='block';
  const shownAt=Date.now();
  lastNoticeAt=shownAt;
  setTimeout(function(){
    if(lastNoticeAt===shownAt)box.style.display='none';
  },4500);
}

async function fetchCurrentState(url,headers){
  const stateUrl=url.replace(/\/state(?:\?.*)?$/,'/state');
  const response=await nativeFetch(stateUrl,{method:'GET',headers:headers||{},cache:'no-store'});
  const payload=await responseJson(response);
  if(response.ok&&payload){
    rememberRevision(payload.revision);
    rememberBaseState(payload.state||{});
    return payload;
  }
  return {state:{},revision:readRevision()===null?0:readRevision()};
}

async function handleSuccessfulBusinessWrite(response,payload,sentState){
  const returnedState=plainObject(payload&&payload.state)?payload.state:{};
  const committedState=Object.assign({},sentState,returnedState);
  const currentLocal=collectBusinessState();
  const safeLocalState=mergeBusinessState(sentState,currentLocal,committedState);
  rememberRevision(payload&&payload.revision);
  rememberBaseState(committedState);
  applyServerState(safeLocalState);
  if(payload&&payload.merged){
    showSyncNotice('NYE DATA FRA EN ANNEN BRUKER BLE SLÅTT SAMMEN.',false);
  }
  return response;
}

async function atomicBusinessRequest(input,init,url){
  atomicInFlight=true;
  try{
    let revision=readRevision();
    let baseState=readBaseState();
    if(revision===null||!Object.keys(baseState).length){
      const current=await fetchCurrentState(url,init&&init.headers);
      revision=Number.isInteger(Number(current.revision))?Number(current.revision):0;
      baseState=current.state||{};
    }

    let sentState=collectBusinessState();
    const atomicUrl=url.replace(/\/state(?:\?.*)?$/,'/state/business');

    for(let attempt=0;attempt<3;attempt+=1){
      const options=Object.assign({},init||{},{
        method:'PUT',
        body:JSON.stringify({
          state:sentState,
          baseState:baseState,
          expectedRevision:revision
        })
      });
      const response=await nativeFetch(atomicUrl,options);
      const payload=await responseJson(response);

      if(response.ok&&payload){
        return handleSuccessfulBusinessWrite(response,payload,sentState);
      }

      if(response.status===409&&payload&&payload.code==='STATE_CONFLICT'){
        const current=await fetchCurrentState(url,init&&init.headers);
        sentState=mergeBusinessState(baseState,sentState,current.state||{});
        baseState=current.state||{};
        revision=Number.isInteger(Number(current.revision))?Number(current.revision):0;
        continue;
      }

      if(response.status===409&&payload&&payload.code==='WAFI_INSUFFICIENT'){
        const current=await fetchCurrentState(url,init&&init.headers);
        applyServerState(current.state||{});
        clearBusinessPending();
        showSyncNotice(
          'ENDRINGEN BLE IKKE LAGRET FORDI WAFI IKKE HAR NOK SALDO.',
          true
        );
      }
      return response;
    }

    showSyncNotice('KUNNE IKKE SLÅ SAMMEN ENDRINGENE ENNÅ. PRØVER IGJEN AUTOMATISK.',true);
    return new Response(JSON.stringify({
      error:'MIDLERTIDIG SYNKRONISERINGSKONFLIKT',
      code:'STATE_CONFLICT'
    }),{status:409,headers:{'Content-Type':'application/json'}});
  }finally{
    atomicInFlight=false;
  }
}

window.fetch=function(input,init){
  const url=requestUrl(input);
  const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();

  if(method==='GET'&&isStatePath(url,'/api/state')){
    return nativeFetch(input,init).then(async function(response){
      const payload=await responseJson(response);
      if(response.ok&&payload){
        rememberRevision(payload.revision);
        rememberBaseState(payload.state||{});
      }
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
window.homarMergeBusinessState=mergeBusinessState;
window.homarRefreshFromServer=async function(){
  if(atomicInFlight||pendingBusinessSync()||document.hidden||
    !localStorage.getItem('homar_api_token')||typeof window.homarApiRequest!=='function'){
    return false;
  }
  const beforeRevision=readRevision();
  try{
    const payload=await window.homarApiRequest('/state');
    const nextRevision=Number(payload&&payload.revision);
    if(Number.isInteger(nextRevision)&&nextRevision>(beforeRevision===null?-1:beforeRevision)){
      applyServerState((payload&&payload.state)||{});
      showSyncNotice('DATA FRA EN ANNEN BRUKER ER OPPDATERT.',false);
      return true;
    }
  }catch(error){
    console.error('HOMAR live-oppdatering feilet:',error);
  }
  return false;
};
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
