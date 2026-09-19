import {readFile,writeFile} from 'node:fs/promises';
import {extractPage} from './extract.mjs';
const location=new URL('../out/mupdf-prototype/',import.meta.url);
const cases=JSON.parse(await readFile(new URL('baseline.json',location),'utf8'));
const cache=new Map(),results=[];
function compare(a,b,path='') {
  if(typeof a==='number' && typeof b==='number')return Math.abs(a-b)<=0.05?[]:[path];
  if(Array.isArray(a)&&Array.isArray(b))return a.length!==b.length?[`${path}.length (${a.length} vs ${b.length})`]:a.flatMap((v,i)=>compare(v,b[i],`${path}[${i}]`));
  if(a && b && typeof a==='object' && typeof b==='object')return Object.keys(a).flatMap(k=>compare(a[k],b[k],`${path}.${k}`));
  return a===b?[]:[path];
}
for(const c of cases){
  if(!cache.has(c.file))cache.set(c.file,new Uint8Array(await readFile(c.file)));
  const start=performance.now(),actual=extractPage(cache.get(c.file),c.page,c.kind);
  const differences=compare(c.expected,actual);
  results.push({kind:c.kind,file:c.file,page:c.page,records:actual.records.length,ms:Math.round(performance.now()-start),differences});
  if(differences.length) console.log(c.kind,c.page,differences.slice(0,6));
}
const summary={pages:results.length,passed:results.filter(r=>!r.differences.length).length,cards:results.filter(r=>r.kind==='cards').reduce((n,r)=>n+r.records,0),traits:results.filter(r=>r.kind==='traits').reduce((n,r)=>n+r.records,0),results};
await writeFile(new URL('comparison.json',location),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));
if(summary.passed!==summary.pages)process.exitCode=1;
