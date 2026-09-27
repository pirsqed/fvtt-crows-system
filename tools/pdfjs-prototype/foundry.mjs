// A DOM-only preview: compatible with Foundry's restriction on package HTML.
export function openPrototype(){
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(1000px,90vw);height:85vh;padding:24px;background:#212522;color:#eee8da;font:16px/1.5 system-ui;overflow:auto';
  // Static markup only; extracted PDF content is always displayed as text.
  dialog.innerHTML=`<h1 style="font:30px Georgia">Crows PDF.js prototype</h1>
    <p>Choose a local PDF. Preview extraction without changing your world.</p>
    <form><label style="display:block;margin:12px 0">PDF <input data-id="file" type="file" accept=".pdf,application/pdf" required></label>
    <label style="display:block;margin:12px 0">Layout <select data-id="kind"><option value="cards">Inventory cards</option><option value="traits">Trait tree</option></select></label>
    <label style="display:block;margin:12px 0">PDF page number <input data-id="page" type="number" min="1" step="1" value="1" required></label>
    <button data-id="run" type="submit">Extract page</button> <button data-id="cancel" type="button" disabled>Cancel</button> <button data-id="close" type="button">Close prototype</button></form>
    <p data-id="status" role="status">Ready. Uses Foundry’s bundled PDF.js.</p>
    <pre data-id="result" style="white-space:pre-wrap;overflow-wrap:anywhere;background:#171b18;padding:16px"></pre>`;
  const $=id=>dialog.querySelector(`[data-id="${id}"]`);
  let worker=null,timer=null;
  const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);$('run').disabled=false;$('cancel').disabled=true;};
  $('close').onclick=()=>dialog.close();$('cancel').onclick=()=>{stop();$('status').textContent='Cancelled.';};
  const pagehide=()=>dialog.close();window.addEventListener('pagehide',pagehide,{once:true});
  dialog.addEventListener('close',()=>{stop();window.removeEventListener('pagehide',pagehide);dialog.remove();});
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();stop();$('run').disabled=true;$('cancel').disabled=false;$('result').textContent='';$('status').textContent='Reading PDF…';
    const started=performance.now();let current;
    try{
      current=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker=current;
      const fail=message=>{if(worker!==current)return;stop();$('status').textContent=message;};
      timer=setTimeout(()=>fail('Extraction timed out. Check access to Foundry’s bundled PDF.js and worker.'),30000);
      current.onerror=e=>fail(`Could not load extraction worker: ${e.message}`);
      current.onmessage=({data})=>{
        if(worker!==current)return;
        if(data.error){fail(data.error);return;}
        stop();$('status').textContent=`Extracted ${data.result.records.length} records in ${((performance.now()-started)/1000).toFixed(2)} seconds with PDF.js ${data.version}.`;
        $('result').textContent=JSON.stringify(data.result,null,2);
      };
      const bytes=await $('file').files[0].arrayBuffer();if(worker!==current)return;
      // Based on the module URL, so a Foundry reverse-proxy prefix is retained.
      const baseURL=new URL('../../../../scripts/pdfjs/',import.meta.url).href;
      $('status').textContent='Extracting page…';
      current.postMessage({bytes,page:Number($('page').value),kind:$('kind').value,baseURL},[bytes]);
    }catch(error){if(!current || worker===current){stop();$('status').textContent=error.message;}}
  };
  document.body.append(dialog);dialog.showModal();return dialog;
}
