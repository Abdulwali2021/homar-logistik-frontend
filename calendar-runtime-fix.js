(function(){
'use strict';

function setupUnifiedCalendar(){
  var select=document.getElementById('archiveModeSelect');
  var range=document.getElementById('archiveRangeContainer');
  if(!select||!range)return;

  if(!select.querySelector('option[value="month"]')){
    var opt=document.createElement('option');
    opt.value='month'; opt.textContent='VELG HELE MÅNEDEN';
    var rangeOpt=select.querySelector('option[value="range"]');
    select.insertBefore(opt,rangeOpt||null);
  }

  var monthBox=document.getElementById('archiveMonthContainer');
  if(!monthBox){
    monthBox=document.createElement('div');
    monthBox.id='archiveMonthContainer';
    monthBox.className='hidden';
    monthBox.style.cssText='display:flex;gap:8px;align-items:center;';
    monthBox.innerHTML='<label style="margin:0;font-size:12px;">MÅNED:</label><input type="month" id="archiveMonthInput">';
    range.parentNode.insertBefore(monthBox,range);
    document.getElementById('archiveMonthInput').addEventListener('change',function(){ if(typeof window.renderAllTables==='function') window.renderAllTables(); });
  }

  var monthInput=document.getElementById('archiveMonthInput');
  if(monthInput&&!monthInput.value&&window.todayStr)monthInput.value=String(window.todayStr).slice(0,7);

  var expense=document.getElementById('sectionUtgift');
  if(expense){
    var oldMonth=document.getElementById('utgiftMonthInput');
    if(oldMonth){
      var oldBox=oldMonth.closest('.filter-container');
      if(oldBox)oldBox.remove();
    }
  }
}

window.filterByCalendar=function(item){
  var select=document.getElementById('archiveModeSelect');
  var mode=select?select.value:'today';
  var itemDate=String(item&&((item.date)||(item.betaltDato))||'');
  if(mode==='all')return true;
  if(!itemDate)return false;
  var today=String(window.todayStr||'');
  if(mode==='today')return itemDate===today;
  if(mode==='month'){
    var m=document.getElementById('archiveMonthInput');
    var chosen=m?m.value:'';
    return !chosen||itemDate.slice(0,7)===chosen;
  }
  if(mode==='range'){
    var a=document.getElementById('archiveStartDateInput');
    var b=document.getElementById('archiveEndDateInput');
    var av=a?a.value:''; var bv=b?b.value:'';
    if(!av||!bv)return true;
    return itemDate>=av&&itemDate<=bv;
  }
  return true;
};

window.toggleArchiveModeInputs=function(){
  setupUnifiedCalendar();
  var mode=document.getElementById('archiveModeSelect').value;
  var month=document.getElementById('archiveMonthContainer');
  var range=document.getElementById('archiveRangeContainer');
  if(month)month.classList.toggle('hidden',mode!=='month');
  if(range)range.classList.toggle('hidden',mode!=='range');
  if(mode==='month'){
    var mi=document.getElementById('archiveMonthInput');
    if(mi&&!mi.value)mi.value=String(window.todayStr||new Date().toISOString().slice(0,10)).slice(0,7);
  }
  if(mode==='range'){
    var a=document.getElementById('archiveStartDateInput');
    var b=document.getElementById('archiveEndDateInput');
    var today=String(window.todayStr||new Date().toISOString().slice(0,10));
    if(a&&!a.value)a.value=today;
    if(b&&!b.value)b.value=today;
  }
  if(typeof window.renderAllTables==='function')window.renderAllTables();
};

window.resetArchiveFilter=function(){
  setupUnifiedCalendar();
  var select=document.getElementById('archiveModeSelect');
  if(select)select.value='today';
  var m=document.getElementById('archiveMonthInput'); if(m)m.value=String(window.todayStr||new Date().toISOString().slice(0,10)).slice(0,7);
  var a=document.getElementById('archiveStartDateInput'); if(a)a.value='';
  var b=document.getElementById('archiveEndDateInput'); if(b)b.value='';
  window.toggleArchiveModeInputs();
};

window.renderUtgiftValues=function(){
  var totals=window.calculateUtgiftTotals(function(row){return window.filterByCalendar(row);});
  var map=[['boxUtgiftSamen','samen'],['boxUtgiftGari','gari'],['boxUtgiftQarash','qarash'],['boxUtgiftShamito','shamito'],['boxUtgiftDhagax','dhagax'],['boxGrandUtgift','total']];
  map.forEach(function(pair){var el=document.getElementById(pair[0]);if(el)el.textContent=window.convertPriceToDisplay(totals[pair[1]]).toFixed(2);});
  return totals.total;
};

setupUnifiedCalendar();
var s=document.getElementById('archiveModeSelect');
if(s)s.addEventListener('change',function(){window.toggleArchiveModeInputs();});
window.toggleArchiveModeInputs();
console.info('HOMAR: én felles kalender er aktiv; ekstra UTGIFT-månedskalender er fjernet.');
})();