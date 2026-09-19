// Developer test: PLAYWRIGHT_MODULE may point to a bundled playwright index.mjs.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(relative(root,path).startsWith('..')){res.writeHead(403);res.end();return;}
    const data=await readFile(path);
    res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(path)]??'application/octet-stream');res.end(data);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/tools/mupdf-prototype/index.html`);
  const cases=JSON.parse(await readFile(new URL('../out/mupdf-prototype/baseline.json',import.meta.url),'utf8'));
  const selected=[cases.find(c=>c.kind==='cards' && c.expected.records.some(r=>r.raw_lines.some(l=>l.includes('12-16')))),cases.find(c=>c.kind==='traits')];
  const results=[];
  for(const c of selected){
    await page.locator('#file').setInputFiles(c.file);
    await page.locator('#kind').selectOption(c.kind);await page.locator('#page').fill(String(c.page));await page.locator('#run').click();
    await page.waitForFunction(()=>!document.querySelector('#run').disabled,{},{timeout:30000});
    assert.match(await page.locator('#status').textContent(),/^Extracted/);
    const actual=JSON.parse(await page.locator('#result').textContent());
    assert.deepEqual(actual.records,c.expected.records);
    if(c.kind==='traits')assert.deepEqual(actual.groups,c.expected.groups);
    results.push({kind:c.kind,page:c.page,records:actual.records.length,status:await page.locator('#status').textContent()});
  }
  await page.locator('#page').fill('9999');await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Page must be between'));
  assert.equal(await page.locator('#run').isEnabled(),true);
  await page.locator('#page').fill('1');await page.locator('#file').setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.ok(!(await page.locator('#status').textContent()).startsWith('Extracted'));
  await page.locator('#file').setInputFiles(selected[1].file);
  await page.locator('#page').fill(String(selected[1].page));
  await page.evaluate(()=>{document.querySelector('#probe').requestSubmit();document.querySelector('#cancel').click();});
  assert.equal(await page.locator('#status').textContent(),'Cancelled.');
  await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  assert.deepEqual(JSON.parse(await page.locator('#result').textContent()).records,selected[1].expected.records);
  // Exercise the Foundry macro's DOM-only entry point and close cleanup.
  await page.evaluate(async()=>{const {openPrototype}=await import('./foundry.mjs');openPrototype();});
  assert.equal(await page.locator('dialog iframe').count(),1);
  await page.getByRole('button',{name:'Close prototype'}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);
  await writeFile(new URL('../out/mupdf-prototype/browser-results.json',import.meta.url),JSON.stringify({results,invalidPage:true,invalidPDF:true,cancelAndRetry:true,launcher:true,pageErrors:errors},null,2));
  console.log(JSON.stringify({results,invalidPage:true,invalidPDF:true,cancelAndRetry:true,launcher:true,pageErrors:errors}));
} finally {await browser?.close();await new Promise(r=>server.close(r));}
