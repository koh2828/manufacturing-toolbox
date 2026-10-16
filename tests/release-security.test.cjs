'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js'),K=require('../dist/clean-core.js'),R=require('../dist/file-reader.js'),I=require('../dist/import-core.js'),L=require('../dist/i18n.js'),X=require('../dist/vendor/xlsx.full.min.js');
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
function bytesFor(sheet){const wb=X.utils.book_new();X.utils.book_append_sheet(wb,sheet,'Data');return X.write(wb,{type:'buffer',bookType:'xlsx',compression:true});}

test('CSV safety is explicit in preview, idempotent, and preserves source values and genuine negatives',()=>{
  const raw={headers:['=DANGEROUS','Result'],rows:[['=1+1',-4],['+SUM(1,2)',0],['-1+1','-1.25'],['@SUM(1,2)','-2e3'],['\t=1+1','000123'],['\u0000=1+1','<0.01'],['line1\nline2','ND'],['a,b','Pass'],['', '0']]};
  const before=structuredClone(raw),p=K.prepare(raw,[],{format:'csv'});
  assert.equal(p.formulaLike,7);assert.equal(p.headers[0],"'=DANGEROUS");
  assert.deepEqual(p.rows[0],["'=1+1",-4]);assert.equal(p.rows[2][1],'-1.25');assert.equal(p.rows[3][1],'-2e3');
  const reimport=C.csv(K.csv(p));assert.deepEqual(reimport,[p.headers,...p.rows.map(r=>r.map(v=>String(v)))]);
  assert.deepEqual(C.csv(K.csv({headers:raw.headers,rows:raw.rows})),reimport);assert.deepEqual(raw,before);
  assert.equal(K.csvValue(K.csvValue('=1+1')),"'=1+1");
});
test('XLSX exports literal formula-like strings and retains blank, zero and string zero distinction',()=>{
  const raw={headers:['Value'],rows:[['=1+1'],['\t=1+1'],[-4],['-4'],['000123'],[''],[0],['0'],['<0.01'],['ND'],['Pass']]};
  const wb=K.workbook(X,K.prepare(raw)),out=R.safeRead(X,R.safeWrite(X,wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}),s=out.Sheets.Cleaned;
  for(const address of ['A2','A3','A5','A6','A9','A10','A11','A12']){assert.equal(s[address].t,'s');assert.equal(s[address].f,undefined);}
  assert.equal(s.A4.t,'n');assert.equal(s.A4.v,-4);assert.equal(s.A6.v,'000123');assert.equal(s.A8.t,'n');assert.equal(s.A8.v,0);assert.equal(s.A9.v,'0');
  assert.ok(!s.A7||s.A7.v==='');assert.deepEqual(raw.rows[0],['=1+1']);
});
test('Actual XLSX without cached formula result is rejected before analysis in either language',async()=>{
  const sheet=X.utils.aoa_to_sheet([['Lot','Value'],['000123',1]]);sheet.B3={t:'n',f:'SUM(B2)'};sheet['!ref']='A1:B3';const bytes=bytesFor(sheet);
  for(const lang of ['ja','en']){L.setLanguage(lang);await assert.rejects(R.read(file('formula.xlsx',bytes),X),e=>e.code==='FORMULA_MISSING'&&e.message.includes('B3')&&!e.message.includes('SUM'));}
  L.setLanguage('ja');
});
test('Cached external references are only stored values; exports contain neither formulas nor external links',async()=>{
  const sheet=X.utils.aoa_to_sheet([['Lot','Value'],['000123',-2.5]]);sheet.B2.f="'[https://invalid.example/SECRET.xlsx]Sheet1'!A1";sheet.A2.l={Target:'https://invalid.example/SECRET'};const bytes=bytesFor(sheet),before=Buffer.from(bytes);
  const imported=await R.read(file('links.xlsx',bytes),X);assert.deepEqual(imported.table.rows,[['000123',-2.5]]);assert.deepEqual(Buffer.from(bytes),before);
  const exported=K.workbook(X,K.prepare(imported.table,[],{sourceSheet:imported.workbook.Sheets.Data,X})).Sheets.Cleaned;
  assert.equal(exported.B2.v,-2.5);assert.equal(exported.B2.f,undefined);assert.equal(exported.A2.l,undefined);
});
test('ZIP declared expansion and malformed central directory fail before vendor parsing',()=>{
  const normal=bytesFor(X.utils.aoa_to_sheet([['Value'],[1]]));assert.doesNotThrow(()=>R.checkArchive(normal));
  const huge=Buffer.from(normal),central=huge.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));assert.ok(central>=0);huge.writeUInt32LE(R.MAX_ENTRY_BYTES+1,central+24);
  let calls=0;assert.throws(()=>R.safeRead({read:()=>calls++},huge,{type:'buffer'}),e=>e.message===L.t('import.archiveLimit'));assert.equal(calls,0);
  assert.throws(()=>R.checkArchive(normal.subarray(0,normal.length-1)));const malformed=Buffer.from(normal);malformed.writeUInt32LE(0,central);assert.throws(()=>R.checkArchive(malformed));
});
test('Sheet switch guard rejects missing formula caches even outside the selected table range',()=>{
  const sheet=X.utils.aoa_to_sheet([['Value'],[1]]);sheet.C20={t:'n',f:'1+1'};
  assert.throws(()=>I.sheetRows(X,sheet),e=>e.code==='FORMULA_MISSING'&&e.message.includes('C20'));
});
test('Workflow importer messages allow only known guidance and validated formula coordinates',()=>{
  assert.equal(R.message(Error('PRIVATE-FILE-CONTENT')),null);
  assert.equal(R.message({code:'FORMULA_MISSING',count:1,cell:'B3',message:'PRIVATE-FILE-CONTENT'}),L.t('import.formulaMissing',[1,'B3']));
  assert.equal(R.message({code:'FORMULA_MISSING',count:1,cell:'PRIVATE-FILE-CONTENT',message:'PRIVATE-FILE-CONTENT'}),null);
  assert.equal(R.message(Error(L.t('import.archiveLimit'))),L.t('import.archiveLimit'));
});
