/* Stable city identity derived from the selected profile label, not Operations colors. */
(function(){
 const select=document.getElementById("studioProfileSelect");
 if(!select)return;
 function update(){
   const name=((select.selectedOptions&&select.selectedOptions[0]?.textContent)||select.value||"").toLowerCase();
   const city=/los angeles|(^|\W)la(\W|$)/.test(name)?"los-angeles":/new york|(^|\W)nyc?(\W|$)/.test(name)?"new-york":/miami/.test(name)?"miami":/chicago/.test(name)?"chicago":/san francisco/.test(name)?"san-francisco":/las vegas/.test(name)?"las-vegas":/boston/.test(name)?"boston":/washington|(^|\W)dc(\W|$)/.test(name)?"washington":"default";
   document.body.dataset.studioCity=city;
 }
 select.addEventListener("change",update);
 new MutationObserver(update).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:["value"]});
 update();
})();
