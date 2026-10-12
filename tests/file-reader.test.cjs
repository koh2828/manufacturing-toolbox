const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/file-reader.js'),X=require('../dist/vendor/xlsx.full.min.js'),L=require('../dist/i18n.js');
const file=(name,content)=>{const bytes=typeof content==='string'?Buffer.from(content):Buffer.from(content);return {name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
const workbook=()=>{const wb=X.utils.book_new(),sheet=X.utils.aoa_to_sheet([['Date','Lot','Value'],[42160.5,1,101],[42161,2,102]]);sheet.A2.z=sheet.A3.z='yyyy-mm-dd hh:mm';sheet.B2.z=sheet.B3.z='0000';wb.Workbook={WBProps:{date1904:true}};X.utils.book_append_sheet(wb,sheet,'Data');return wb;};

test('Shared reader preserves CSV/header/table metadata without changing source values',async()=>{
  const source='Monthly report\nDate,Lot,Value\n2026-01-01,00001,101\n2026-01-02,00002,102\n';
  const input=file('report.csv',source),result=await R.read(input,X);
  assert.equal(result.name,'report.csv');assert.equal(result.headerRow,2);assert.equal(result.hasHeader,true);
  assert.equal(result.raw[0][0],'Monthly report');assert.deepEqual(result.table.rows[0],['2026-01-01','00001','101']);
  assert.equal(result.table.sourceHeaderRow,2);assert.equal(result.table.sourceHasHeader,true);assert.equal(result.workbook,null);
  assert.equal(result.date1904,false);assert.equal(result.sheet,'');assert.equal(result.table.sheet,'');
  assert.equal(Buffer.from(await input.arrayBuffer()).toString(),source);
});
test('Shared reader retains TSV quoting and Shift-JIS fallback',async()=>{
  const tsv=await R.read(file('report.tsv','Lot\tValue\n"L\t1"\t1\nL2\t2'),null);
  assert.deepEqual(tsv.table.rows[0],['L\t1','1']);
  const bytes=Buffer.concat([Buffer.from('Item,Value\n'),Buffer.from([0x82,0xa0]),Buffer.from(',1\n')]);
  const sjis=await R.read(file('report.csv',bytes),null);assert.equal(sjis.table.rows[0][0],'あ');
});
test('Shared reader preserves XLSX dates, workbook, sheet and zero-padded lots',async()=>{
  const imported=await R.read(file('report.xlsx',X.write(workbook(),{type:'buffer',bookType:'xlsx'})),X);
  assert.equal(imported.date1904,true);assert.equal(imported.table.date1904,true);assert.equal(imported.sheet,'Data');
  assert.equal(imported.table.rows[0][0],42160.5);assert.equal(imported.table.rows[0][1],'0001');assert.ok(imported.workbook.Sheets.Data);
  assert.equal(imported.headerRow,1);assert.deepEqual(imported.table.headers,['Date','Lot','Value']);
});
test('Shared reader retains legacy XLS support',async()=>{
  const imported=await R.read(file('report.xls',R.safeWrite(X,workbook(),{type:'buffer',bookType:'biff8'})),X);
  assert.equal(imported.date1904,true);assert.deepEqual(imported.table.rows[0],[42160.5,'0001',101]);
});
test('Read limits and unsupported formats fail without beginning oversized file IO',async()=>{
  let reads=0;await assert.rejects(R.read({name:'large.xlsx',size:R.MAX_BYTES+1,arrayBuffer:()=>{reads++;}},X),new RegExp('10'));
  assert.equal(reads,0);await assert.rejects(R.read(file('data.json','{}'),X));
  await assert.rejects(R.read(file('many.csv','Value\n'+'1\n'.repeat(50001)),X),new RegExp('50,000'));
  await assert.rejects(R.read(file('wide.csv',Array(301).fill('Value').join(',')+'\n'+Array(301).fill('1').join(',')),X));
  await assert.rejects(R.read(file('many.xlsx','ignored'),{...X,read:()=>({SheetNames:['Data'],Sheets:{Data:{'!ref':'A1:A50002'}}})}),new RegExp('50,000'));
});
test('Failed IO and vendor errors return only localized generic errors',async()=>{
  const marker='PRIVATE-FILE-CONTENT';
  const input={name:'test.csv',size:1,arrayBuffer:async()=>{throw Error(marker);}};
  for(const lang of ['ja','en']){L.setLanguage(lang);
    await assert.rejects(R.read(input,X),error=>error.message===L.t('app.518b35606d')&&!error.message.includes(marker)&&!error.cause);
    assert.throws(()=>R.safeRead({read:()=>{throw Error(marker);}},null,{}),error=>error.message===L.t('app.518b35606d')&&!error.cause);
    assert.throws(()=>R.safeWrite({write:()=>{throw Error(marker);}},null,{}),error=>error.message===L.t('app.518b35606d')&&!error.cause);
  }L.setLanguage('ja');
});
test('Quiet vendor restores console methods and property descriptors after success, nesting and exceptions',()=>{
  const original=Object.getOwnPropertyDescriptors(console),calls=[];
  const previous=console.error;console.error=(...args)=>calls.push(args);
  try{
    const saved=console.error;
    assert.equal(R.quietVendor(()=>{console.error('PRIVATE');return R.quietVendor(()=>{console.warn('PRIVATE');return 3;});}),3);
    assert.equal(console.error,saved);assert.throws(()=>R.quietVendor(()=>{console.error('PRIVATE');throw Error('failure');}));
    assert.equal(console.error,saved);assert.deepEqual(calls,[]);
  }finally{console.error=previous;}
  for(const key of ['log','info','warn','error','debug','assert','dir','table','trace'])assert.deepEqual(Object.getOwnPropertyDescriptor(console,key),original[key]);
});
test('Flat ODS renamed as XLSX cannot leak embedded text through vendor diagnostics',async()=>{
  const xml=`<?xml version="1.0" encoding="UTF-8"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:automatic-styles><number:number-style style:name="N1"><number:number number:decimal-places="0"/><style:map style:condition="PRIVATE-AUDIT-SENTINEL" style:apply-style-name="N2"/></number:number-style><style:style style:name="ce1" style:family="table-cell" style:data-style-name="N1"/></office:automatic-styles><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row><table:table-cell office:value-type="string"><text:p>Value</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="float" office:value="3" table:style-name="ce1"><text:p>3</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document>`;
  const calls=[],previous=console.error;console.error=(...args)=>calls.push(args);
  try{const imported=await R.read(file('renamed.xlsx',xml),X);assert.equal(imported.sheet,'Sheet1');assert.equal(imported.table.rows[0][0],3);assert.deepEqual(calls,[]);}
  finally{console.error=previous;}
});
test('Safe Excel write/read preserves formula-like strings as text',()=>{
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['Value'],['=1+1'],['@SUM(A1:A2)']]),'Data');
  const result=R.safeRead(X,R.safeWrite(X,wb,{bookType:'xlsx',type:'array'}),{type:'array'});
  assert.equal(result.Sheets.Data.A2.v,'=1+1');assert.equal(result.Sheets.Data.A2.t,'s');assert.equal(result.Sheets.Data.A2.f,undefined);
});
