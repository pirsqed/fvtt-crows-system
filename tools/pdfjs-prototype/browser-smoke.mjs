import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
import {compare} from './comparison.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const library=process.env.FOUNDRY_PDFJS??'C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/';
const prefix='/test-foundry/',systemPath=prefix+'systems/fvtt-crows-system/';
const served=new Set();
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(pathname===prefix+'game'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Foundry route harness</title><body>PDF.js browser integration test</body>');return;}
    let base,tail;
    if(pathname.startsWith(prefix+'scripts/pdfjs/')){base=library;tail=pathname.slice((prefix+'scripts/pdfjs/').length);}
    else if(pathname.startsWith(systemPath)){base=root;tail=pathname.slice(systemPath.length);}
    else {res.writeHead(404);res.end();return;}
    const path=resolve(base,tail);
    if(relative(base,path).startsWith('..')){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);served.add(pathname);
    // Foundry 14.361+ serves package HTML as text/plain. Our launcher needs none.
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.html':'text/plain'})[extname(path)]??'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage(),errors=[],unexpected=[];
  const origin=`http://127.0.0.1:${server.address().port}`;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin))unexpected.push(r.url());});
  await page.goto(origin+prefix+'game');
  await page.evaluate(async path=>{const {openPrototype}=await import(path);openPrototype();},systemPath+'tools/pdfjs-prototype/foundry.mjs');
  const $=id=>page.locator(`[data-id="${id}"]`);
  const cases=JSON.parse(await readFile(new URL('../out/mupdf-prototype/baseline.json',import.meta.url),'utf8'));
  const selected=[cases.find(c=>c.kind==='cards'&&c.expected.records.some(r=>r.raw_lines.some(l=>l.includes('12-16')))),cases.find(c=>c.kind==='traits'),cases.find(c=>c.kind==='cards'&&c.expected.records.some(r=>r.raw_lines.some(l=>l.includes('\u200b'))))];
  const results=[];
  async function run(c){
    await $('file').setInputFiles(c.file);await $('kind').selectOption(c.kind);await $('page').fill(String(c.page));await $('run').click();
    await page.waitForFunction(()=>!document.querySelector('[data-id="run"]').disabled,{},{timeout:35000});
    const status=await $('status').textContent();assert.match(status,/^Extracted/);
    const actual=JSON.parse(await $('result').textContent());assert.deepEqual(compare(c.expected,actual,{normalize:true}),[]);
    return {kind:c.kind,page:c.page,records:actual.records.length,strictDifferences:compare(c.expected,actual),status};
  }
  for(const c of selected)results.push(await run(c));
  await $('page').fill('9999');await $('run').click();await page.waitForFunction(()=>!document.querySelector('[data-id="run"]').disabled);
  assert.match(await $('status').textContent(),/^Page must be between/);
  await $('file').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});await $('page').fill('1');await $('run').click();
  await page.waitForFunction(()=>!document.querySelector('[data-id="run"]').disabled);assert.doesNotMatch(await $('status').textContent(),/^Extracted/);
  await $('file').setInputFiles(selected[0].file);
  await page.evaluate(()=>{document.querySelector('dialog form').requestSubmit();document.querySelector('[data-id="cancel"]').click();});assert.equal(await $('status').textContent(),'Cancelled.');
  await run(selected[1]);
  await $('close').click();await page.locator('dialog').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  assert.ok([...served].some(p=>p.endsWith('/build/pdf.worker.mjs')));
  assert.ok(![...served].some(p=>p.endsWith('.html')));
  await writeFile(new URL('../out/pdfjs-prototype/browser-results.json',import.meta.url),JSON.stringify({results,invalidPage:true,invalidPDF:true,cancelAndRetry:true,launcher:true,reverseProxyPrefix:true,externalRequests:unexpected,pageErrors:errors,served:[...served]},null,2));
  console.log(JSON.stringify({results,invalidPage:true,invalidPDF:true,cancelAndRetry:true,launcher:true,reverseProxyPrefix:true,pageErrors:errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
