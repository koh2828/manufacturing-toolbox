/* Actual, local PDF.js + Tesseract synthetic corpus benchmark. No request contains source data. */
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TOOLBOX_ENGINE_BASE||'http://127.0.0.1:8768/dist/';
const out=process.env.TOOLBOX_TEST_OUTPUT||'/private/tmp/toolbox-document-engine';fs.mkdirSync(out,{recursive:true});
const variants=JSON.parse(process.env.TOOLBOX_ENGINE_VARIANTS||'null')||[{language:'jpn'}, {language:'eng+jpn',scale:3}, {language:'eng+jpn',preprocess:'contrast'}, {language:'eng+jpn',preprocess:'binary'}, {language:'eng+jpn',layout:'auto'}, {language:'jpn',layout:'block'}];
const fixture=process.env.TOOLBOX_DOCUMENT_FIXTURE||'mixed-certificates-20-pages.pdf';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),p=await context.newPage();
 const errors=[],requests=[],progress=[];let observe=false;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(observe)requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length||0});});
 await p.route(base+'engine-benchmark',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'self\' \'wasm-unsafe-eval\';worker-src \'self\';connect-src \'self\';img-src blob: data:;style-src \'unsafe-inline\';font-src \'self\' blob: data:"><input type="file" id="file"><canvas id="preview"></canvas><script src="document-engine.js"></script>'}));
 try{
  await p.goto(base+'engine-benchmark');await p.waitForFunction(()=>typeof DocumentEngine==='object');observe=true;
  await p.locator('#file').setInputFiles(path.resolve(__dirname,'fixtures/documents',fixture));
  await p.exposeFunction('engineProgress',m=>{progress.push(m);if(m.stage==='page-completed'||m.stage==='page-failed')console.log(JSON.stringify(m));});
  const result=await p.evaluate(async(variants)=>{const engine=DocumentEngine.create();const file=document.querySelector('#file').files[0];const results=[];
   for(const opts of variants) {
     results.push({options:opts,result:await engine.processFile(file,{pageNumbers:[5,8,11,15],...opts})});
   }await engine.dispose();return results;
  },variants);
  fs.writeFileSync(path.join(out,'engine-experiments.json'),JSON.stringify(result,null,2));
  assert.equal(errors.length,0);assert.ok(requests.every(r=>r.method==='GET'&&r.bytes===0&&r.url.startsWith(base+'vendor/document/')));
  console.log(JSON.stringify({output:out,variants:result.length,errors,requests:requests.length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
