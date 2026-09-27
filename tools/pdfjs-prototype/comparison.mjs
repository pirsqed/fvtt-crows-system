// Keep strict and explicitly normalized comparisons separate in the report.
export const normalizeSeparators=s=>s.replace(/\u200b/g,' ').replace(/\s+/g,' ').trim();
export function compare(a,b,{normalize=false}={},path=''){
  if(typeof a==='number' && typeof b==='number')return Math.abs(a-b)<=0.05?[]:[{path,expected:a,actual:b}];
  if(Array.isArray(a)&&Array.isArray(b))return a.length!==b.length?[{path:path+'.length',expected:a.length,actual:b.length}]:a.flatMap((v,i)=>compare(v,b[i],{normalize},`${path}[${i}]`));
  if(a && b && typeof a==='object' && typeof b==='object')return Object.keys(a).flatMap(k=>compare(a[k],b[k],{normalize},`${path}.${k}`));
  if(normalize && typeof a==='string' && typeof b==='string')return normalizeSeparators(a)===normalizeSeparators(b)?[]:[{path,expected:a,actual:b}];
  return a===b?[]:[{path,expected:a,actual:b}];
}
