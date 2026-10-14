/* Actual, local PDF.js + Tesseract synthetic corpus benchmark. No request contains source data. */
const cp=require('node:child_process'),os=require('node:os');
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TOOLBOX_ENGINE_BASE||'http://127.0.0.1:8768/dist/';
const out=process.env.TOOLBOX_TEST_OUTPUT||'/private/tmp/toolbox-document-engine';fs.mkdirSync(out,{recursive:true});
const engineOptions=JSON.parse(process.env.TOOLBOX_ENGINE_OPTIONS||'{}');
const fixture=process.env.TOOLBOX_DOCUMENT_FIXTURE||'mixed-certificates-20-pages.pdf';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),p=await context.newPage();
 const errors=[],requests=[],progress=[];let observe=false;let peakBrowserRSSBytes=0;
 const memoryTimer=setInterval(()=>{try{const rows=cp.execFileSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));const ids=new Set([process.pid]);for(let i=0;i<10;i++)for(const [pid,parent] of rows)if(ids.has(parent))ids.add(pid);const rss=rows.filter(([pid])=>pid!==process.pid&&ids.has(pid)).reduce((sum,row)=>sum+row[2]*1024,0);peakBrowserRSSBytes=Math.max(peakBrowserRSSBytes,rss);}catch(_){}},250);
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(observe)requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length||0});});
 await p.route(base+'engine-benchmark',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'self\' \'wasm-unsafe-eval\';worker-src \'self\';connect-src \'self\';img-src blob: data:;style-src \'unsafe-inline\';font-src \'self\' blob: data:"><input type="file" id="file"><canvas id="preview"></canvas><script src="document-engine.js"></script>'}));
 try{
  await p.goto(base+'engine-benchmark');await p.waitForFunction(()=>typeof DocumentEngine==='object');observe=true;
  await p.locator('#file').setInputFiles(path.resolve(__dirname,'fixtures/documents',fixture));
  await p.exposeFunction('engineProgress',m=>{progress.push(m);if(m.stage==='page-completed'||m.stage==='page-failed')console.log(JSON.stringify(m));});
  const result=await p.evaluate(async(engineOptions)=>{
    let last=performance.now(),maxLag=0,peakHeap=0;const samples=[];
    const timer=setInterval(()=>{const n=performance.now();maxLag=Math.max(maxLag,n-last-50);last=n;const heap=performance.memory?.usedJSHeapSize||null;if(heap)peakHeap=Math.max(peakHeap,heap);samples.push({t:n,heap});},50);
    window.engine=DocumentEngine.create({onProgress:m=>window.engineProgress(m)});
    const file=document.querySelector('#file').files[0];window.sourceFile=file;
    try {const result=await engine.processFile(file,{language:'eng+jpn',...engineOptions});await engine.render(file,1,document.querySelector('#preview'));return {result,metrics:{maxMainThreadLagMs:maxLag,peakMainThreadJSHeapBytes:peakHeap,sampleCount:samples.length,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory}};}
    finally{clearInterval(timer);}
  },engineOptions);
  result.metrics.peakBrowserProcessTreeRSSBytes=peakBrowserRSSBytes;result.metrics.memoryMethod='RSS sum of Chrome process tree, 250ms samples; includes shared pages and browser baseline; main JS heap separately';result.metrics.os={platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model};result.metrics.fixture=fixture;result.metrics.fixtureSHA256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'fixtures/documents',fixture))).digest('hex');result.metrics.measuredOn='2026-10-14 Asia/Tokyo';
  fs.writeFileSync(path.join(out,'engine-result.json'),JSON.stringify(result,null,2));
  assert.ok(result.result.pages.length>0);assert.equal(result.result.pages.filter(p=>p.status==='failed').length,0,'every page processed');
  assert.equal(errors.length,0,'no uncaught browser errors');
  assert.ok(requests.every(r=>r.method==='GET'&&r.bytes===0&&r.url.startsWith(base+'vendor/document/')),'only same-origin static runtime/model requests');
  if(!process.env.TOOLBOX_SKIP_REPROCESS&&result.result.pages.length===20){
    const comparison=await p.evaluate(async()=>{const results=[];for(const opts of [{pageNumbers:[6],deskew:2},{pageNumbers:[11],preprocess:'contrast'},{pageNumbers:[11],preprocess:'binary'},{pageNumbers:[19],deskew:-1.5,denoise:true}]){results.push(await engine.processFile(sourceFile,{language:'eng+jpn',...opts}));}return results;});
    fs.writeFileSync(path.join(out,'engine-reprocess.json'),JSON.stringify(comparison,null,2));
  }
  const cancellation=await p.evaluate(async()=>{let completed=0;const job=engine.processFile(sourceFile,{forceOCR:true,onPage:()=>completed++});setTimeout(()=>engine.cancel(),250);let code='';try{await job;}catch(e){code=e.code;}const retry=await engine.processFile(sourceFile,{pageNumbers:[1]});return {code,completed,retryStatus:retry.pages[0].status};});
  assert.equal(cancellation.code,'CANCELLED');assert.equal(cancellation.retryStatus,'completed');
  const safeguards=await p.evaluate(async()=>{const checks=[];
    for(const [name,bytes,type,expected] of [['bad.pdf','not a valid PDF','application/pdf','DOCUMENT_UNREADABLE'],['bad.txt','manufacturing data','text/plain','FILE_TYPE'],['empty.pdf','','application/pdf','FILE_SIZE']]){let code='';try{await engine.processFile(new File([bytes],name,{type}));}catch(e){code=e.code;}checks.push({case:name,code,expected});}
    const canvas=document.querySelector('#preview');const previews=await Promise.allSettled([engine.render(sourceFile,1,canvas),engine.render(sourceFile,1,canvas),engine.render(sourceFile,1,canvas)]);return {checks,previewLast:previews.at(-1).status};});
  for(const c of safeguards.checks)assert.equal(c.code,c.expected,c.case);assert.equal(safeguards.previewLast,'fulfilled');
  assert.equal(errors.length,0,'no uncaught errors after malformed files and preview race');assert.ok(requests.every(r=>r.method==='GET'&&r.bytes===0&&r.url.startsWith(base+'vendor/document/')));
  await p.screenshot({path:path.join(out,'engine-preview.png'),fullPage:true});await p.evaluate(()=>engine.dispose());
  fs.writeFileSync(path.join(out,'engine-audit.json'),JSON.stringify({errors,requests,progress,cancellation,safeguards,metrics:result.metrics},null,2));console.log(JSON.stringify({output:out,pages:result.result.pages.length,timings:result.result.timings,metrics:result.metrics,requests:requests.length,cancellation}));
 }finally{clearInterval(memoryTimer);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
