const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../dist/workflow-config.js'),F=require('../dist/workflow-core.js'),I=require('../dist/import-core.js');
const headers=['Date','Product','Lot','Equipment','Viscosity','Density'];
const wide=()=>({format:'wide',date:0,product:1,lot:2,equipment:3,measurements:[{column:4,name:'Viscosity',unit:'mPa·s',lsl:95,usl:110},{column:5,name:'Density',unit:'g/mL',lsl:null,usl:1.2}]});
const source=()=>({name:'synthetic.csv',sheet:'Data',date1904:false,isDemo:true,table:{headers:[...headers],rows:[['2026-01-01','A','00001','E1',100,1.1]],sourceHeaderRow:3,sourceHasHeader:true},mapping:wide()});
const batchHeaders=['Batch ID','Product','Equipment','Process Step','Start Time','End Time','Delay Category','Delay Reason','Target Time','Loss Type'];
const batchMapping=()=>Object.fromEntries(W.fields.batch.map((key,i)=>[key,i]));
const settings=()=>W.settings('recurring');
const project=()=>F.project('recurring',[source()],settings());
const legacyEntry={tool:'capability',headers:['Product','Date','Viscosity'],mapping:{product:0,date:1,value:2}};
const legacySettings={lsl:'95',usl:'110',unit:'mPa·s',chart:'imr',subgroupSize:5,rules:[1],productValue:'A',order:'input'};

test('Existing preference namespace and v1 mappings/presets remain backward compatible',()=>{
  const old={version:1,mappings:[legacyEntry],presets:[{...legacyEntry,name:'Legacy',auto:false,settings:legacySettings}]};
  const result=I.validate(old);assert.equal(result.version,1);assert.equal(result.mappings[0].mapping.lot,-1);assert.deepEqual(result.presets[0].settings,legacySettings);
  assert.equal(I.KEY,'manufacturing-toolbox.preferences.v1');assert.equal(result.mappings[0].layouts,undefined);
});
test('Legacy date-order preset migration still prefers the existing lot column',()=>{
  const old={...legacyEntry,headers:['Lot','Date','Value'],mapping:{product:-1,date:1,value:2}};
  const result=I.validate({version:1,mappings:[],presets:[{...old,name:'Old',auto:false,settings:{...legacySettings,order:'date'}}]});
  assert.equal(result.presets[0].mapping.lot,0);assert.equal(result.presets[0].settings.order,'lot');
});
test('Recurring wide mapping preserves per-item limits and clears inactive long fields',()=>{
  const out=W.mapping('recurring',{...wide(),value:4,item:2},headers.length);
  assert.equal(out.value,-1);assert.equal(out.item,-1);assert.deepEqual(out.measurements,wide().measurements);
  assert.equal(out.measurements[1].lsl,null);assert.equal(out.date,0);
});
test('Recurring long and batch mapping accept optional metadata but require measurements/times',()=>{
  const long=W.mapping('recurring',{format:'long',item:0,value:1,unit:2,lsl:3,usl:4},5);
  assert.equal(long.date,-1);assert.equal(long.value,1);assert.deepEqual(long.measurements,[]);
  assert.throws(()=>W.mapping('recurring',{format:'long',item:0},2));
  assert.deepEqual(W.mapping('batch',batchMapping(),10),batchMapping());
  const minimum=W.mapping('batch',{batch:0,step:1,start:2,end:3},4);assert.equal(minimum.product,-1);
  for(const key of ['batch','step','start','end'])assert.throws(()=>W.mapping('batch',{...batchMapping(),[key]:-1},10));
});
test('Duplicate active columns, invalid types and unknown formats are rejected',()=>{
  for(const m of [{...wide(),product:0},{...wide(),date:4},{...wide(),measurements:[wide().measurements[0],wide().measurements[0]]},{...wide(),measurements:[null]},{...wide(),format:'automatic'},{...wide(),date:'0'},{...wide(),date:99}])assert.throws(()=>W.mapping('recurring',m,6));
  assert.throws(()=>W.mapping('recurring',{format:'long',value:1,item:1},2));assert.throws(()=>W.mapping('batch',{...batchMapping(),end:4},10));
  assert.throws(()=>W.mapping('recurring',wide(),301));assert.throws(()=>W.mapping('constructor',{},1));
});
test('Optional blank limits stay null; strict numeric syntax prevents silent coercion to zero',()=>{
  const m=wide();m.measurements[0].lsl=' \t';m.measurements[0].usl='１１０';
  const out=W.mapping('recurring',m,6);assert.equal(out.measurements[0].lsl,null);assert.equal(out.measurements[0].usl,110);
  assert.equal(W.settings('recurring',{cpkThreshold:' ',deltaThreshold:''}).cpkThreshold,null);
  assert.equal(W.settings('recurring',{cpkThreshold:0,deltaThreshold:'1e-2'}).deltaThreshold,.01);
  for(const value of [true,false,[],{},'0x20','bad',Infinity,NaN])assert.throws(()=>W.settings('recurring',{cpkThreshold:value}));
  for(const [lsl,usl] of [[100,95],[100,100],[false,110],['bad',110]])assert.throws(()=>W.mapping('recurring',{...wide(),measurements:[{column:4,name:'Item',unit:'',lsl,usl}]},6));
});
test('Settings validate real calendar dates and ordered open/closed periods',()=>{
  assert.equal(W.settings('recurring',{from:'2024-02-29',to:'2024-03-01'}).from,'2024-02-29');
  assert.equal(W.settings('batch',{from:'',to:'2026-01-31'}).from,'');
  for(const date of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','2026-01-00','2026-1-01','1899-12-31'])assert.throws(()=>W.settings('recurring',{from:date}));
  assert.throws(()=>W.settings('recurring',{from:'2026-02-02',to:'2026-02-01'}));
  assert.throws(()=>W.settings('recurring',{previousFrom:'2026-02-02',previousTo:'2026-02-01'}));
});
test('Settings strip extra/raw content and copy mutable arrays',()=>{
  const rules=[1,1,2],dirty={...W.defaults,rules,rows:[['RAW-SECRET']],filename:'RAW-SECRET',apiKey:'RAW-SECRET'},out=W.settings('recurring',dirty);
  assert.deepEqual(out.rules,[1,2]);rules.push(3);assert.deepEqual(out.rules,[1,2]);assert.equal(JSON.stringify(out).includes('RAW-SECRET'),false);
  for(const patch of [{chart:'p'},{minSamples:1},{subgroupSize:2.5},{reportCharts:13},{rules:[9]},{attentionSpc:1},{deltaThreshold:-1},{outlier:'delete'},{reference:'unknown'},{displayUnit:'day'}])assert.throws(()=>W.settings('recurring',patch));
  for(const invalid of [null,[],true,'text'])assert.throws(()=>W.settings('recurring',invalid));
});
test('New presets reuse existing preference storage and retain exact multiple layouts',()=>{
  const s=source(),second=source();second.table.headers=['Date2','Product2','Lot2','Equipment2','Item1','Item2'];
  const layouts=F.layouts([s,second],'recurring'),entry={tool:'recurring',headers:s.table.headers,mapping:s.mapping,layouts};
  const saved=I.validate({version:1,mappings:[entry],presets:[{...entry,name:'Monthly',auto:false,settings:{...settings(),rows:[['PRIVATE-ROW']]},raw:'PRIVATE-ROW'}]});
  assert.equal(saved.presets[0].layouts.length,2);assert.deepEqual(saved.presets[0].layouts[1].headers,second.table.headers);assert.equal(JSON.stringify(saved).includes('PRIVATE-ROW'),false);
  const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};I.write(storage,saved);assert.deepEqual(I.read(storage).data,saved);
  assert.deepEqual([...map.keys()],[I.KEY]);
});
test('Schema reuse matches only exact normalized ordered headers and warns for unknown layouts',()=>{
  const s=source(),preset={tool:'recurring',layouts:F.layouts([s],'recurring')};
  assert.equal(F.matchLayouts([s],preset),true);const normalized=source();normalized.table.headers[0]=' Ｄａｔｅ ';assert.equal(F.matchLayouts([normalized],preset),true);
  for(const headerList of [['Product','Date',...headers.slice(2)],headers.slice(0,-1),[...headers,'New Column'],['Date','Date',...headers.slice(2)]]){const changed=source();changed.table.headers=headerList;assert.equal(F.matchLayouts([changed],preset),false);}
  assert.equal(F.matchLayouts([],preset),false);assert.equal(F.matchLayouts([s],{...preset,tool:'batch'}),true); // Schema matching is format-only; validated preset.tool selects its workflow.
});
test('Preset validation rejects broken layout definitions and ignores layout raw data',()=>{
  const s=source(),entry={tool:'recurring',headers:s.table.headers,mapping:s.mapping,layouts:[{headers:s.table.headers,mapping:s.mapping,raw:'PRIVATE'}]};
  const result=I.validate({version:1,mappings:[entry],presets:[]});assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
  for(const layouts of [null,[],Array(21).fill(entry.layouts[0]),[{headers:['a','a'],mapping:s.mapping}],[{headers:s.table.headers,mapping:{format:'long',value:999}}]])assert.throws(()=>I.validate({version:1,mappings:[{...entry,layouts}],presets:[]}));
});
test('Preset layouts deduplicate identical files and reject ambiguous mappings without blocking analysis',()=>{
  const a=source(),b=source();assert.equal(F.layouts([a,b],'recurring',true).length,1);
  b.mapping.measurements[0].lsl=90;assert.equal(F.layouts([a,b],'recurring').length,2);assert.throws(()=>F.layouts([a,b],'recurring',true),/workflow.ambiguousLayouts/);
  const entry={tool:'recurring',headers:a.table.headers,mapping:a.mapping,layouts:F.layouts([a,b],'recurring')};
  assert.throws(()=>I.validate({version:1,mappings:[entry],presets:[]}));
  entry.layouts=F.layouts([a,a],'recurring');entry.layouts.push(entry.layouts[0]);assert.equal(I.validate({version:1,mappings:[entry],presets:[]}).mappings[0].layouts.length,1);
});
test('Shared column suggestions support English/Japanese long, wide and batch input',()=>{
  const long=F.suggest('recurring',{headers:['日付','製品','ロット','設備','検査項目','測定値','単位','規格下限','規格上限'],rows:[['2026-01-01','A','L1','E1','Viscosity',100,'mPa·s',95,110]]});
  assert.equal(long.format,'long');assert.equal(long.item,4);assert.equal(long.value,5);assert.equal(long.lsl,7);
  const wideSuggested=F.suggest('recurring',source().table);assert.equal(wideSuggested.format,'wide');assert.deepEqual(wideSuggested.measurements.map(x=>x.column),[4,5]);
  assert.deepEqual(F.suggest('batch',{headers:batchHeaders,rows:[]}),batchMapping());
});
test('Project roundtrip clones explicit data, source provenance and settings without unrelated fields',()=>{
  const s=source();s.raw='UNEXPECTED';s.table.sourceRows=[27];const p=F.project('recurring',[s],{...settings(),apiKey:'UNEXPECTED'});
  assert.equal(p.format,'manufacturing-toolbox-project');assert.equal(p.version,1);assert.equal(p.sources[0].id,'source-0');assert.deepEqual(p.sources[0].table.rows,s.table.rows);assert.deepEqual(p.sources[0].table.sourceRows,[27]);assert.equal(JSON.stringify(p).includes('UNEXPECTED'),false);
  s.table.rows[0][4]=777;assert.equal(p.sources[0].table.rows[0][4],100);assert.deepEqual(F.validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('Project retains 1904 dates from source/table and rejects conflicting or nonboolean metadata',()=>{
  const s=source();delete s.date1904;s.table.date1904=true;const p=F.project('recurring',[s],settings());assert.equal(p.sources[0].date1904,true);assert.equal(p.sources[0].table.date1904,true);
  for(const patch of [{date1904:'false'},{isDemo:'false'},{date1904:false}])assert.throws(()=>F.project('recurring',[{...s,...patch}],settings()));
  const malformed=project();malformed.sources[0].table.sourceHasHeader='false';assert.throws(()=>F.validateProject(malformed));
});
test('Project version, file/row/column bounds and unsafe cells are rejected',()=>{
  for(const patch of [{version:2},{format:'other'},{tool:'capability'},{sources:[]},{sources:Array(21).fill(source())}])assert.throws(()=>F.validateProject({...project(),...patch}));
  const valid=source();valid.table.rows=Array.from({length:50000},()=>[]);assert.equal(F.project('recurring',[valid],settings()).sources[0].table.rows.length,50000);
  valid.table.rows.push([]);assert.throws(()=>F.project('recurring',[valid],settings()),/workflow.limit/);
  const wideSource=source();wideSource.table.headers=Array(301).fill('h');assert.throws(()=>F.project('recurring',[wideSource],settings()));
  for(const value of [undefined,Infinity,NaN,{},()=>{},'x'.repeat(100001)]){const invalid=source();invalid.table.rows=[[value]];assert.throws(()=>F.project('recurring',[invalid],settings()));}
  const longRow=source();longRow.table.rows=[Array(7).fill('v')];assert.throws(()=>F.project('recurring',[longRow],settings()));
  for(const sourceRows of [[],[0],[1.5],['1']]){const invalid=source();invalid.table.sourceRows=sourceRows;assert.throws(()=>F.project('recurring',[invalid],settings()));}
});
test('Project supports null/boolean/empty primitive cells without numeric coercion',()=>{
  const s=source();s.table.rows=[[null,true,false,'',0,-1]];assert.deepEqual(F.project('recurring',[s],settings()).sources[0].table.rows[0],[null,true,false,'',0,-1]);
});
test('Latest month ranges include leap February and year rollover',()=>{
  assert.deepEqual(F.period('month',[{date:Date.UTC(2024,2,15)}]),{from:'2024-03-01',to:'2024-03-31',previousFrom:'2024-02-01',previousTo:'2024-02-29'});
  assert.deepEqual(F.period('month',[{date:Date.UTC(2026,0,31,23,59)}]),{from:'2026-01-01',to:'2026-01-31',previousFrom:'2025-12-01',previousTo:'2025-12-31'});
});
test('Latest week uses Monday-Sunday at year and Sunday boundaries',()=>{
  const expected={from:'2025-12-29',to:'2026-01-04',previousFrom:'2025-12-22',previousTo:'2025-12-28'};
  assert.deepEqual(F.period('week',[{start:Date.UTC(2026,0,1)}]),expected);assert.deepEqual(F.period('week',[{start:Date.UTC(2026,0,4,23,59)}]),expected);
  assert.equal(F.period('week',[{date:Date.UTC(2026,0,5)}]).from,'2026-01-05');
});
test('Period selection finds latest valid date without argument-spread limits',()=>{
  const list=Array.from({length:250000},()=>({date:Date.UTC(2026,0,1)}));list[20]={date:Date.UTC(2026,5,15)};list.push({date:NaN},{start:Infinity},{start:1e30},null);
  assert.equal(F.period('month',list).from,'2026-06-01');assert.throws(()=>F.period('year',list));assert.throws(()=>F.period('week',null));
});
test('Empty period inputs use the current UTC date deterministically',()=>{
  const old=Date.now;Date.now=()=>Date.UTC(2026,9,13);try{assert.equal(F.period('month',[]).from,'2026-10-01');assert.equal(F.period('week',[]).from,'2026-10-12');}finally{Date.now=old;}
});

test('Aggregate limits are checked before wide normalization, including after changing sheets',()=>{
 const source=n=>({table:{rows:Array(n)},mapping:{format:'wide',measurements:Array(5)}});
 assert.deepEqual(F.checkSize([source(40000)],'recurring'),{rows:40000,measurements:200000});
 assert.throws(()=>F.checkSize([source(40001)],'recurring'),/workflow.limit/);
 assert.throws(()=>F.checkSize([source(30000),source(20001)],'batch'),/workflow.limit/);
 assert.throws(()=>F.checkSize(Array.from({length:21},()=>source(1)),'batch'),/workflow.limit/);
});
