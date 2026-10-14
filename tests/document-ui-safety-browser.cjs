/* Synthetic records only. Integrity tests use the real application UI, IndexedDB,
 * a real text PDF, and real Tesseract reprocessing. Only the explicit engine
 * failure and delayed-storage scenarios substitute a controlled failure/delay. */
'use strict';
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const url=process.env.TOOLBOX_URL||'http://127.0.0.1:8765/';
const out=process.env.TOOLBOX_TEST_OUTPUT||'/private/tmp/document-ui-safety';fs.mkdirSync(out,{recursive:true});
const fixture=path.join(__dirname,'fixtures/documents/text-certificate-aster.pdf');
const multipage=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/documents/benchmark/engine-mixed.json'),'utf8')).result.pages.slice(0,2);
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),p=await context.newPage();
 const errors=[],requests=[],consoleMessages=[];let checks=0;
 const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS',label);};
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length||0}));
 p.on('console',m=>{if(m.type()!=='warning')consoleMessages.push(m.text());});p.on('dialog',d=>d.accept());
 try{
  await p.goto(url+'#documents');await p.waitForFunction(()=>di.loaded);
  await p.locator('#di-files').setInputFiles(fixture);await p.waitForFunction(()=>!di.busy&&di.documents.length===1);await p.waitForFunction(()=>document.querySelector('#di-canvas')?.width>100);
  check(await p.evaluate(()=>di.pages[0].method==='text'&&diDoc().rows.length===5),'real one-page text PDF initializes the integrity fixture');
  await p.locator('#di-ack').check();await p.locator('#di-confirm').click();
  await p.evaluate(()=>{window.safetyFixture={document:structuredClone(diDoc()),page:structuredClone(di.pages[0]),source:di.sources[0]};});
  await p.locator('#di-save').click();await p.waitForFunction(()=>di.library.length===1);
  const duplicate=await p.evaluate(()=>{
   const copy=structuredClone(diDoc());copy.id+='-renamed-copy';copy.sourceFile='renamed-synthetic.pdf';copy.rows.forEach(r=>{r.id+='-copy';r.sourceFile=copy.sourceFile;});
   di.documents.push(copy);const same=DS.identity(copy)===DS.identity(di.documents[0]);
   return {same,docs:diAnalysisDocs().length,n:diGroups().map(g=>g.rows.length)};
  });
  check(duplicate.same&&duplicate.docs===1&&duplicate.n.every(n=>n===1),'same certificate under another identifier is not double-counted in trends');
  await p.locator('#di-save').click();await p.waitForFunction(()=>di.documents.length===1);
  check(await p.evaluate(async()=>di.library.length===1&&(await DS.list('documents')).length===1),'duplicate save prunes the redundant session record and keeps one stored record');
  await p.locator('[data-di-tab=library]').first().click();await p.locator('[data-di-delete]').click();await p.waitForFunction(()=>di.library.length===0);
  check(await p.evaluate(()=>!di.documents.length&&!di.pages.length&&!di.sources.length&&!diGroups().length),'deleting the saved record also removes session, page, source, and analysis references');
  check(await p.evaluate(async()=>!(await DS.list('pages')).length),'deletion removes unreferenced stored pages');

  await p.evaluate(()=>{
   const a=structuredClone(safetyFixture.document),b=structuredClone(a);b.id+='-second-lot';b.lot='AS-26-9002';b.certificate='AS-COA-9002';b.inspectionDate='2026-10-01';b.rows.forEach(r=>r.id+='-second-lot');
   di.documents=[a,b];di.pages=[structuredClone(safetyFixture.page)];di.sources=[safetyFixture.source];di.library=[];di.tab='trends';di.group=0;di.trendFilters={};renderDocuments();
  });
  await p.locator('#di-capability-ack').check();check(await p.evaluate(()=>diSamplingAcknowledged(diGroups()[0])),'sampling acknowledgement binds to the selected group and current observations');
  await p.locator('#di-group').selectOption('1');check(!await p.locator('#di-capability-ack').isChecked(),'changing the inspection group revokes sampling acknowledgement');
  await p.locator('#di-group').selectOption('0');await p.locator('#di-capability-ack').check();
  await p.locator('#di-from').fill('2026-10-01');await p.locator('#di-from').blur();
  check(!await p.locator('#di-capability-ack').isChecked(),'a date filter that changes the selected observations revokes acknowledgement');
  await p.evaluate(()=>{di.trendFilters={};renderDocuments();});await p.locator('#di-capability-ack').check();
  await p.evaluate(()=>{const d=di.documents[0];di.documents[0]=DC.confirmDocument(DC.editRow(d,d.rows[0].id,{resultRaw:'114.25'}),{acknowledgeIssues:true});renderDocuments();});
  check(!await p.locator('#di-capability-ack').isChecked(),'editing a measurement invalidates acknowledgement for the prior values');
  await p.locator('#di-capability').click();check(await p.evaluate(()=>state.view==='capability'&&!state.data.documentContext.samplingAcknowledged),'capability handoff preserves the revoked sampling gate');
  await p.locator('[data-nav=documents]').click();await p.locator('[data-di-tab=trends]').first().click();await p.locator('#di-capability-ack').check();await p.locator('#di-capability').click();
  check(await p.evaluate(()=>state.data.documentContext.samplingAcknowledged===true),'explicit acknowledgement applies to the same selected observations');

  await p.locator('[data-nav=documents]').click();
  await p.evaluate(async()=>{
   await DS.save([safetyFixture.document],[safetyFixture.page],[],false);di.library=await DS.list('documents');di.documents=[];di.pages=[];di.sources=[];di.tab='library';renderDocuments();
   window.safetyOriginalGet=DS.get;DS.get=async(name,id)=>{const value=await safetyOriginalGet(name,id);if(name==='pages')return new Promise(resolve=>{window.safetyReleaseRead=()=>resolve(value);});return value;};
   window.safetyPendingOpen=diOpenSaved(di.library[0].id);
  });
  await p.waitForFunction(()=>typeof safetyReleaseRead==='function');await p.locator('[data-nav=capability]').click();
  await p.evaluate(async()=>{safetyReleaseRead();await safetyPendingOpen;DS.get=safetyOriginalGet;});
  check(await p.evaluate(()=>state.view==='capability'&&!di.documents.length&&!di.pages.length&&!document.querySelector('#di-document')),'late stored-page reads cannot reopen Document Intelligence over a later navigation');

  await p.locator('[data-nav=documents]').click();
  await p.evaluate(()=>{
   const d=safetyFixture.document;di.documents=[DC.confirmDocument(DC.editRow(d,d.rows[0].id,{resultRaw:'113.25'}),{acknowledgeIssues:true})];
   di.pages=[structuredClone(safetyFixture.page)];di.sources=[safetyFixture.source];di.selected=0;di.page=0;di.tab='review';renderDocuments();
  });await p.waitForFunction(()=>document.querySelector('#di-canvas')?.width>100);
  const beforeFailure=await p.evaluate(()=>({document:JSON.stringify(diDoc()),page:JSON.stringify(di.pages[0])}));
  await p.evaluate(()=>{const actual=diEngine();di.engine={...actual,processFile:async()=>{window.safetyFailureTriggered=true;throw Error('SYNTHETIC_ENGINE_FAILURE');}};});
  await p.locator('#di-reprocess').click();await p.waitForFunction(()=>!di.busy&&window.safetyFailureTriggered,null,{timeout:5000});
  const afterFailure=await p.evaluate(()=>({document:JSON.stringify(diDoc()),page:JSON.stringify(di.pages[0]),value:diDoc().rows[0].resultRaw,confirmed:diDoc().verification}));
  check(afterFailure.document===beforeFailure.document&&afterFailure.page===beforeFailure.page,'failed reprocessing leaves the prior page and corrected document unchanged');
  check(afterFailure.value==='113.25'&&afterFailure.confirmed==='confirmed','failed reprocessing preserves corrections and their verification state');

  await p.evaluate(async()=>{
   await DS.save([diDoc()],di.pages,di.sources,true);di.sources=[];
   window.safetyDelayedSourceReleases=[];window.safetyGetBeforeCancel=DS.get;
   DS.get=async(name,id)=>{const value=await safetyGetBeforeCancel(name,id);if(name==='sources')return new Promise(resolve=>safetyDelayedSourceReleases.push(()=>resolve(value)));return value;};
   window.safetyBeforeCancel={document:JSON.stringify(diDoc()),page:JSON.stringify(di.pages[0])};
  });
  await p.locator('#di-reprocess').click();await p.waitForFunction(()=>di.busy&&safetyDelayedSourceReleases.length>0);
  await p.locator('#di-cancel').click();
  await p.evaluate(()=>{DS.get=safetyGetBeforeCancel;for(const release of safetyDelayedSourceReleases)release();});
  await p.waitForFunction(()=>!di.busy&&!di.cancelled);
  check(await p.evaluate(()=>JSON.stringify(diDoc())===safetyBeforeCancel.document&&JSON.stringify(di.pages[0])===safetyBeforeCancel.page),'cancelling during a delayed source read preserves prior data and verification');
  await p.evaluate(()=>{di.sources=[safetyFixture.source];});

  await p.evaluate(()=>{
   const page=di.pages[0];page.revisions=Array.from({length:5},(_,i)=>{const text='Synthetic prior revision '+i;return {...DC.pageRevision(page),text,textLength:text.length,textTruncated:false,at:'2026-10-01T00:00:00.000Z'};});
   window.safetyPriorPage={text:page.text,options:structuredClone(page.options)};renderDocuments();
  });
  await p.locator('#di-reprocess').click();await p.waitForFunction(()=>!di.busy&&di.pages[0].method==='ocr',null,{timeout:60000});
  const revised=await p.evaluate(()=>({count:di.pages[0].revisions.length,first:di.pages[0].revisions[0].text,last:di.pages[0].revisions.at(-1),prior:safetyPriorPage,verification:diDoc().verification,rows:diDoc().rows.map(r=>r.status),raw:diDoc().rows[0].resultRaw}));
  check(revised.verification==='unconfirmed'&&revised.rows.every(s=>s==='unconfirmed'),'successful real OCR reprocessing resets document and row confirmation');
  check(revised.count===5&&revised.first==='Synthetic prior revision 1','OCR revision history retains only the latest five prior versions');
  check(revised.last.text===revised.prior.text&&isDeepStrictEqual(JSON.parse(JSON.stringify(revised.last.options)),JSON.parse(JSON.stringify(revised.prior.options))),'OCR revision history retains the prior raw text and processing options');
  check(revised.raw!=='113.25','successful reprocessing uses the newly read source measurement');
  await p.locator('#di-ack').check();await p.locator('#di-confirm').click();await p.locator('#di-save').click();await p.waitForFunction(async()=>{const saved=await DS.get('pages',di.pages[0].id);return saved?.revisions?.length===5&&saved.revisions.at(-1).text===safetyPriorPage.text;});
  check(true,'reprocessing history persists in explicit local save');

  await p.evaluate(pages=>{
   di.documents=DC.extract(pages,DC.defaults()).map(d=>DC.confirmDocument(d,{acknowledgeIssues:true}));di.pages=pages;di.sources=[];di.library=[];di.selected=0;di.page=0;di.tab='review';renderDocuments();
  },multipage);
  check(await p.evaluate(()=>di.documents.length===1&&diDoc().pages.length===2),'actual benchmark pages supply a confirmed multi-page certificate');
  await p.locator('#di-page').selectOption('1');await p.locator('#di-split').click();
  check(await p.evaluate(()=>di.documents.length===2&&di.documents.every(d=>d.verification==='unconfirmed'&&d.rows.every(r=>r.status==='unconfirmed'))),'manual document split resets confirmation for both parts');
  await p.evaluate(()=>{di.documents=di.documents.map(d=>DC.confirmDocument(d,{acknowledgeIssues:true}));di.selected=0;renderDocuments();});await p.locator('#di-merge').click();
  check(await p.evaluate(()=>di.documents.length===1&&diDoc().pages.length===2&&diDoc().verification==='unconfirmed'&&diDoc().rows.every(r=>r.status==='unconfirmed')),'manual document merge preserves pages and requires confirmation again');
  check(errors.length===0,'no uncaught browser errors in integrity and asynchronous failure paths');
  check(requests.every(r=>r.method==='GET'&&r.bytes===0&&new URL(r.url).origin===new URL(url).origin),'all integrity-test network requests are same-origin static GET without file payloads');
  check(!requests.some(r=>/AS-26|113\.25|114\.25|Aster/.test(r.url)),'manufacturing identities and measurements do not appear in request URLs');
  check(consoleMessages.length===0,'document data and simulated errors are not emitted to console');
  await p.screenshot({path:path.join(out,'safety-review.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'safety-result.json'),JSON.stringify({checks,errors,requests,consoleMessages},null,2));console.log('COMPLETE',checks);
 }catch(error){await p.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure-state.json'),JSON.stringify(await p.evaluate(()=>({view:state.view,tab:di.tab,busy:di.busy,sourceCount:di.sources.length,document:diDoc()?.id,page:di.pages[0]?.id,sourceId:di.pages[0]?.fileId,sourceIds:di.sources.map(s=>s.id),failed:window.safetyFailureTriggered,text:document.body.innerText.slice(-2000)})),null,2));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
