'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {evaluate,matchRows,readPages}=require('./document-accuracy.cjs');
const fs=require('node:fs'),path=require('node:path');
const truth=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/documents/ground-truth.json'),'utf8'));
function perfect(){
 const pages=truth.pages.map(p=>({id:'p'+p.pageNumber,pageNumber:p.pageNumber,method:p.expectedMethod}));
 const documents=truth.documents.map(d=>({id:d.id,supplier:d.supplierName,supplierId:d.supplierId,product:d.fields.productName,productCode:d.fields.productCode,lot:d.fields.lot,certificate:d.fields.certificateNumber,issueDate:d.fields.issueDate,inspectionDate:d.fields.inspectionDate,deliveryDate:d.fields.deliveryDate,pages:d.sourcePages.map(p=>'p'+p),status:'identified',verification:'unconfirmed',issues:[],rows:truth.pages.filter(p=>p.documentId===d.id).flatMap(p=>p.rows.map(r=>({id:r.id,sourcePage:'p'+p.pageNumber,bbox:r.bbox,item:r.item,resultRaw:r.raw,unit:r.unit,lslRaw:r.lsl,uslRaw:r.usl,method:r.method,issues:[]})))}));
 return {pages,documents};
}
test('Fixture corpus contains3suppliers2products20pages16certificates93rows and adversarial conditions',()=>{
 assert.equal(truth.pageCount,20);assert.equal(truth.documentCount,16);assert.equal(truth.inspectionRowCount,93);
 assert.equal(Object.keys(truth.suppliers).length,3);assert.ok(Object.values(truth.suppliers).every(s=>s.products.length===2));
 assert.equal(truth.pages.filter(p=>p.expectedMethod==='ocr').length,18);
 assert.equal(truth.documents.filter(d=>d.sourcePages.length===2).length,4);
 assert.ok(truth.pages.some(p=>!p.fields.lot));assert.ok(truth.pages.some(p=>p.degradation.includes('obscured')));
 for(const raw of ['0.01','1,234.5','<0.01','>100','ND','N.D.','Not Detected','Pass','Fail','N/A','95–110','100 ± 5'])assert.ok(truth.pages.some(p=>p.rows.some(r=>r.raw===raw)),raw);
});
test('Scorer-only perfect fixture reaches100percent; this is not an OCR result',()=>{
 const {pages,documents}=perfect(),r=evaluate(truth,pages,documents);
 assert.ok(Object.values(r.accuracy).every(x=>x.percent===100));assert.equal(r.boundary.f1,100);assert.equal(r.review.minimumCorrectionCells,0);assert.equal(r.review.unconfirmedDocuments,16);
});
test('Wrong association, decimal error and dropped row remain errors without favorable value matching',()=>{
 const {pages,documents}=perfect(),d=documents[0];
 [d.rows[0].resultRaw,d.rows[1].resultRaw]=[d.rows[1].resultRaw,d.rows[0].resultRaw];d.rows[2].resultRaw='0.01';d.rows.splice(3,1);
 const r=evaluate(truth,pages,documents);
 assert.equal(r.accuracy.value.correct,89);assert.equal(r.accuracy.itemValuePair.correct,89);assert.equal(r.accuracy.item.correct,92);assert.equal(r.review.missingRows,1);assert.ok(r.review.minimumCorrectionCells>=5);
});
test('Overmerge and oversplit are counted by actual adjacent boundary decisions',()=>{
 const {pages,documents}=perfect();documents[0].pages.push(...documents[1].pages);documents[0].rows.push(...documents[1].rows);documents.splice(1,1);
 const d=documents[2],second={...d,id:'split',pages:[d.pages[1]],rows:d.rows.filter(r=>r.sourcePage===d.pages[1])};d.rows=d.rows.filter(r=>r.sourcePage===d.pages[0]);d.pages=[d.pages[0]];documents.push(second);
 const r=evaluate(truth,pages,documents);assert.equal(r.boundary.falseNegative,1);assert.equal(r.boundary.falsePositive,1);assert.equal(r.boundary.adjacentDecisions.correct,17);
});
test('Row alignment uses geometry, retains extras and falls back explicitly for absentboxes',()=>{
 const e=[{bbox:[0,.4,.9,.04]},{bbox:[0,.5,.9,.04]}],a=[{bbox:[0,.41,.9,.02]},{bbox:[0,.46,.9,.02]},{bbox:[0,.51,.9,.02]}];
 const x=matchRows(e,a);assert.deepEqual(x.pairs,[[0,0],[1,2]]);assert.deepEqual(x.extra,[1]);
 assert.match(matchRows([{}],[{}]).method,/ordinal/);assert.throws(()=>readPages({text:'mock text'}));
});
test('Published synthetic supplier templates import with the current schema and match corpus identities',()=>{
 const D=require('../dist/document-core.js'),payload=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/documents/supplier-templates.json'),'utf8'));
 const {templates}=D.validateTemplates(payload);assert.equal(templates.length,3);
 for(const [supplierId,supplier] of Object.entries(truth.suppliers)){const t=templates.find(t=>t.supplierId===supplierId);assert.ok(t);assert.equal(t.id,supplier.templateId);assert.equal(t.supplier,supplier.name);}
});
test('Secondary whitespace metric does not hide wrong characters, punctuation, or row association',()=>{
 const {pages,documents}=perfect(),d=documents.find(d=>d.supplierId==='aoba');d.rows[0].item='粘 度';d.rows[1].resultRaw='0 . 01';d.rows[2].resultRaw='0.01';
 const r=evaluate(truth,pages,documents);assert.equal(r.accuracy.itemValuePair.correct,90);assert.equal(r.secondaryAccuracy.whitespaceInsensitiveItemValuePair.correct,92);
});
