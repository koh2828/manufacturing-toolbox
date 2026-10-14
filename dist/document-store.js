(function(root){
  'use strict';
  const NAME='manufacturing-toolbox.documents.v1',VERSION=1,MAX_DOCS=2000,MAX_BYTES=200*1024*1024,MAX_PAGES=10000,MAX_SOURCES=500;
  const STORES=['documents','pages','sources','templates'];
  let connection,mutationTail=Promise.resolve();
  const fail=()=>Error('document.storageError');
  const invalid=()=>Error('document.invalidBackup');
  const text=(v,max=4000)=>{if(typeof v!=='string'||v.length>max)throw invalid();return v;};
  const unique=(items,key='id')=>{if(new Set(items.map(x=>x[key])).size!==items.length)throw invalid();return items;};
  const queue=fn=>{const next=mutationTail.then(fn);mutationTail=next.catch(()=>{});return next;};
  function open(){
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{let settled=false;try{const request=indexedDB.open(NAME,VERSION);request.onupgradeneeded=()=>{const db=request.result;for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});};request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};request.onerror=request.onblocked=()=>{settled=true;reject(fail());};}catch{reject(fail());}}).catch(e=>{connection=null;throw e;});return connection;
  }
  // Snapshot reads and the corresponding writes occur in one IDB transaction.
  // Cryptographic preparation happens before it, never across an inactive tx.
  async function snapshot(mode,apply){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,mode),data={};let remaining=STORES.length,result,error;tx.oncomplete=()=>resolve(result??data);tx.onerror=tx.onabort=()=>reject(error||fail());for(const name of STORES){const request=tx.objectStore(name).getAll();request.onerror=()=>{error=fail();};request.onsuccess=()=>{data[name]=request.result;if(--remaining===0){try{result=apply?apply(tx,data):data;}catch(e){error=e;tx.abort();}}};}});}
  async function list(name){if(!STORES.includes(name))throw invalid();const db=await open();return new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(fail());});}
  async function get(name,id){if(!STORES.includes(name)||typeof id!=='string')throw invalid();const db=await open();return new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(fail());});}
  async function digest(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
  function identity(doc){return JSON.stringify([doc.supplierId,doc.supplier,doc.product,doc.productCode,doc.lot,doc.certificate,doc.inspectionDate,doc.issueDate,doc.deliveryDate,doc.verification,doc.rows.map(r=>[r.item,r.method,r.resultRaw,r.qualifier,r.unit,r.lslRaw,r.uslRaw,r.status])]);}
  async function fingerprint(doc){return digest(new TextEncoder().encode(identity(doc)));}
  function cleanDocuments(inputs){const docs=root.DocumentCore.validateDataset({schemaVersion:1,documents:inputs}).documents;for(const doc of docs){if(doc.verification!=='confirmed'||doc.rows.some(r=>r.status==='unconfirmed'))throw Error('document.confirmFirst');root.DocumentCore.confirmDocument(doc,{acknowledgeIssues:true});}return docs;}
  function cleanPages(inputs){if(!Array.isArray(inputs)||inputs.length>MAX_PAGES)throw invalid();return unique(inputs.map(root.DocumentCore.validatePage));}
  function sourceRecord(s){if(!s||typeof s!=='object')throw invalid();const id=text(s.id,200),name=text(s.name),blob=s.file||s.blob,type=s.type||blob?.type||'';if(!/^[a-f0-9]{64}$/.test(id)||!name||!(blob instanceof Blob)||!['application/pdf','image/png','image/jpeg',''].includes(type))throw invalid();if(!blob.size||blob.size>30*1024*1024)throw Error('document.storageLimit');return {id,name,type,blob};}
  async function prepare(documents,pages,sources,includeSources){
    const docs=cleanDocuments(documents),wanted=new Set(docs.flatMap(d=>d.pages));
    if(!Array.isArray(pages))throw invalid();const ps=cleanPages(pages.filter(p=>wanted.has(p?.id))),files=new Set(ps.map(p=>p.fileId));
    let kept=[];if(includeSources){if(!Array.isArray(sources)||sources.length>MAX_SOURCES)throw invalid();kept=unique(sources.filter(s=>files.has(s?.id)).map(sourceRecord));for(const s of kept)if(await digest(await s.blob.arrayBuffer())!==s.id)throw Error('document.sourceMismatch');}
    for(const doc of docs)doc.fingerprint=await fingerprint(doc);
    return {documents:docs,pages:ps,sources:kept};
  }
  function checkReferences(documents,pageMap,sourceMap){for(const doc of documents)for(const id of doc.pages){const p=pageMap.get(id);if(!p)throw invalid();if(!/^[a-f0-9]{64}$/.test(p.fileId)||p.id!==p.fileId+'-p'+p.pageNumber)throw invalid();if(sourceMap.has(p.fileId)&&!sourceMap.get(p.fileId).blob)throw invalid();}}
  function enforceLimits(documents,pages,sources){if(documents.length>MAX_DOCS||documents.reduce((n,d)=>n+d.rows.length,0)>root.DocumentCore.LIMITS.rows||pages.length>MAX_PAGES||sources.length>MAX_SOURCES)throw Error('document.storageLimit');const sourceBytes=sources.reduce((n,s)=>n+s.blob.size,0),metadataBytes=JSON.stringify({documents,pages}).length*2;if(sourceBytes+metadataBytes>MAX_BYTES)throw Error('document.storageLimit');}
  function commitPrepared(tx,current,prepared,importedTemplates){
    const docMap=new Map(current.documents.map(d=>[d.id,d])),fingerprints=new Map(current.documents.map(d=>[d.fingerprint,d.id])),saved=[],duplicateIds=[];let duplicates=0;
    for(const doc of prepared.documents){const duplicateId=fingerprints.get(doc.fingerprint);if(duplicateId&&duplicateId!==doc.id){duplicates++;duplicateIds.push(doc.id);continue;}const previous=docMap.get(doc.id);if(previous&&fingerprints.get(previous.fingerprint)===doc.id)fingerprints.delete(previous.fingerprint);const next={...doc,savedAt:new Date().toISOString()};docMap.set(doc.id,next);fingerprints.set(doc.fingerprint,doc.id);saved.push(next);}
    const wanted=new Set(saved.flatMap(d=>d.pages)),pageMap=new Map(current.pages.map(p=>[p.id,p]));prepared.pages.filter(p=>wanted.has(p.id)).forEach(p=>pageMap.set(p.id,p));const referencedPages=new Set([...docMap.values()].flatMap(d=>d.pages));for(const id of pageMap.keys())if(!referencedPages.has(id))pageMap.delete(id);
    const fileIds=new Set([...pageMap.values()].map(p=>p.fileId)),sourceMap=new Map(current.sources.map(s=>[s.id,s]));prepared.sources.filter(s=>fileIds.has(s.id)).forEach(s=>sourceMap.set(s.id,s));for(const id of sourceMap.keys())if(!fileIds.has(id))sourceMap.delete(id);
    const documents=[...docMap.values()],pages=[...pageMap.values()],sources=[...sourceMap.values()];checkReferences(documents,pageMap,sourceMap);enforceLimits(documents,pages,sources);
    let templates=null;if(importedTemplates){const merged=new Map(current.templates.map(t=>[t.id,t]));importedTemplates.forEach(t=>merged.set(t.id,t));templates=root.DocumentCore.validateTemplates({schemaVersion:1,templates:[...merged.values()]}).templates;}
    saved.forEach(d=>tx.objectStore('documents').put(d));pages.filter(p=>wanted.has(p.id)).forEach(p=>tx.objectStore('pages').put(p));current.pages.filter(p=>!pageMap.has(p.id)).forEach(p=>tx.objectStore('pages').delete(p.id));prepared.sources.filter(s=>sourceMap.has(s.id)).forEach(s=>tx.objectStore('sources').put(s));current.sources.filter(s=>!sourceMap.has(s.id)).forEach(s=>tx.objectStore('sources').delete(s.id));if(templates){tx.objectStore('templates').clear();templates.forEach(t=>tx.objectStore('templates').put(t));}
    return {saved:saved.length,duplicates,duplicateIds};
  }
  function save(documents,pages,sources,includeSources=false){return queue(async()=>{const prepared=await prepare(documents,pages,sources,includeSources);return snapshot('readwrite',(tx,current)=>commitPrepared(tx,current,prepared));});}
  function remove(ids){return queue(async()=>{if(!Array.isArray(ids)||ids.length>MAX_DOCS||ids.some(id=>typeof id!=='string'))throw invalid();return snapshot('readwrite',(tx,current)=>{const documents=current.documents.filter(d=>!ids.includes(d.id)),pageIds=new Set(documents.flatMap(d=>d.pages)),pages=current.pages.filter(p=>pageIds.has(p.id)),fileIds=new Set(pages.map(p=>p.fileId));ids.forEach(id=>tx.objectStore('documents').delete(id));current.pages.filter(p=>!pageIds.has(p.id)).forEach(p=>tx.objectStore('pages').delete(p.id));current.sources.filter(s=>!fileIds.has(s.id)).forEach(s=>tx.objectStore('sources').delete(s.id));return {removed:current.documents.length-documents.length};});});}
  function saveTemplates(templates){return queue(async()=>{const items=root.DocumentCore.validateTemplates({schemaVersion:1,templates}).templates;await snapshot('readwrite',tx=>{tx.objectStore('templates').clear();items.forEach(t=>tx.objectStore('templates').put(t));});return items;});}
  async function backup(includeSources=false){await mutationTail;const {documents,pages,templates,sources}=await snapshot('readonly'),encoded=[];if(includeSources)for(const s of sources){const bytes=new Uint8Array(await s.blob.arrayBuffer());let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));encoded.push({id:s.id,name:s.name,type:s.type,data:btoa(value)});}return {format:'manufacturing-toolbox-documents',schemaVersion:1,createdAt:new Date().toISOString(),documents,pages,templates,sources:encoded};}
  function validateBackup(value){
    if(!value||value.format!=='manufacturing-toolbox-documents'||value.schemaVersion!==1||!Array.isArray(value.sources)||value.sources.length>MAX_SOURCES)throw invalid();
    const documents=cleanDocuments(value.documents),pages=cleanPages(value.pages),templates=root.DocumentCore.validateTemplates({schemaVersion:1,templates:value.templates||[]}).templates;
    const pageMap=new Map(pages.map(p=>[p.id,p])),wanted=new Set(documents.flatMap(d=>d.pages));if(pages.some(p=>!wanted.has(p.id)))throw invalid();let bytes=0;
    const sources=unique(value.sources.map(s=>{if(!s||typeof s.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(s.data)||s.data.length%4!==0)throw invalid();bytes+=s.data.length*.75;if(bytes>MAX_BYTES)throw Error('document.storageLimit');let decoded;try{decoded=atob(s.data);}catch{throw invalid();}const blob=new Blob([Uint8Array.from(decoded,c=>c.charCodeAt(0))],{type:s.type});return sourceRecord({...s,blob});}));
    const sourceMap=new Map(sources.map(s=>[s.id,s])),fileIds=new Set(pages.map(p=>p.fileId));if(sources.some(s=>!fileIds.has(s.id)))throw invalid();checkReferences(documents,pageMap,sourceMap);enforceLimits(documents,pages,sources);return {documents,pages,templates,sources};
  }
  function restore(value){return queue(async()=>{const p=validateBackup(value),prepared=await prepare(p.documents,p.pages,p.sources,true);return snapshot('readwrite',(tx,current)=>commitPrepared(tx,current,prepared,p.templates));});}
  async function usage(){await mutationTail;const {documents,sources}=await snapshot('readonly');let estimate=null;try{estimate=await navigator.storage?.estimate();}catch{}return {documents:documents.length,sourceBytes:sources.reduce((n,s)=>n+s.blob.size,0),estimate};}
  root.DocumentStore={NAME,VERSION,open,list,get,save,remove,saveTemplates,backup,validateBackup,restore,usage,fingerprint,identity};
})(globalThis);
