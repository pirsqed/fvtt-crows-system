import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base=pathToFileURL(process.env.FOUNDRY_PDFJS ?? 'C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/').href;
const pdfjs=await import(new URL('build/pdf.mjs',base));
pdfjs.GlobalWorkerOptions.workerSrc=new URL('build/pdf.worker.mjs',base).href;
const cases=JSON.parse(await readFile(new URL('../out/mupdf-prototype/baseline.json',import.meta.url),'utf8'));
const c=cases[Number(process.argv[2]??0)];
const task=pdfjs.getDocument({data:new Uint8Array(await readFile(c.file)),fontExtraProperties:true,disableFontFace:true});
try {
 const doc=await task.promise,page=await doc.getPage(c.page),ops=await page.getOperatorList(),text=await page.getTextContent({disableNormalization:true});
 const fonts={};for(const k of Object.keys(text.styles)){const f=page.commonObjs.get(k);fonts[k]={name:f.name,bold:f.bold,italic:f.italic,ascent:f.ascent,descent:f.descent,flags:f.flags};}
 const names=Object.fromEntries(Object.entries(pdfjs.OPS).map(([k,v])=>[v,k]));
 const data={case:{file:c.file,page:c.page,kind:c.kind},fonts,styles:text.styles,items:text.items,ops:ops.fnArray.map((f,i)=>[names[f],ops.argsArray[i]])};
 await mkdir(new URL('../out/pdfjs-prototype/',import.meta.url),{recursive:true});
 await writeFile(new URL('../out/pdfjs-prototype/inspect.json',import.meta.url),JSON.stringify(data,null,2));
 console.log(JSON.stringify({fonts,styles:text.styles,items:text.items.slice(0,8),ops:data.ops.slice(0,12)},null,2));
}finally{await task.destroy();}
