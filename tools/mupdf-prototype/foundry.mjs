// Call from a Foundry script macro; this preview uses no document write APIs.
export function openPrototype() {
  const dialog=document.createElement('dialog');
  dialog.style.cssText='width:min(1000px,90vw);height:85vh;padding:0;background:#212522;color:white';
  const close=document.createElement('button');close.textContent='Close prototype';close.style.margin='8px';
  const frame=document.createElement('iframe');frame.src=new URL('./index.html',import.meta.url).href;
  frame.title='Crows PDF extraction prototype';frame.style.cssText='width:100%;height:calc(100% - 55px);border:0';
  dialog.append(close,frame);document.body.append(dialog);
  close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
