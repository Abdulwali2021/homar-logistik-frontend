(function(){
'use strict';

const CUSTOMER_KEY='homar_kunde';
const EPS=0.005;

function readCustomers(){
  try{return JSON.parse(localStorage.getItem(CUSTOMER_KEY)||'[]')||[];}catch(_){return [];}
}

function today(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function orderTotal(item){
  if(typeof window.customerOrderTotal==='function'){
    const n=Number(window.customerOrderTotal(item));
    if(Number.isFinite(n))return Math.max(0,n);
  }
  return Math.max(0,(Number(item&&item.qty)||0)*(Number(item&&item.price)||0));
}

function paidTotal(item){
  const payments=Array.isArray(item&&item.payments)?item.payments:[];
  return payments.reduce(function(sum,p){return sum+Math.max(0,Number(p&&p.amount)||0);},0);
}

function currentUser(){
  try{return typeof window.getCurrentUser==='function'?window.getCurrentUser():'ADMIN';}catch(_){return 'ADMIN';}
}

function setStatusButton(paid){
  const btn=document.getElementById('cStatusBtn');
  const input=document.getElementById('cStatus');
  const dateInput=document.getElementById('cBetaltDato');
  if(!btn||!input)return;

  btn.disabled=false;
  btn.removeAttribute('disabled');
  btn.style.width='100%';
  btn.style.height='38px';
  btn.style.cursor='pointer';

  if(paid){
    input.value='Betalt';
    btn.textContent='BETALING';
    btn.className='status-btn status-betalt';
    if(dateInput&&!dateInput.value)dateInput.value=today();
  }else{
    input.value='Deen';
    btn.textContent='DEEN';
    btn.className='status-btn status-deen';
    if(dateInput)dateInput.value='';
  }
}

window.toggleFormStatus=function(){
  const input=document.getElementById('cStatus');
  const isPaid=input&&String(input.value).toLowerCase()==='betalt';
  setStatusButton(!isPaid);
};

function activateButton(){
  const btn=document.getElementById('cStatusBtn');
  if(!btn)return;
  btn.disabled=false;
  btn.removeAttribute('disabled');
  btn.onclick=window.toggleFormStatus;
  btn.title='KLIKK FOR Å BYTTE MELLOM DEEN OG BETALING';
  if(String(btn.textContent||'').trim().toUpperCase()==='BETALT')btn.textContent='BETALING';
}

const originalSaveCustomer=window.saveCustomer;
if(typeof originalSaveCustomer==='function'){
  window.saveCustomer=function(){
    const statusInput=document.getElementById('cStatus');
    const wantedPaid=!!statusInput&&String(statusInput.value).toLowerCase()==='betalt';
    const before=readCustomers();
    const beforeRows=before.map(function(x){try{return JSON.stringify(x);}catch(_){return '';}});

    const result=originalSaveCustomer.apply(this,arguments);

    if(!wantedPaid)return result;

    const after=readCustomers();
    let changedIndex=-1;

    if(after.length>before.length){
      changedIndex=after.length-1;
    }else{
      for(let i=0;i<after.length;i++){
        let now='';
        try{now=JSON.stringify(after[i]);}catch(_){}
        if(now!==beforeRows[i]){changedIndex=i;break;}
      }
    }

    if(changedIndex<0||!after[changedIndex])return result;

    const item=after[changedIndex];
    if(!Array.isArray(item.payments))item.payments=[];
    const remaining=Math.max(0,orderTotal(item)-paidTotal(item));

    if(remaining>EPS){
      item.payments.push({
        amount:remaining,
        date:today(),
        createdBy:currentUser(),
        createdAt:new Date().toISOString()
      });
    }

    if(typeof window.syncCustomerPaymentState==='function'){
      window.syncCustomerPaymentState(item);
    }else{
      item.status='Betalt';
      item.betaltDato=today();
    }

    localStorage.setItem(CUSTOMER_KEY,JSON.stringify(after));

    try{
      if(typeof window.loadData==='function')window.loadData();
      else if(typeof window.renderAllTables==='function')window.renderAllTables();
    }catch(_){}

    return result;
  };
}

activateButton();
setTimeout(activateButton,0);
setTimeout(activateButton,300);

const observer=new MutationObserver(function(){activateButton();});
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});

console.info('HOMAR: KUNDE STATUS KAN KLIKKES MELLOM DEEN OG BETALING.');
})();