const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../dist/recurring-core.js'),C=require('../dist/core.js'),I=require('../dist/import-core.js'),X=require('../dist/vendor/xlsx.full.min.js');
const headers=['Date','Product','Lot','Equipment','Inspection Item','Measurement','Unit','LSL','USL'];
const mapping={format:'long',date:0,product:1,lot:2,equipment:3,item:4,value:5,unit:6,lsl:7,usl:8};
const rows=(values,patch={})=>values.map((v,i)=>Object.assign(['2026-10-01','A',`L${i+1}`,'E1','Viscosity',v,'mPa·s',0,10],patch));
const source=(values,patch={})=>({id:'s1',name:'quality.xlsx',sheet:'Inspection',table:{headers,rows:rows(values)},mapping,...patch});
const run=(values,s={})=>Q.analyze(Q.normalize([source(values)]).records,s);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const codes=xs=>xs.map(x=>x.code);

test('定例品質: hand calculation N, mean, sample s, MRbar/d2 and capability are distinct',()=>{
  const g=run([1,2,3,4,5]).groups[0],s=g.stats;
  assert.equal(s.n,5);assert.equal(s.mean,3);assert.equal(s.median,3);assert.equal(s.min,1);assert.equal(s.max,5);
  close(s.sd,Math.sqrt(2.5));close(s.within,1/1.128);close(s.cp,1.88);close(s.cpk,1.128);close(s.pp,10/(6*Math.sqrt(2.5)));close(s.ppk,1/Math.sqrt(2.5));
  assert.equal(s.oosCount,0);assert.equal(s.oosRate,0);assert.equal(g.status,'attention');assert.ok(codes(g.reasons).includes('smallSampleReference'));
});
test('定例品質: heterogeneous Excel and CSV, wide and long, preserve original tables and provenance',()=>{
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['品質試験','',''],['ロット','粘度','Na'],['0001',101,2],['0002',103,4]]),'data');
  const bytes=X.write(wb,{bookType:'xlsx',type:'buffer'}),back=X.read(bytes,{type:'buffer',cellNF:true,cellDates:false}),raw=I.sheetRows(X,back.Sheets.data),detection=C.detectHeader(raw),table=C.table(raw.slice(detection.headerRow-1),true);
  table.sourceHeaderRow=detection.headerRow;table.sourceRows=[3,4];
  const wide={id:'excel',name:'wide.xlsx',sheet:'data',table,mapping:{format:'wide',lot:0,measurements:[{column:1,name:'Viscosity',unit:'mPa·s',lsl:90,usl:110},{column:2,name:'Sodium',unit:'ppm'}]}};
  const long={id:'csv',name:'data.csv',table:C.table(C.csv('Product,Measurement,Item,Unit\nA,105,Viscosity,mPa·s')),mapping:{format:'long',product:0,value:1,item:2,unit:3}};
  const before=JSON.stringify([wide,long]),n=Q.normalize([wide,long]);
  assert.equal(n.records.length,5);assert.equal(n.issues.length,0);assert.equal(JSON.stringify([wide,long]),before);
  assert.equal(n.records[0].lot,'0001');assert.equal(n.records[0].row,3);assert.equal(n.records[0].file,'wide.xlsx');assert.equal(n.records[0].sheet,'data');assert.equal(n.records[0].sourceId,'excel');assert.equal(n.records[1].item,'Sodium');assert.equal(n.records[4].row,2);
});
test('定例品質: multiple Excel files combine matching products and inspection items only',()=>{
  const a=source([1,2,3]),b=source([4,5],{id:'s2',name:'next.xlsx'});b.table.rows.forEach((r,i)=>r[2]=`L${4+i}`);
  const n=Q.normalize([a,b]),r=Q.analyze(n.records);assert.equal(r.groups.length,1);assert.equal(r.groups[0].stats.n,5);assert.equal(r.groups[0].stats.mean,3);assert.equal(new Set(r.groups[0].selectedRecords.map(x=>x.id)).size,5);
});
test('定例品質: units, specification revisions, equipment and time bases never pool',()=>{
  const a=source([1,2,3,4,5,6]);Object.assign(a.table.rows[1],{6:'Pa·s'});Object.assign(a.table.rows[2],{8:20});Object.assign(a.table.rows[3],{3:'E2'});Object.assign(a.table.rows[4],{0:'2026-10-01T00:00Z'});Object.assign(a.table.rows[5],{0:'bad'});
  const r=Q.analyze(Q.normalize([a]).records);assert.equal(r.groups.length,6);assert.ok(codes(r.issues).includes('separateUnits'));assert.ok(codes(r.issues).includes('separateSpecifications'));assert.ok(codes(r.issues).includes('separateClocks'));
  assert.equal(r.groups.reduce((n,g)=>n+g.stats.n,0),6);
});
test('定例品質: multiple products/items and categorical filters are exact, not substring matches',()=>{
  const a=source([1,2,3,4]);a.table.rows[1][1]='AA';a.table.rows[2][4]='Sodium';a.table.rows[3][3]='E2';const n=Q.normalize([a]);
  assert.equal(Q.analyze(n.records).groups.length,4);
  const r=Q.analyze(n.records,{product:'A',item:'Viscosity',equipment:'E1',lot:'L1'});assert.equal(r.groups.length,1);assert.equal(r.groups[0].stats.n,1);assert.equal(r.audit.filter(x=>x.currentStatus==='filtered').length,3);
});
test('定例品質: natural lot order takes priority over dates, with stable duplicate-lot order',()=>{
  const a=source([10,2,1,11]);a.table.rows.forEach((r,i)=>{r[2]=['L10','L2','L1','L10'][i];r[0]=`2026-10-0${i+1}`;});
  const g=Q.analyze(Q.normalize([a]).records,{minSamples:2}).groups[0];assert.deepEqual(g.selectedRecords.map(r=>r.value),[1,2,10,11]);assert.equal(g.order,'lot');close(g.result.mr,10/3);
});
test('定例品質: missing/non-numeric values remain as gaps in moving ranges and audit',()=>{
  const a=source([1,'',5,'invalid',9,10]);const n=Q.normalize([a]),g=Q.analyze(n.records,{minSamples:2}).groups[0];
  assert.equal(g.stats.n,4);assert.equal(g.selectedRecords.length,6);assert.equal(g.excluded.length,2);assert.deepEqual(g.result.rangeRecords,[{index:5,value:1}]);close(g.stats.within,1/1.128);
  assert.deepEqual(codes(n.issues),['missingMeasurement','invalidMeasurement']);assert.equal(g.excluded[1].record.row,5);
});
test('定例品質: n=0 and n=1 retain useful descriptors without fabricated SD or capability',()=>{
  const zero=run(['','bad']).groups[0],one=run([7]).groups[0];assert.equal(zero.stats.n,0);assert.equal(zero.stats.mean,null);assert.equal(zero.stats.oosRate,null);
  assert.equal(one.stats.n,1);assert.equal(one.stats.mean,7);assert.equal(one.stats.median,7);assert.equal(one.stats.min,7);assert.equal(one.stats.max,7);assert.equal(one.stats.sd,null);assert.equal(one.stats.cpk,null);assert.equal(one.status,'unavailable');
});
test('定例品質: configured minimum sample size suppresses every capability index',()=>{
  const g=run([1,2,3,4]).groups[0];for(const key of ['cp','cpk','pp','ppk']){assert.equal(g.stats[key],null);assert.equal(g.result[key],null);}assert.equal(g.stats.sd,Math.sqrt(5/3));assert.ok(codes(g.reasons).includes('insufficientSamples'));
  assert.notEqual(run([1,2,3,4],{minSamples:4}).groups[0].stats.cpk,null);
});
test('定例品質: missing specs are unevaluated OOS, one-sided limits retain only one-sided indices',()=>{
  for(const patch of [{7:'',8:''},{7:'',8:4},{7:2,8:''}]){const a=source([1,2,3,4,5]);a.table.rows.forEach(r=>Object.assign(r,patch));const g=Q.analyze(Q.normalize([a]).records).groups[0];assert.equal(g.stats.cp,null);assert.equal(g.stats.pp,null);
    if(patch[7]===''&&patch[8]===''){assert.equal(g.stats.oosCount,null);assert.equal(g.stats.oosRate,null);assert.equal(g.stats.cpk,null);}else{assert.equal(g.stats.oosCount,1);assert.equal(g.stats.oosRate,20);assert.notEqual(g.stats.cpk,null);assert.notEqual(g.stats.ppk,null);}}
});
test('定例品質: specification text errors and reversed limits do not become missing limits',()=>{
  const a=source([1,2,3,4,5,6]);a.table.rows.forEach((r,i)=>{r[7]=i<3?'unknown':10;r[8]=i<3?10:0;});const n=Q.normalize([a]),r=Q.analyze(n.records,{minSamples:2});assert.equal(r.groups.length,2);assert.equal(n.issues.length,6);
  for(const g of r.groups){assert.equal(g.specInvalid,true);assert.equal(g.stats.oosCount,null);assert.equal(g.stats.cpk,null);assert.equal(g.status,'unavailable');assert.equal(g.stats.mean!==null,true);}
});
test('定例品質: constants do not display Infinity; overall/within unavailability is explained',()=>{
  const g=run([3,3,3,3,3]).groups[0];assert.equal(g.stats.sd,0);for(const k of ['cp','cpk','pp','ppk'])assert.equal(g.stats[k],null);assert.ok(codes(g.reasons).includes('zeroWithinVariation'));assert.ok(codes(g.reasons).includes('zeroOverallVariation'));
});
test('定例品質: Xbar-R requires rational subgroup confirmation; then shared SPC estimates apply',()=>{
  const a=run([1,2,4,5],{chart:'xbar',subgroupSize:2,minSamples:2}),b=run([1,2,4,5],{chart:'xbar',subgroupSize:2,minSamples:2,rationalSubgroups:true});
  assert.equal(a.groups[0].result,null);assert.equal(a.groups[0].stats.mean,3);assert.equal(a.groups[0].stats.cpk,null);assert.ok(codes(a.groups[0].reasons).includes('rationalSubgroupsRequired'));
  assert.equal(b.groups[0].result.chart,'xbar');close(b.groups[0].stats.within,1/1.128);assert.equal(b.groups[0].stats.n,4);
});
test('定例品質: Xbar-R invalid and incomplete groups are excluded and traceable',()=>{
  const r=run([1,2,'',4,5,6,7],{chart:'xbar',subgroupSize:2,minSamples:2,rationalSubgroups:true}),g=r.groups[0];assert.equal(g.stats.n,4);assert.equal(g.stats.mean,3.5);assert.equal(g.excluded.length,3);assert.deepEqual(g.excluded.map(x=>x.record.row),[4,5,8]);assert.equal(r.counts.currentExcluded,3);assert.equal(r.counts.currentValid,4);
});
test('定例品質: too few complete subgroups show descriptors and an explicit failure reason',()=>{
  const g=run([1,2,3],{chart:'xbar',subgroupSize:2,minSamples:2,rationalSubgroups:true}).groups[0];assert.equal(g.result,null);assert.equal(g.stats.mean,2);assert.equal(g.stats.cpk,null);assert.ok(codes(g.reasons).includes('insufficientSubgroups'));
});
test('定例品質: current and previous periods independently recalculate stats, end date inclusive',()=>{
  const a=source([1,2,3,4,5,6]);a.table.rows.forEach((r,i)=>r[0]=i<3?'2026-09-30 23:59:59.999':'2026-10-31 23:59:59.999');
  const r=Q.analyze(Q.normalize([a]).records,{from:'2026-10-01',to:'2026-10-31',previousFrom:'2026-09-01',previousTo:'2026-09-30',minSamples:2});
  assert.equal(r.groups[0].stats.mean,5);assert.equal(r.previousGroups[0].stats.mean,2);assert.equal(r.groups[0].stats.n,3);assert.equal(r.comparisons[0].deltas.mean.absolute,3);assert.equal(r.comparisons[0].deltas.mean.relative,150);assert.equal(r.comparisons[0].deltas.n.absolute,0);assert.equal(r.issues.length,0);
});
test('定例品質: explicit zoned timestamps use UTC dates, Excel dates use source wall dates',()=>{
  const a=source([1,2]);a.table.rows[0][0]='2026-10-01 08:59:59+09:00';a.table.rows[1][0]='2026-10-01 09:00:00+09:00';
  const r=Q.analyze(Q.normalize([a]).records,{from:'2026-10-01',to:'2026-10-01'});assert.equal(r.groups[0].stats.n,1);assert.equal(r.groups[0].selectedRecords[0].value,2);assert.equal(r.groups[0].timeKind,'instant');
  const b=source([3],{date1904:true});b.table.rows[0][0]=0;const n=Q.normalize([b]);assert.equal(n.records[0].date,Date.UTC(1904,0,1));assert.equal(n.records[0].timeKind,'wall');
});
test('定例品質: dates invalid/missing are audited, excluded only when period is requested',()=>{
  const a=source([1,2,3]);a.table.rows[0][0]='';a.table.rows[1][0]='2026-02-30';const n=Q.normalize([a]);assert.deepEqual(codes(n.issues),['missingDate','invalidDate']);
  assert.equal(Q.analyze(n.records).counts.current,3);const r=Q.analyze(n.records,{from:'2026-10-01'});assert.equal(r.counts.current,1);assert.equal(r.audit.filter(x=>x.currentStatus==='undated').length,2);assert.ok(codes(r.issues).includes('undatedExcluded'));
});
test('定例品質: changed specs/units have no false previous-period comparison',()=>{
  const a=source([1,2,3,4]);a.table.rows.forEach((r,i)=>{r[0]=i<2?'2026-09-01':'2026-10-01';if(i>=2)r[8]=12;});
  const r=Q.analyze(Q.normalize([a]).records,{from:'2026-10-01',to:'2026-10-31',previousFrom:'2026-09-01',previousTo:'2026-09-30',minSamples:2});assert.equal(r.comparisons.length,0);assert.ok(codes(r.issues).includes('separateSpecifications'));assert.ok(codes(r.issues).includes('noComparablePrevious'));assert.ok(codes(r.issues).includes('noComparableCurrent'));
});
test('定例品質: zero baseline relative change is null, absolute delta remains meaningful',()=>{
  const a=source([-1,1,2,4]);a.table.rows.forEach((r,i)=>r[0]=i<2?'2026-09-01':'2026-10-01');const r=Q.analyze(Q.normalize([a]).records,{from:'2026-10-01',previousFrom:'2026-09-01',previousTo:'2026-09-30',minSamples:2,deltaThreshold:2});
  assert.equal(r.comparisons[0].deltas.mean.absolute,3);assert.equal(r.comparisons[0].deltas.mean.relative,null);assert.ok(codes(r.groups[0].reasons).includes('meanChange'));assert.equal(r.groups[0].attention,true);
});
test('定例品質: explicit thresholds control attention; SPC stability remains an assumption warning',()=>{
  const values=Array.from({length:30},(_,i)=>i===29?100:i%2?2:1),a=run(values,{cpkThreshold:null,attentionOos:false,attentionSpc:false}).groups[0],b=run(values,{cpkThreshold:null,attentionOos:false,attentionSpc:true}).groups[0];
  assert.equal(a.attention,false);assert.equal(a.status,'reference');assert.ok(codes(a.reasons).includes('unstableProcess'));assert.equal(b.attention,true);
});
test('定例品質: missing lot IDs use documented stable source order rather than sorting partial IDs',()=>{
  const a=source([10,2,1]);a.table.rows[1][2]='';const g=Q.analyze(Q.normalize([a]).records,{minSamples:2}).groups[0];assert.equal(g.order,'input');assert.deepEqual(g.selectedRecords.map(x=>x.value),[10,2,1]);assert.ok(codes(g.reasons).includes('partialLotOrder'));
});
test('定例品質: invalid settings and periods return structured errors without crashing',()=>{
  for(const patch of [{from:'2026-02-30'},{from:'2026-10-31',to:'2026-10-01'},{minSamples:1},{chart:'p'},{subgroupSize:20},{rules:[9]},{rules:'1'},{cpkThreshold:-1},{deltaThreshold:NaN},null]){const r=run([1,2,3],patch);assert.equal(r.valid,false);assert.equal(r.groups.length,0);assert.equal(r.issues.length,1);}
});
test('定例品質: overlapping comparison periods are disclosed',()=>assert.ok(codes(run([1,2,3],{from:'2026-10-01',previousFrom:'2026-10-01'}).issues).includes('overlappingPeriods')));
test('定例品質: duplicate/out-of-bounds/missing mappings reject only the affected source',()=>{
  for(const m of [{...mapping,value:-1},{...mapping,date:20},{...mapping,lot:1},{format:'wide',lot:0,measurements:[{column:0,name:'Value'}]},{format:'wide',measurements:[{column:5},{column:5}]}]){const r=Q.normalize([source([1],{mapping:m}),source([2],{id:'good'})]);assert.equal(r.records.length,1);assert.equal(r.issues.length,1);}
});
test('定例品質: original normalized data remains unchanged through filters/statistics/comparison',()=>{
  const records=Q.normalize([source([1,2,3,4,5])]).records;const before=JSON.stringify(records);records.forEach(r=>Object.freeze(r));Object.freeze(records);Q.analyze(records,{from:'2026-10-01',previousFrom:'2026-10-01'});assert.equal(JSON.stringify(records),before);
});

test('Maximum-size malformed input retains all issues without spread-argument overflow',()=>{
 const s=source([]);s.table.rows=Array.from({length:50000},(_,i)=>['invalid-date','A','L'+i,'E1','Viscosity','','mPa·s','bad-limit',10]);
 const n=Q.normalize([s]);assert.equal(n.records.length,50000);assert.equal(n.issues.length,150000);
 const r=Q.analyze(n.records);assert.equal(r.audit.length,50000);assert.equal(r.counts.currentValid,0);assert.equal(r.issues.filter(i=>i.recordId).length,150000);assert.equal(r.groups[0].stats.cpk,null);
});
