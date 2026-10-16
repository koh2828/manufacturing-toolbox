/* Real PDF.js/Tesseract on the four small beta PDFs. No extraction/calculation mocks.
 * Raw OCR observations and simulated explicit correction are reported separately.
 * This test does not mark the owner's manual checklist Pass.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const ROOT=path.resolve(__dirname,'..'),base=process.env.TOOLBOX_ENGINE_BASE||'http://127.0.0.1:8770/dist/';
const OUT=process.env.TOOLBOX_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'beta-demo-documents-'));
const truth=JSON.parse(fs.readFileSync(path.join(ROOT,'demo-data/expected/D08.json'),'utf8'));
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext(),page=await context.newPage(),errors=[],requests=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length||0}));
 // Only the empty harness is supplied here. Both libraries and all OCR assets are real.
 await page.route(base+'release-demo-check',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><input type="file" id="file"><script src="document-engine.js"></script><script src="document-core.js"></script>'}));
 try{
  await page.goto(base+'release-demo-check');await page.waitForFunction(()=>window.DocumentEngine&&window.DocumentCore);
  await page.evaluate(()=>window.demoEngine=DocumentEngine.create());
  for(const t of truth.documents){
   await page.locator('#file').setInputFiles(path.join(ROOT,'demo-data',t.path));
   const r=await page.evaluate(async t=>{
    const started=performance.now(),source=document.querySelector('#file').files[0],result=await demoEngine.processFile(source,{language:'eng+jpn'}),docs=DocumentCore.extract(result.pages);
    const before={analysisGroups:DocumentCore.analysisGroups(docs).length,exportedConfirmedRows:DocumentCore.exportLong(docs,{confirmedOnly:true}).rows.length};
    const doc=docs[0],actual={supplier:doc?.supplier,product:doc?.product,productCode:doc?.productCode,lot:doc?.lot,certificate:doc?.certificate,issueDate:doc?.issueDate,inspectionDate:doc?.inspectionDate,deliveryDate:doc?.deliveryDate,rows:doc?.rows.map(r=>({item:r.item,raw:r.resultRaw,unit:r.unit,lsl:r.lslRaw,usl:r.uslRaw,method:r.method})),verification:doc?.verification};
    const mismatches=[];
    const metadata={supplier:t.supplier,product:t.fields.productName,productCode:t.fields.productCode,lot:t.fields.lot,certificate:t.fields.certificateNumber,issueDate:t.fields.issueDate,inspectionDate:t.fields.inspectionDate,deliveryDate:t.fields.deliveryDate};
    for(const [key,want]of Object.entries(metadata))if(actual[key]!==want)mismatches.push({field:key,expected:want,actual:actual[key]});
    if((actual.rows||[]).length!==t.rows.length)mismatches.push({field:'rowCount',expected:t.rows.length,actual:actual.rows?.length||0});
    for(let i=0;i<t.rows.length;i++)for(const [key,want]of Object.entries(t.rows[i]))if(actual.rows?.[i]?.[key]!==want)mismatches.push({field:`row${i+1}.${key}`,expected:want,actual:actual.rows?.[i]?.[key]});
    // Simulate a human applying the independently authored source truth. This is
    // an explicit correction-path test, never reported as first-pass OCR accuracy.
    let corrected=DocumentCore.editDocument(doc,metadata,{at:'2026-10-15T00:00:00Z'});
    for(let i=0;i<t.rows.length;i++){
     const v=t.rows[i],patch={item:v.item,resultRaw:v.raw,unit:v.unit,lslRaw:v.lsl,uslRaw:v.usl,method:v.method};
     corrected=i<corrected.rows.length?DocumentCore.editRow(corrected,corrected.rows[i].id,patch,{at:'2026-10-15T00:00:00Z'}):DocumentCore.addRow(corrected,patch,{at:'2026-10-15T00:00:00Z'});
    }
    for(let i=t.rows.length;i<corrected.rows.length;i++)corrected=DocumentCore.rejectRow(corrected,corrected.rows[i].id);
    const correctedStillBlocked=DocumentCore.analysisGroups([corrected]).length===0;
    const confirmed=DocumentCore.confirmDocument(corrected,{acknowledgeIssues:true}),groups=DocumentCore.analysisGroups([confirmed]),exported=DocumentCore.exportLong([confirmed],{confirmedOnly:true});
    const editedAgain=DocumentCore.editRow(confirmed,confirmed.rows[0].id,{resultRaw:'999'},{at:'2026-10-15T00:01:00Z'});
    return {file:t.path,expectedMethod:t.expectedMethod,methods:result.pages.map(p=>p.method),pageCount:result.pages.length,pageStatus:result.pages.map(p=>p.status),documentCount:docs.length,expectedRows:t.rows.length,actual,mismatches,before,afterExplicitCorrection:{correctedStillBlocked,confirmedRows:exported.rows.length,analysisRows:groups.reduce((n,g)=>n+g.rows.length,0),analysisValues:groups.flatMap(g=>g.rows.map(r=>r.value)),confirmationInvalidatedAfterEdit:editedAgain.verification==='unconfirmed'&&DocumentCore.analysisGroups([editedAgain]).length===0},durationMs:performance.now()-started};
   },t);
   assert.equal(r.pageCount,1);assert.equal(r.documentCount,1);assert.deepEqual(r.pageStatus,['completed']);assert.deepEqual(r.methods,[t.expectedMethod]);
   assert.equal(r.actual.verification,'unconfirmed');assert.equal(r.before.analysisGroups,0);assert.equal(r.before.exportedConfirmedRows,0);
   if(t.textLayer)assert.equal(r.mismatches.length,0,JSON.stringify(r.mismatches));
   assert.equal(r.afterExplicitCorrection.correctedStillBlocked,true);assert.equal(r.afterExplicitCorrection.confirmedRows,t.measurementRowCount);
   assert.equal(r.afterExplicitCorrection.analysisRows,2,'Only viscosity and volatile matter have exact numeric results');
   assert.equal(r.afterExplicitCorrection.confirmationInvalidatedAfterEdit,true);
   results.push(r);console.log(JSON.stringify({file:t.path,method:r.methods[0],rows:r.actual.rows.length,expectedRows:t.measurementRowCount,rawMismatches:r.mismatches.length,gatePassed:true,durationMs:Math.round(r.durationMs)}));
  }
  assert.deepEqual(errors,[]);
  const origin=new URL(base).origin;
  assert.ok(requests.every(r=>r.url.startsWith(origin+'/')&&r.method==='GET'&&r.bytes===0));
  const captured=JSON.stringify(requests);for(const privateString of truth.documents.flatMap(t=>[path.basename(t.path),t.fields.lot,t.fields.productName]))assert.ok(!captured.includes(privateString),'No source identifiers in requests');
  await page.evaluate(()=>demoEngine.dispose());
  fs.writeFileSync(path.join(OUT,'release-demo-documents.json'),JSON.stringify({browser:await browser.version(),base,results,errors,requests,limitations:'Real synthetic files only. Gate checks use real extraction and explicit source-based correction; this is not owner approval or real-world OCR accuracy.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
