import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extractPage} from './extract.mjs';
import {pathToFileURL} from 'node:url';
const baseURL=pathToFileURL(process.env.FOUNDRY_PDFJS ?? 'C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/').href;
const pdfjs=await import(new URL('build/pdf.mjs',baseURL));
pdfjs.GlobalWorkerOptions.workerSrc=new URL('build/pdf.worker.mjs',baseURL).href;
const location=new URL('../out/mupdf-prototype/',import.meta.url);
const cases=JSON.parse(await readFile(new URL('baseline.json',location),'utf8'));
if(!cases.length)throw new Error('The Python baseline is empty.');
await mkdir(new URL('../out/pdfjs-prototype/',import.meta.url),{recursive:true});
const cache=new Map(),results=[];
import {compare} from './comparison.mjs';
for(const c of cases){
  if(!cache.has(c.file))cache.set(c.file,new Uint8Array(await readFile(c.file)));
  const start=performance.now(),actual=await extractPage(cache.get(c.file),c.page,c.kind,{pdfjs,baseURL});
  const differences=compare(c.expected,actual);
  results.push({kind:c.kind,file:c.file,page:c.page,records:actual.records.length,ms:Math.round(performance.now()-start),differences,normalizedDifferences:compare(c.expected,actual,{normalize:true}),actual});
  if(differences.length) console.log(c.kind,c.page,differences.slice(0,6));
}
const summary={pdfjsVersion:pdfjs.version,normalizedPassed:results.filter(r=>!r.normalizedDifferences.length).length,pages:results.length,passed:results.filter(r=>!r.differences.length).length,cards:results.filter(r=>r.kind==='cards').reduce((n,r)=>n+r.records,0),traits:results.filter(r=>r.kind==='traits').reduce((n,r)=>n+r.records,0),results};
await writeFile(new URL('../out/pdfjs-prototype/comparison.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));
if(summary.normalizedPassed!==summary.pages)process.exitCode=1;


