/* Real IndexedDB integration and adversarial backup tests; synthetic data only. */
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TOOLBOX_URL||'http://127.0.0.1:8765/';
const out=process.env.TOOLBOX_TEST_OUTPUT||'/private/tmp/document-store-browser';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),p=await context.newPage();const errors=[],requests=[];let watch=false;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(watch)requests.push({url:r.url(),method:r.method()});});
 const parsed=new URL(base),asset=new URL(/\/Launch\.html$/i.test(parsed.pathname)?'dist/':'./',parsed).href,target=asset+'store-benchmark';
 await p.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'self\';connect-src \'none\'"><script src="document-core.js"></script><script src="document-store.js"></script><p>Document storage verification</p>'}));
 try{
  await p.goto(target);await p.waitForFunction(()=>typeof DocumentStore==='object');watch=true;
  const result=await p.evaluate(async()=>{
   const D=DocumentCore,S=DocumentStore,checks=[];
   const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
   const rejected=async(fn,m)=>{let yes=false;try{await fn();}catch{yes=true;}check(yes,m);};
   const copy=x=>structuredClone(x),snapshot=async()=>{const b=await S.backup(true);delete b.createdAt;return JSON.stringify(b);};
   const file=new File(['%PDF-1.4\nSYNTHETIC STORAGE TEST ONLY\n%%EOF'],'synthetic-storage.pdf',{type:'application/pdf'}),digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),fileId=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
   const page={id:fileId+'-p1',fileId,fileName:file.name,pageNumber:1,width:595,height:842,words:[{text:'Aster Materials',bbox:[.1,.1,.3,.03],confidence:null}],text:'Aster Materials',method:'text',status:'completed',options:{language:'eng+jpn',layout:'block',rotation:0,deskew:0,scale:2,preprocess:'original',forceOCR:false,denoise:false},revisions:[]};page.revisions=[D.pageRevision(page,'2026-10-14T00:00:00Z')];
   let doc=D.extract([page])[0];doc=D.editDocument(doc,{product:'Synthetic Resin',productCode:'SYN-1',lot:'0001',certificate:'SYN-COA-001',inspectionDate:'2026-10-01'});doc=D.addRow(doc,{item:'Viscosity',resultRaw:'100.123456789',unit:'mPa.s',lslRaw:'95',uslRaw:'110',method:'SYN-M1'});
   check((await S.list('documents')).length===0,'processing/extraction alone never persists manufacturing data');
   await rejected(()=>S.save([doc],[page],[{id:fileId,name:file.name,file}],true),'unconfirmed document cannot be saved as a confirmed dataset');
   doc=D.confirmDocument(doc,{acknowledgeIssues:true});
   const saved=await S.save([doc],[{...page,unexpectedSecret:'DROP THIS'}],[{id:fileId,name:file.name,file}],false);
   check(saved.saved===1&&saved.duplicates===0,'explicit save persists one confirmed document');
   check((await S.list('sources')).length===0,'results-only save never stores original PDF bytes');
   check(!(await S.get('pages',page.id)).unexpectedSecret,'stored page schema strips unknown properties');
   check((await S.get('pages',page.id)).revisions[0].text==='Aster Materials'&&(await S.get('pages',page.id)).options.language==='eng+jpn','saved OCR history and validated processing settings survive persistence');
   check((await S.get('documents',doc.id)).rows[0].resultRaw==='100.123456789','stored result keeps full raw numeric text');
   check(S.identity(doc)===S.identity({...doc,id:doc.id+'-copy'}),'synchronous identity matches duplicate fingerprint semantics before save');
   const duplicate=await S.save([{...doc,id:doc.id+'-copy'}],[page],[],false);check(duplicate.saved===0&&duplicate.duplicates===1,'same certificate with new ID is reported as duplicate');check(duplicate.duplicateIds[0]===doc.id+'-copy','duplicate IDs allow session removal to avoid analytics double counting');
   const changed=D.confirmDocument(D.editDocument({...doc,id:doc.id+'-delivery'},{deliveryDate:'2026-10-03'}),{acknowledgeIssues:true});check(await S.fingerprint(doc)!==await S.fingerprint(changed),'delivery date participates in duplicate identity');
   const reviewed=D.rejectRow(doc,doc.rows[0].id);check(await S.fingerprint(doc)!==await S.fingerprint(reviewed),'row review status participates in duplicate identity');
   const rawSpec=D.confirmDocument(D.editRow(doc,doc.rows[0].id,{lslRaw:'unknown'}),{acknowledgeIssues:true});const rawSpec2=D.confirmDocument(D.editRow(doc,doc.rows[0].id,{lslRaw:'uncertain'}),{acknowledgeIssues:true});check(await S.fingerprint(rawSpec)!==await S.fingerprint(rawSpec2),'distinct invalid raw specifications are never deduplicated as null');
   const before=await snapshot();const forged=copy(doc);forged.rows[0].resultNumeric=999;await rejected(()=>S.save([forged],[page],[],false),'forged numeric interpretation rejected');check(await snapshot()===before,'failed validation leaves all stores unchanged');
   await S.save([doc],[page],[{id:fileId,name:file.name,file}],true);check((await S.list('sources')).length===1,'explicit source retention persists one hash-verified original');
   const backup=await S.backup(true),without=await S.backup(false);check(backup.sources.length===1&&without.sources.length===0,'backup original inclusion is explicit and independent');
   const wrong=new File(['wrong PDF bytes'],file.name,{type:'application/pdf'});await rejected(()=>S.save([doc],[page],[{id:fileId,name:file.name,file:wrong}],true),'source bytes cannot be substituted under another file hash');
   const attacks=[
    b=>{b.schemaVersion=999;},
    b=>{b.documents.push(copy(b.documents[0]));},
    b=>{b.pages[0].words[0].bbox=[.9,.1,.5,.1];},
    b=>{b.pages[0].words[0].confidence=101;},
    b=>{b.pages[0].width=-1;},
    b=>{b.pages[0].method='javascript';},
    b=>{b.pages[0].options.language='https://evil.invalid/model';},
    b=>{b.pages[0].revisions=Array(6).fill(b.pages[0].revisions[0]);},
    b=>{b.documents[0].pages=['missing'];},
    b=>{b.pages[0].fileId='a'.repeat(64);},
    b=>{b.sources.push(copy(b.sources[0]));},
    b=>{b.sources[0].id='b'.repeat(64);},
    b=>{b.sources[0].data='%%%';}
   ];
   for(let i=0;i<attacks.length;i++){const b=copy(backup);attacks[i](b);await rejected(()=>S.restore(b),'malformed backup '+i+' rejected before persistence');}
   const corrupt=copy(backup);corrupt.sources[0].data=btoa('different original');await rejected(()=>S.restore(corrupt),'restored source body must match SHA256 ID');
   check((await S.list('documents')).length===1&&(await S.list('sources')).length===1,'malformed backup cases do not partially alter saved data');
   await S.saveTemplates(D.defaults());const overflow=copy(backup);overflow.documents[0]=changed;overflow.templates=Array.from({length:100},(_,i)=>({...D.defaults()[0],id:'version-'+i,supplierId:'fictional-'+i}));const oldState=await snapshot();await rejected(()=>S.restore(overflow),'merged template limit is validated before restore commits');check(await snapshot()===oldState,'template-limit failure rolls back documents/pages/sources/templates together');
   await S.remove([doc.id]);const parallel=await Promise.all([S.save([doc],[page],[],false),S.save([{...doc,id:doc.id+'-parallel'}],[page],[],false)]);check(parallel.reduce((n,x)=>n+x.saved,0)===1&&parallel.reduce((n,x)=>n+x.duplicates,0)===1,'parallel saves serialize duplicate detection and writes');
   await S.save([doc],[page],[{id:fileId,name:file.name,file}],true);await S.save([changed],[page],[],false);await S.remove([doc.id]);check((await S.list('sources')).length===1&&(await S.list('pages')).length===1,'deleting one certificate retains a shared source referenced by another');await S.remove([changed.id]);check((await S.list('documents')).length===0&&(await S.list('pages')).length===0&&(await S.list('sources')).length===0,'deleting last certificate removes orphan pages and original bytes');
   const restored=await S.restore(backup);check(restored.saved===1&&(await S.get('documents',doc.id)).rows[0].resultNumeric===100.123456789,'backup restores confirmed raw/numeric data and provenance');check(await (await S.get('sources',fileId)).blob.text()===await file.text(),'restored original bytes are exact');
   await rejected(()=>S.save([reviewed],[page],[],false),'all-rejected rows cannot masquerade as a confirmed usable dataset');
   return {checks,documentId:doc.id,fileId};
  });
  watch=false;await p.reload();await p.waitForFunction(()=>typeof DocumentStore==='object');watch=true;
  assert.equal(await p.evaluate(async id=>(await DocumentStore.get('documents',id)).verification,result.documentId),'confirmed');result.checks.push('confirmed dataset survives browser page reload');
  assert.equal(await p.evaluate(async()=>{const ds=await DocumentStore.list('documents');await DocumentStore.remove(ds.map(d=>d.id));return (await DocumentStore.list('sources')).length;}),0);result.checks.push('reload preserves source cleanup behavior');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);result.checks.push('no runtime errors or HTTP requests during save, backup, restore and deletion');
  fs.writeFileSync(path.join(out,'document-store-result.json'),JSON.stringify({checks:result.checks.length,passed:result.checks,errors,requests},null,2));console.log(JSON.stringify({checks:result.checks.length,errors,requests,output:out}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
