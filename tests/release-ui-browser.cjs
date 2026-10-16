const {chromium,webkit}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.TOOLBOX_URL||'http://127.0.0.1:8770/Launch.html',out=process.env.TOOLBOX_TEST_OUTPUT||'local-test-results/release-ui';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),p=await ctx.newPage();let checks=0,acceptConfirm=false;const errors=[],requests=[];
 const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS',label);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.type()==='beforeunload'||acceptConfirm?d.accept():d.dismiss());ctx.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));
 await p.goto(url+'#home');await p.waitForFunction(()=>typeof state!=='undefined');check(await p.evaluate(()=>{const original=di.busy;di.busy=true;const warned=hasMemoryWork();di.busy=original;return warned;}),'OCR in progress protected by unload guard');
 check(await p.locator('.release-intro').isVisible(),'free beta home introduction');check(await p.locator('[data-open-tool]').count()===4,'four primary tools remain');
 await p.locator('#release-quality-sample').click();check(await p.evaluate(()=>state.data.isDemo&&state.result.n>0),'home quality sample computes');
 const real={headers:['Date','Lot','Product','Value','Method','Unit'],rows:Array.from({length:8},(_,i)=>['2026-09-01',String(123+i).padStart(6,'0'),'DEMO-A',10+i,'M1','mPa·s'])};
 await p.locator('#data-file').setInputFiles({name:'SYNTHETIC-OWNER.csv',mimeType:'text/csv',buffer:Buffer.from([real.headers,...real.rows].map(r=>r.join(',')).join('\n'))});
 await p.waitForFunction(()=>state.data.name==='SYNTHETIC-OWNER.csv');
 const before=await p.evaluate(()=>({rows:state.data.rows,name:state.data.name,quality:state.quality,n:state.result.n}));
 await p.locator('#demo').click();check(await p.evaluate(()=>state.data.isDemo),'sample opens beside retained original');
 await p.locator('[data-nav="feedback"]').click();check(await p.locator('#feedback-unconfigured').isVisible(),'unconfigured form truthful');check(await p.locator('#feedback-external').count()===0,'no fake send link');
 await p.locator('[data-language="en"]').click();check(await p.locator('#page-title').innerText()==='Feedback & Contact','feedback English');
 await p.locator('[data-nav="capability"]').click();await p.locator('[data-restore-sample="capability"]').click();
 check(JSON.stringify(await p.evaluate(()=>({rows:state.data.rows,name:state.data.name,quality:state.quality,n:state.result.n})))===JSON.stringify(before),'sample return preserves original data, mapping and calculation');
 check(await p.evaluate(()=>state.data.rows[0][1])==='000123','leading zero lot preserved');
 await p.locator('#demo').click();
 await p.evaluate(()=>{setData({headers:['Lot','Value'],rows:[['B0001',90],['B0002',100]]},'NEW-B.csv');render();});
 await p.locator('#demo').click();check(await p.evaluate(()=>state.data.name==='NEW-B.csv'),'cancel backup replacement keeps new real file');
 await p.locator('[data-restore-sample="capability"]').click();check(await p.evaluate(()=>state.data.name==='NEW-B.csv'),'cancel restore does not overwrite new real file');
 acceptConfirm=true;await p.locator('#demo').click();acceptConfirm=false;await p.locator('[data-restore-sample="capability"]').click();check(await p.evaluate(()=>state.data.name==='NEW-B.csv'&&state.data.rows[0][1]===90),'accepted new snapshot restores B rather than stale A');

 for(const tool of ['cycle','pareto','clean','rci']){
  await p.evaluate(tool=>navigate(tool),tool);
  await p.evaluate(tool=>{const d=tool==='cycle'?{headers:['Product','Lot','Start time','End time'],rows:[['A','000123','2026-09-01 00:00','2026-09-02 00:00']]}:tool==='rci'?{headers:['Date','Event'],rows:[['2026-09-01','Synthetic event']]}:{headers:['Category','Value'],rows:[['000123','<0.01'],['A',4]]};setData(d,'USER-'+tool+'.csv');render();},tool);
  const original=await p.evaluate(()=>JSON.stringify(activeData()));await p.locator('#demo').click();await p.locator('[data-restore-sample="'+tool+'"]').click();check(await p.evaluate(()=>JSON.stringify(activeData()))===original,tool+' sample return');
 }
 await p.evaluate(()=>{state.rci={...blankRCI(),title:'UNSAVED SYNTHETIC RCI'};dirty=true;renderRCI();});
 await p.locator('#rci-demo').click();await p.locator('[data-restore-sample="rciProject"]').click();check(await p.evaluate(()=>state.rci.title==='UNSAVED SYNTHETIC RCI'&&dirty),'RCI sample return keeps unsaved draft');
 for(const tool of ['recurring','batch']){
  await p.evaluate(tool=>{navigate(tool);const w=wfState();w.sources=wfSampleSources(tool);w.sources.forEach(s=>{s.isDemo=false;s.name='USER-'+s.name;});w.settings.reportTitle='Owner report';render();},tool);
  const original=await p.evaluate(()=>JSON.stringify(wfState()));await p.locator('#wf-sample').click();await p.locator('[data-restore-sample="'+tool+'"]').click();check(await p.evaluate(()=>JSON.stringify(wfState()))===original,tool+' sample restores files and settings');
 }
 // Only the external destination is mocked. Real app routing and preserved state are exercised.
 await ctx.route('https://tally.so/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Mock feedback destination</title><p>Submission disabled in tests.</p>'}));
 await p.evaluate(()=>{ReleaseConfig.feedbackURL=()=> 'https://tally.so/r/TEST_ONLY';navigate('feedback');});
 const link=p.locator('#feedback-external');check(await link.getAttribute('rel')==='noopener noreferrer'&&await link.getAttribute('referrerpolicy')==='no-referrer'&&await link.getAttribute('target')==='_blank','external link isolation');
 const pop=ctx.waitForEvent('page');await link.click();const external=await pop;await external.waitForLoadState();check(await external.evaluate(()=>window.opener===null&&document.referrer===''),'no opener or referrer at mocked form');await external.close();check(await p.evaluate(()=>state.workflows.batch.settings.reportTitle==='Owner report'),'form roundtrip keeps work');
 check(requests.filter(r=>r.url.startsWith('https://tally.so')).every(r=>r.url==='https://tally.so/r/TEST_ONLY'&&r.body===null),'form receives only literal URL, no data or query');
 await p.evaluate(()=>navigate('capability'));await p.locator('[data-language="ja"]').click();
 await p.evaluate(()=>{setData({headers:['Lot','Value','Method'],rows:[['0001',1,'M1'],['0002',2,'M2']]},'mixed.csv');render();});check(await p.evaluate(()=>state.result===null),'mixed methods blocked in capability');check(await p.locator('#results [role="alert"]').innerText().then(t=>t.includes('試験方法')),'actionable mixed conditions guidance');
 await p.evaluate(()=>{setData({headers:['Lot','Value','Grade'],rows:[['0001',1,'A'],['0002',2,'B']]},'custom-product.csv');state.quality.product=2;render();});check(await p.evaluate(()=>state.result===null),'explicit product mapping blocks mixed custom-header products');await p.locator('.analysis-settings > summary').click();await p.locator('#qc-product-value').selectOption('A');check(await p.locator('#results [role="alert"]').innerText().then(t=>!t.includes('異なる条件')),'single selected custom product leaves mixing guard');
 await p.evaluate(()=>navigate('home'));await p.screenshot({path:path.join(out,'home-ja.png'),fullPage:true});
 await p.locator('[data-nav="feedback"]').click();await p.screenshot({path:path.join(out,'feedback-ja.png'),fullPage:true});
 check(errors.length===0,'no uncaught browser errors');
 let webkitResult;try{const b=await webkit.launch({headless:true});const wp=await b.newPage();await wp.goto(url+'#home');await wp.waitForSelector('.release-intro');webkitResult='Home smoke passed';await b.close();}catch(e){webkitResult='Not run: '+e.message.split('\n')[0];}
 const result={checks,browser:browser.version(),url,webkit:webkitResult,errors,externalMocked:true};fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
