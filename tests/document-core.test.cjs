const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../dist/document-core.js');
const w=(text,x,y,width=.07)=>({text,bbox:[x,y,width,.012],confidence:null});
function page(id='p1',overrides={}){
  const words=[w('Aster Materials',.08,.05,.2),w('Certificate of Analysis',.08,.08,.3),w('Product:',.08,.12),w('Resin A',.25,.12,.12),w('Product Code:',.08,.15,.14),w('A-01',.25,.15),w('Lot:',.08,.18),w('0001',.25,.18),w('Certificate:',.08,.21,.12),w('C-001',.25,.21),w('Inspection Date:',.08,.24,.15),w('2026-10-01',.25,.24,.12),w('Inspection Item',.08,.32,.15),w('Result',.4,.32),w('Unit',.55,.32),w('LSL',.65,.32),w('USL',.75,.32),w('Test Method',.85,.32,.12),w('Viscosity',.08,.37,.1),w('100',.4,.37),w('mPa.s',.55,.37),w('95',.65,.37),w('110',.75,.37),w('M-1',.85,.37),w('Metal',.08,.41),w('<0.01',.4,.41),w('ppm',.55,.41),w('0.02',.75,.41),w('M-2',.85,.41),w('END OF RESULTS',.08,.46,.25)];
  const p={id,fileId:'f1',fileName:'2026-10-14.pdf',pageNumber:1,width:595,height:842,words,method:'text',status:'completed',...overrides};p.text=p.words.map(x=>x.text).join('\n');return p;
}
const document=()=>D.extract([page()],D.defaults())[0];
const approved=()=>D.confirmDocument(document(),{acknowledgeIssues:true});
const patchWords=(p,replacements)=>({...p,words:p.words.map(x=>({...x,text:replacements[x.text]??x.text}))});
function refresh(p){return {...p,text:p.words.map(w=>w.text).join('\n')};}

test('Exact numeric syntax preserves original and does not coerce missing, malformed comma or boolean',()=>{
  for(const [raw,value] of [['0.01',.01],['1,234.5',1234.5],[' 001.20 ',1.2],['１．２',1.2],['-5',-5],['1e-2',.01]]){const p=D.parseResult(raw);assert.equal(p.raw,raw);assert.equal(p.numeric,value);assert.equal(p.qualifier,'=');}
  for(const raw of ['',null,' ','1,23','0x20','12O','1e999','0.1 mg','NaN'])assert.equal(D.parseResult(raw).numeric,null);
  assert.throws(()=>D.parseResult(true));assert.throws(()=>D.parseResult({}));
});
test('Censored and categorical results retain qualifiers and never become exact measurements',()=>{
  for(const [raw,q] of [['<0.01','<'],['>100','>'],['≤ 3','<='],['>= 4','>='],['ND','ND'],['N.D.','ND'],['Not Detected','ND'],['不検出','ND'],['Pass','Pass'],['Fail','Fail'],['N/A','N/A']]){const p=D.parseResult(raw);assert.equal(p.qualifier,q);assert.equal(p.numeric,null);}
  assert.equal(D.parseResult('<0.01').upper,.01);assert.equal(D.parseResult('>100').lower,100);assert.equal(D.parseResult('<bad').qualifier,'text');
});
test('Range and tolerance are structured observations, never silently converted to a center',()=>{
  for(const raw of ['95–110','95 - 110','95 to 110'])assert.deepEqual([D.parseResult(raw).lower,D.parseResult(raw).upper,D.parseResult(raw).numeric],[95,110,null]);
  assert.deepEqual(D.parseResult('100 ± 5'),{raw:'100 ± 5',numeric:null,qualifier:'tolerance',lower:95,upper:105,nominal:100,tolerance:5});assert.equal(D.parseResult('-5 – -1').lower,-5);assert.equal(D.parseResult('110–95').qualifier,'text');
});
test('Calendar dates validated without using source filename or ambiguous day/month order',()=>{
  assert.equal(D.date('2024/2/29'),'2024-02-29');assert.equal(D.date('2026年10月1日'),'2026-10-01');for(const date of ['2026-02-29','2026-13-01','10/01/2026','2026-01-32','2026-10-01T00:00Z'])assert.equal(D.date(date),'');
  const p=page();p.words=p.words.filter(w=>!['Inspection Date:','2026-10-01'].includes(w.text));const d=D.extract([refresh(p)])[0];assert.equal(d.inspectionDate,'');assert.equal(d.deliveryDate,'');
});
test('Three editable supplier template defaults validate and preserve schema/version',()=>{
  const ts=D.defaults();assert.equal(ts.length,3);assert.deepEqual(ts.map(t=>t.id),['aster-v1','aoba-v1','northstar-v1']);assert.deepEqual(D.validateTemplates({schemaVersion:1,templates:ts}).templates,ts);ts[0].fields.lot.labels.push('Batch');assert.equal(D.defaults()[0].fields.lot.labels.includes('Batch'),false);
});
test('Template input accepts only known structure, bounded coordinates and literal patterns',()=>{
  const t=D.defaults()[0];const out=D.validateTemplate({...t,apiKey:'DO-NOT-SAVE',fields:{...t.fields,lot:{labels:['Lot'],pattern:'LOT-{value}',region:[.1,.1,.4,.2],secret:'NO'}}});assert.equal(JSON.stringify(out).includes('DO-NOT'),false);assert.equal(out.fields.lot.secret,undefined);
  assert.throws(()=>D.validateTemplate({...t,schemaVersion:2}));assert.throws(()=>D.validateTemplate({...t,fields:{...t.fields,lot:{labels:['Lot'],region:[.9,.1,.5,.2]}}}));assert.throws(()=>D.validateTemplate({...t,fields:{...t.fields,lot:{labels:['Lot'],pattern:'{value}{value}'}}}));assert.throws(()=>D.validateTemplates({schemaVersion:1,templates:[t,t]}));assert.throws(()=>D.validateTemplate({...t,aliases:{items:JSON.parse('{"__proto__":"unsafe"}')}}));
  const literal=D.validateTemplate({...t,fields:{...t.fields,lot:{labels:['Lot'],pattern:'(a+)+$'}}});assert.equal(D.extract([page()],[literal])[0].lot,'');
});
test('Text page extracts source-linked metadata and variable table rows without mutating page',()=>{
  const p=page(),before=JSON.stringify(p),d=D.extract([p])[0];assert.equal(JSON.stringify(p),before);assert.equal(d.product,'Resin A');assert.equal(d.productCode,'A-01');assert.equal(d.lot,'0001');assert.equal(d.certificate,'C-001');assert.equal(d.inspectionDate,'2026-10-01');assert.equal(d.rows.length,2);assert.equal(d.rows[0].item,'Viscosity');assert.equal(d.rows[0].resultNumeric,100);assert.equal(d.rows[0].unit,'mPa.s');assert.equal(d.rows[0].lsl,95);assert.equal(d.rows[0].usl,110);assert.equal(d.rows[0].method,'M-1');assert.equal(d.rows[1].resultNumeric,null);assert.equal(d.rows[1].qualifier,'<');assert.equal(d.rows[0].sourcePage,p.id);assert.deepEqual(d.rows[0].bbox,[.4,.37,.07,.01200000000000001]);assert.equal(d.verification,'unconfirmed');
});
test('Two-column labels with values below are bounded by next metadata anchor',()=>{
  const p=page(),keep=p.words.filter(x=>!['Product:','Resin A','Product Code:','A-01','Lot:','0001','Certificate:','C-001','Inspection Date:','2026-10-01'].includes(x.text));p.words=[...keep,w('Product',.08,.12),w('Lot',.55,.12),w('Resin A',.08,.14,.12),w('0001',.55,.14),w('Product Code',.08,.17,.14),w('Certificate',.55,.17,.12),w('A-01',.08,.19),w('C-001',.55,.19)];const d=D.extract([refresh(p)])[0];assert.equal(d.product,'Resin A');assert.equal(d.lot,'0001');assert.equal(d.productCode,'A-01');assert.equal(d.certificate,'C-001');
});
test('Metadata title alone never identifies a supplier and ambiguous matches stay unclassified',()=>{
  const p=page();p.words=p.words.filter(w=>w.text!=='Aster Materials');assert.equal(D.extract([refresh(p)])[0].status,'unidentified');const t=D.defaults()[0],other={...t,id:'aster-v2',version:2};assert.equal(D.extract([page()],[t,other])[0].templateId,'aster-v2');assert.equal(D.extract([page()],[t,{...other,supplierId:'another'}])[0].issues.includes('ambiguousTemplate'),true);
});
test('Same supplier alone does not merge adjacent certificates; changed lot is a new document',()=>{
  const p2=refresh(patchWords(page('p2',{pageNumber:2}),{'0001':'0002','C-001':'C-002'}));assert.equal(D.extract([page(),p2]).length,2);
  const same=D.extract([page(),page('p2',{pageNumber:2})]);assert.equal(same.length,2);assert.equal(same[1].issues.includes('boundaryNeedsReview'),true);
});
test('Continuation merges only adjacent matching identities in same file',()=>{
  const p2=page('p2',{pageNumber:2});p2.words.push(w('Continued',.7,.07));let docs=D.extract([page(),refresh(p2)]);assert.equal(docs.length,1);assert.deepEqual(docs[0].pages,['p1','p2']);assert.equal(docs[0].rows.length,4);
  for(const override of [{fileId:'another'}, {pageNumber:3}])assert.equal(D.extract([page(),refresh({...p2,...override})]).length,2);
  const changed=refresh(patchWords(p2,{'0001':'0002'}));docs=D.extract([page(),changed]);assert.equal(docs.length,2);assert.equal(docs[1].issues.includes('unresolvedContinuation'),true);
});
test('Missing identity in a continuation is retained separately for human review',()=>{
  const p2=page('p2',{pageNumber:2});p2.words=p2.words.filter(w=>!['Lot:','0001'].includes(w.text));p2.words.push(w('Continued',.7,.07));const ds=D.extract([page(),refresh(p2)]);assert.equal(ds.length,2);assert.ok(ds[1].issues.includes('missingLot'));assert.ok(ds[1].issues.includes('unresolvedContinuation'));
});
test('Headers/end anchors permit variable rows and prevent footer extraction',()=>{
  const p=page();p.words.push(w('999 bogus',.4,.5));assert.equal(D.extract([refresh(p)])[0].rows.length,2);p.words=p.words.filter(w=>w.bbox[1]!==.41);assert.equal(D.extract([refresh(p)])[0].rows.length,1);
  p.words=p.words.filter(w=>w.bbox[1]!==.32);assert.ok(D.extract([refresh(p)])[0].issues.includes('tableNotFound'));
});
test('Literal aliases apply only exact product/item names and retain original OCR',()=>{
  const t=D.defaults()[0];t.aliases={items:{Viscosity:'Viscosity at 25°C'},products:{'Resin A':'Resin Alpha'}};const d=D.extract([page()],[t])[0];assert.equal(d.product,'Resin Alpha');assert.equal(d.original.product,'Resin A');assert.equal(d.rows[0].item,'Viscosity at 25°C');assert.equal(d.rows[0].original.item,'Viscosity');
});
test('Low confidence and specification concerns flag review without changing the measurement',()=>{
  const p=page();p.words=p.words.map(w=>w.text==='100'?{...w,text:'120',confidence:48}:w);const d=D.extract([refresh(p)])[0],r=d.rows[0];assert.equal(r.resultNumeric,120);assert.ok(r.issues.includes('lowConfidence'));assert.ok(r.issues.includes('outOfSpecification'));assert.equal(d.status,'needsReview');assert.throws(()=>D.confirmDocument(d));assert.equal(D.confirmDocument(d,{acknowledgeIssues:true}).rows[0].resultNumeric,120);
});
test('Invalid specification is not inferred and exact measurements stay preserved',()=>{
  const p=refresh(patchWords(page(),{'95':'110','110':'95'})),d=D.extract([p])[0];assert.ok(d.rows[0].issues.includes('invalidSpecification'));assert.equal(d.rows[0].resultNumeric,100);assert.equal(D.analysisGroups(D.confirmDocument(d,{acknowledgeIssues:true})?[D.confirmDocument(d,{acknowledgeIssues:true})]:[]).length,0);
});
test('Correction functions are immutable, retain OCR origin, and reset confirmation',()=>{
  const original=approved(),before=JSON.stringify(original),r=original.rows[0],edited=D.editRow(original,r.id,{resultRaw:'105',unit:'cP'},{at:'2026-10-14T00:00:00Z'});assert.equal(JSON.stringify(original),before);assert.equal(edited.rows[0].resultNumeric,105);assert.equal(edited.rows[0].original.resultRaw,'100');assert.equal(edited.rows[0].edits.length,2);assert.equal(edited.rows[0].status,'unconfirmed');assert.equal(edited.verification,'unconfirmed');
  const metadata=D.editDocument(original,{lot:'0002'});assert.equal(metadata.original.lot,'0001');assert.equal(metadata.rows.every(r=>r.status==='unconfirmed'),true);assert.equal(D.analysisGroups([metadata]).length,0);
});
test('Manual rows preserve a blank OCR origin and explicit correction audit',()=>{
  const d=D.addRow(document(),{item:'Density',resultRaw:'1.05',unit:'g/mL'}),r=d.rows.at(-1);assert.equal(r.original.resultRaw,'');assert.equal(r.resultNumeric,1.05);assert.equal(r.edits[0].field,'manualRow');assert.equal(r.status,'unconfirmed');assert.throws(()=>D.addRow(d,{sourcePage:'not-existing',item:'Bad',resultRaw:'1'}));
});
test('Confirmation requires supplier/product/lot/item/result and never infers missing values',()=>{
  for(const patch of [{lot:''},{product:'',productCode:''},{supplier:''}])assert.throws(()=>D.confirmDocument(D.editDocument(document(),patch),{acknowledgeIssues:true}));
  assert.throws(()=>D.confirmDocument(D.editRow(document(),document().rows[0].id,{resultRaw:''}),{acknowledgeIssues:true}));assert.throws(()=>D.confirmDocument(D.editRow(document(),document().rows[0].id,{item:''}),{acknowledgeIssues:true}));
  const d=D.confirmRow(document(),document().rows[0].id,{acknowledgeIssues:true});assert.equal(d.verification,'unconfirmed');assert.equal(D.analysisGroups([d]).length,0);
});
test('Reject excludes rows and documents from analytics without deleting originals',()=>{
  const d=approved(),r=D.rejectRow(d,d.rows[0].id);assert.equal(r.rows[0].status,'rejected');assert.equal(r.rows[0].original.resultRaw,'100');assert.equal(D.analysisGroups([r]).length,0);assert.equal(D.analysisGroups([D.rejectDocument(d)]).length,0);
});
test('Split and merge reset confirmation and refuse conflicting identifiers',()=>{
  const p2=page('p2',{pageNumber:2});p2.words.push(w('Continued',.7,.07));const d=D.confirmDocument(D.extract([page(),refresh(p2)])[0],{acknowledgeIssues:true}),split=D.splitDocument(d,'p2');assert.deepEqual(split.map(x=>x.pages),[['p1'],['p2']]);assert.equal(split[0].verification,'unconfirmed');assert.equal(split[1].rows[0].status,'unconfirmed');assert.throws(()=>D.mergeDocuments(split));const merged=D.mergeDocuments(split,{acknowledged:true});assert.equal(merged.pages.length,2);assert.equal(merged.rows.length,4);assert.throws(()=>D.mergeDocuments([split[0],D.editDocument(split[1],{lot:'different'})],{acknowledged:true}));assert.throws(()=>D.splitDocument(d,'p1'));
});
test('Dataset validation rejects forged numeric interpretations and invalid schema',()=>{
  const d=approved(),payload={schemaVersion:1,documents:[d],apiKey:'discard'};assert.equal(D.validateDataset(payload).apiKey,undefined);assert.throws(()=>D.validateDataset({...payload,schemaVersion:2}));const bad=JSON.parse(JSON.stringify(d));bad.rows[1].resultNumeric=.01;assert.throws(()=>D.validateDocument(bad));bad.rows[1].resultNumeric=null;bad.rows[1].qualifier='=';assert.throws(()=>D.validateDocument(bad));assert.throws(()=>D.validateDataset({schemaVersion:1,documents:[d,d]}));const wrong=JSON.parse(JSON.stringify(d));wrong.rows[0].sourcePage='elsewhere';assert.throws(()=>D.validateDocument(wrong));
});
test('Long export includes every raw and review status; numeric precision stays a number',()=>{
  const d=D.editRow(document(),document().rows[0].id,{resultRaw:'1.23456789012345'}),out=D.exportLong([d]);assert.equal(out.rows.length,2);assert.equal(out.rows[0][out.headers.indexOf('Result Numeric')],1.23456789012345);assert.equal(out.rows[1][out.headers.indexOf('Result Numeric')],null);assert.equal(out.rows[1][out.headers.indexOf('Result Raw')],'<0.01');assert.equal(out.rows[0][out.headers.indexOf('Verification Status')],'unconfirmed');assert.equal(D.exportLong([d],{confirmedOnly:true}).rows.length,0);assert.equal(D.exportLong([approved()],{confirmedOnly:true}).rows.length,2);
});
test('Wide export separates units, methods and specifications and preserves duplicate raw observations',()=>{
  let d=approved();d=D.addRow(d,{item:'Viscosity',resultRaw:'101',unit:'mPa.s',method:'M-2',lslRaw:'95',uslRaw:'110'});d=D.addRow(d,{item:'Viscosity',resultRaw:'102',unit:'cP',method:'M-1',lslRaw:'95',uslRaw:'110'});d=D.addRow(d,{item:'Viscosity',resultRaw:'103',unit:'mPa.s',method:'M-1',lslRaw:'90',uslRaw:'110'});d=D.addRow(d,{item:'Viscosity',resultRaw:'104',unit:'mPa.s',method:'M-1',lslRaw:'95',uslRaw:'110'});const out=D.exportWide([d]);assert.equal(out.headers.length,13);assert.match(out.rows[0][8],/100 \[confirmed\].*104 \[unconfirmed\]/);assert.match(out.headers[10],/M-2/);
});
test('Analysis handoff contains only doubly confirmed exact numeric rows and never enables indices',()=>{
  assert.equal(D.analysisGroups([document()]).length,0);const groups=D.analysisGroups([approved()]);assert.equal(groups.length,1);assert.equal(groups[0].rows.length,1);assert.equal(groups[0].rows[0].value,100);assert.equal(groups[0].capabilityEligible,false);assert.deepEqual(groups[0].mapping,{lot:0,date:1,product:2,value:3});assert.equal(groups[0].table.rows[0][0],'0001');
});
test('Analysis handoff segregates supplier/product/item/method/unit/specs and uses natural lot order',()=>{
  const base=approved(),other=D.confirmDocument(D.editDocument({...approved(),id:'d2'},{lot:'0002'}),{acknowledgeIssues:true}),third=D.confirmDocument(D.editDocument({...approved(),id:'d3'},{lot:'0010'}),{acknowledgeIssues:true});assert.deepEqual(D.analysisGroups([third,base,other])[0].rows.map(r=>r.lot),['0001','0002','0010']);
  for(const patch of [{unit:'cP'},{method:'other'},{lslRaw:'90'}]){const changed=D.confirmDocument(D.editRow({...approved(),id:'d4'},base.rows[0].id,patch),{acknowledgeIssues:true});assert.equal(D.analysisGroups([base,changed]).length,2);}
  const supplier=D.confirmDocument(D.editDocument({...approved(),id:'d4'},{supplier:'Another Supplier'}),{acknowledgeIssues:true});assert.equal(D.analysisGroups([base,supplier]).length,2);
});
test('Search defaults to confirmed documents and supports identity, dates and inspection item',()=>{
  const ds=[approved(),{...document(),id:'unconfirmed'}];assert.equal(D.search(ds).length,1);assert.equal(D.search(ds,{confirmedOnly:false}).length,2);assert.equal(D.search(ds,{lot:'001',product:'resin',item:'visc',inspectionDateFrom:'2026-10-01',inspectionDateTo:'2026-10-01'}).length,1);assert.equal(D.search(ds,{deliveryDateFrom:'2026-01-01'}).length,0);assert.equal(D.search(ds,{inspectionDateTo:'2026-09-01'}).length,0);
});

test('Unsafe integers and numeric underflow are review text, never rounded or zero-filled measurements',()=>{
  for(const raw of ['9007199254740993','1e20','1e-400','0.'+'0'.repeat(400)+'1'])assert.equal(D.parseResult(raw).numeric,null);
  assert.equal(D.parseResult('0e-400').numeric,0);assert.equal(D.parseResult('9007199254740991').numeric,9007199254740991);
});
test('Explicit supplier override warns when identified supplier disagrees',()=>{const d=D.extract([page()],D.defaults(),{assignments:{p1:'northstar-v1'}})[0];assert.equal(d.supplierId,'northstar');assert.ok(d.issues.includes('supplierMismatch'));});
test('Continuation with conflicting inspection date is separated instead of discarding metadata',()=>{const p=page('p2',{pageNumber:2});p.words.push(w('Continued',.7,.07));const docs=D.extract([page(),refresh(patchWords(p,{'2026-10-01':'2026-10-02'}))]);assert.equal(docs.length,2);assert.equal(docs[1].inspectionDate,'2026-10-02');});
test('Metadata dates are canonical after explicit user edits and imports',()=>{const d=D.editDocument(document(),{inspectionDate:'2026/10/02'});assert.equal(d.inspectionDate,'2026-10-02');assert.equal(d.original.inspectionDate,'2026-10-01');assert.equal(D.validateDocument({...d,inspectionDate:'2026年10月3日'}).inspectionDate,'2026-10-03');});

test('Certificate title/footer are not mistaken for certificate number',()=>{const p=page();p.words.push(w('Certificate page 1/1',.08,.52,.25));const d=D.extract([refresh(p)])[0];assert.equal(d.certificate,'C-001');assert.equal(d.issues.includes('ambiguousField:certificate'),false);});
test('Below-label metadata tolerates OCR left-edge jitter without consuming adjacent values',()=>{const p=page();p.words=p.words.filter(w=>!['Inspection Date:','2026-10-01'].includes(w.text));p.words.push(w('Issue Date:',.08,.24,.14),w('Inspection Date:',.55,.24,.15),w('2026-10-02',.079,.26,.13),w('2026-10-01',.549,.26,.13));const d=D.extract([refresh(p)])[0];assert.equal(d.issueDate,'2026-10-02');assert.equal(d.inspectionDate,'2026-10-01');});
test('Different units on same item/method require review and are never converted',()=>{const p=page();p.words.push(w('Viscosity',.08,.43,.1),w('101',.4,.43),w('cP',.55,.43),w('95',.65,.43),w('110',.75,.43),w('M-1',.85,.43));const d=D.extract([refresh(p)])[0];assert.ok(d.rows[0].issues.includes('unitMismatch'));assert.ok(d.rows[2].issues.includes('unitMismatch'));assert.equal(d.rows[2].unit,'cP');assert.equal(d.rows[2].resultNumeric,101);});

test('Deskewed layout boxes group table rows while review boxes stay on original rotated source',()=>{
 const p=page();p.method='ocr';p.words=p.words.map(w=>({...w,layoutBBox:[...w.bbox],bbox:[w.bbox[0],w.bbox[1]+w.bbox[0]*.07,w.bbox[2],w.bbox[3]]}));
 const validated=D.validatePage(p);assert.deepEqual(validated.words[0].layoutBBox,p.words[0].layoutBBox);
 const d=D.extract([refresh(p)])[0];assert.equal(d.rows.length,2);assert.equal(d.rows[0].resultNumeric,100);assert.equal(d.product,'Resin A');assert.ok(Math.abs(d.rows[0].bbox[1]-(.37+.4*.07))<1e-12);assert.ok(Math.abs(d.fieldSources.product.bbox[1]-(.12+.25*.07))<1e-12);
 const broken=structuredClone(p);broken.words[0].layoutBBox=[.9,.1,.5,.1];assert.throws(()=>D.validatePage(broken));
});

test('Prototype-like extracted names are literal data, never inherited alias values',()=>{const p=refresh(patchWords(page(),{'Resin A':'__proto__','Viscosity':'constructor'})),d=D.extract([p])[0];assert.equal(d.product,'__proto__');assert.equal(d.rows[0].item,'constructor');assert.equal(D.validateDocument(d).rows[0].item,'constructor');});

test('Validated OCR options and bounded raw-page revisions retain processing history without arbitrary settings',()=>{
 const p=page();p.options={language:'jpn',layout:'block',preprocess:'contrast',rotation:0,deskew:-1.5,scale:2,forceOCR:true,denoise:false,apiKey:'DROP'};const r=D.pageRevision(p,'2026-10-14T00:00:00Z');assert.equal(r.text,p.text);assert.equal(r.wordCount,p.words.length);assert.equal(r.options.deskew,-1.5);assert.equal(r.options.apiKey,undefined);assert.equal(r.textTruncated,false);assert.deepEqual(D.validatePage({...p,revisions:[r]}).revisions,[r]);
 assert.throws(()=>D.validatePage({...p,revisions:Array(6).fill(r)}));assert.throws(()=>D.validatePage({...p,options:{...p.options,language:'remote-model'}}));assert.throws(()=>D.validatePage({...p,options:{...p.options,deskew:90}}));assert.throws(()=>D.validatePage({...p,revisions:[{...r,textLength:0}]}));
 const long={...p,text:'x'.repeat(250000)},truncated=D.pageRevision(long);assert.equal(truncated.text.length,200000);assert.equal(truncated.textLength,250000);assert.equal(truncated.textTruncated,true);
});
