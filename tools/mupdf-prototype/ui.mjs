const $=id=>document.getElementById(id);
let worker=null;
function stop(){worker?.terminate();worker=null;$('run').disabled=false;$('cancel').disabled=true;}
$('cancel').onclick=()=>{stop();$('status').textContent='Cancelled.';};
window.addEventListener('pagehide',stop);
$('probe').onsubmit=async event=>{
  event.preventDefault();stop();$('run').disabled=true;$('cancel').disabled=false;
  $('result').textContent='';$('status').textContent='Reading PDF…';
  const current=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker=current;
  const started=performance.now();
  current.onerror=event=>{if(worker!==current)return;$('status').textContent=`Could not load the extraction worker: ${event.message}. Check the prototype runtime installation.`;stop();};
  current.onmessage=({data})=>{
    if(worker!==current)return;
    if(data.error)$('status').textContent=data.error;
    else {$('status').textContent=`Extracted ${data.result.records.length} records in ${((performance.now()-started)/1000).toFixed(2)} seconds.`;$('result').textContent=JSON.stringify(data.result,null,2);}
    stop();
  };
  try {const bytes=await $('file').files[0].arrayBuffer();if(worker!==current)return;$('status').textContent='Extracting page…';current.postMessage({bytes,page:Number($('page').value),kind:$('kind').value},[bytes]);}
  catch(error){if(worker===current){$('status').textContent=error.message;stop();}}
};
