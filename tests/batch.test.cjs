const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const B=require('../dist/batch-core.js'),C=require('../dist/core.js'),Y=require('../dist/cycle-core.js'),W=require('../dist/workflow-core.js');
const reference=require('./reference/batch-reference.json');
const headers=['Batch ID','Product','Equipment','Process Step','Start Time','End Time','Delay Category','Delay Reason','Target Time (min)','Loss Type'];
const mapping={batch:0,product:1,equipment:2,step:3,start:4,end:5,category:6,reason:7,target:8,lossType:9};
const source=(rows,patch={})=>({id:'test-source',name:'synthetic.csv',sheet:'Records',date1904:false,table:{headers,rows},mapping,...patch});
const at=minutes=>new Date(Date.UTC(2026,8,1,8)+minutes*60000).toISOString().slice(0,19).replace('T',' ');
const row=(batch,step,start,duration,patch={})=>Object.assign([batch,'SYN-A','E1',step,at(start),at(start+duration),'','',60,''],patch);
const run=(rows,settings={},patch={})=>B.analyze(B.normalize([source(rows,patch)],settings).records,settings);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const codes=issues=>issues.map(x=>x.code);
const fixtureRows=()=>C.csv(fs.readFileSync(path.join(__dirname,'fixtures/batch-workflow.csv'),'utf8')).slice(1);

test('batch: independent inclusive percentile, sample SD, min-N reference cases',()=>{
  for(const example of reference.summaries){const actual=B.summary(example.values,example.minSamples);for(const [key,expected] of Object.entries(example.expected)){if(typeof expected==='number')close(actual[key],expected);else assert.equal(actual[key],expected,example.name+'/'+key);}}
  for(const values of [[NaN],[Infinity],[-1],['3']])assert.throws(()=>B.summary(values));
});
test('batch: independent parallel, nested, touching and cross-midnight interval unions',()=>{
  for(const example of reference.intervals){const actual=B.intervals(example.spans.map(pair=>pair.map(v=>v*60000))),expected=example.expected;for(const [a,b] of [['elapsed','elapsed'],['stepTotal','sumStep'],['active','active'],['gap','gap'],['overlap','overlap']])close(actual[a],expected[b]);assert.deepEqual(actual.merged.map(pair=>pair.map(v=>v/60000)),expected.merged);assert.deepEqual(actual.gaps.map(g=>[g.start/60000,g.end/60000]),expected.gaps);}
  assert.equal(B.intervals([]).elapsed,null);assert.throws(()=>B.intervals([[1,0]]));
});
test('batch: source mapping/provenance, original rows and optional product/equipment',()=>{
  const s=source([row('B1','Heating',0,120)],{table:{headers,rows:[row('B1','Heating',0,120)],sourceHeaderRow:3,sourceRows:[17]}}),before=JSON.stringify(s);
  const n=B.normalize([s]);assert.equal(n.records[0].row,17);assert.equal(n.records[0].file,'synthetic.csv');assert.equal(n.records[0].sheet,'Records');assert.equal(n.records[0].duration,120);assert.equal(JSON.stringify(s),before);
  const optional=B.normalize([source([row('0001','Charging',0,30)],{mapping:{...mapping,product:-1,equipment:-1},table:{headers,rows:[row('0001','Charging',0,30)],sourceHeaderRow:4,sourceHasHeader:false}})]).records[0];
  assert.equal(optional.row,4);assert.equal(optional.product,'');assert.equal(optional.equipment,'');assert.equal(optional.batch,'0001');
});
test('batch: Japanese column hints use shared mapper and arbitrary process names',()=>{
  const table={headers:['バッチ番号','製品','設備','工程','開始','終了','原因区分','理由','目標時間','ロス種別'],rows:[]};
  assert.deepEqual(W.suggest('batch',table),mapping);
  const r=run([row('1','Unconfigured custom step / 任意工程',0,30)]);assert.equal(r.groups[0].step,'Unconfigured custom step / 任意工程');
});
test('batch: invalid mapping/row/source does not prevent valid file from normalizing',()=>{
  const normal=source([row('1','A',0,30)],{id:'valid'});
  for(const bad of [source([row('1','A',0,30)],{mapping:{...mapping,start:4,end:4}}),source([row('1','A',0,30)],{mapping:{...mapping,batch:-1}}),source([row('1','A',0,30)],{mapping:{...mapping,target:90}})]){const n=B.normalize([bad,normal]);assert.equal(n.records.length,1);assert.equal(n.issues.length,1);}
  assert.equal(B.normalize(null).issues[0].code,'invalidSources');assert.equal(B.normalize([source([null])]).issues[0].code,'invalidRow');
});
test('batch: midnight crossing and Excel 1900/1904 timestamps match independent reference',()=>{
  const t=reference.timeCases,normal=row('1','A',0,60);normal[4]=t.crossMidnight[0];normal[5]=t.crossMidnight[1];assert.equal(run([normal]).records[0].duration,180);
  for(const date1904 of [false,true]){const serial=date1904?t.excel1904:t.excel1900,r=B.normalize([source([Object.assign(row('1','A',0,60),{4:serial,5:serial+.125})],{date1904})]).records[0];close(r.start,t.expectedMs);assert.equal(r.duration,180);}
});
test('batch: equivalent explicitly zoned timestamps normalize without local timezone effects',()=>{
  const a=row('1','A',0,60);a[4]='2026-09-01T17:00:00+09:00';a[5]='2026-09-01T10:00:00Z';
  const r=run([a]);assert.equal(r.records[0].clock,'instant');assert.equal(r.records[0].duration,120);assert.equal(r.batches[0].elapsed,120);
});
test('batch: missing invalid reversed zero and mixed-kind timestamps are audited',()=>{
  const cases=[{4:'',code:'missingStart'},{5:'bad',code:'invalidEnd'},{4:'2026-02-30 08:00',code:'invalidStart'},{5:at(-1),code:'nonPositiveDuration'},{5:at(0),code:'nonPositiveDuration'},{5:'2026-09-01T10:00Z',code:'mixedTimeKinds'}];
  for(const c of cases){const data=Object.assign(row('1','A',0,60),c);delete data.code;const r=run([data]);assert.equal(r.records[0].duration,null);assert.ok(codes(r.issues).includes(c.code));assert.equal(r.batches[0].complete,false);assert.equal(r.batches[0].elapsed,null);}
});
test('batch: same batch crosses equipment without splitting full elapsed time',()=>{
  const r=run([row('1','A',0,60),row('1','B',120,60,{2:'E2'})]);assert.equal(r.batches.length,1);assert.deepEqual(r.batches[0].equipmentSet,['E1','E2']);assert.equal(r.batches[0].elapsed,180);assert.equal(r.batches[0].gap,60);assert.equal(r.groups.length,2);
});
test('batch: parallel repeated steps remain valid, do not sum durations as elapsed',()=>{
  const r=run([row('1','Reaction',0,240),row('1','Sampling',60,60),row('1','Sampling',90,60),row('1','Transfer',240,60)]),b=r.batches[0];
  assert.equal(r.invalidRecords.length,0);assert.equal(b.complete,true);assert.equal(b.elapsed,300);assert.equal(b.stepTotal,420);assert.equal(b.active,300);assert.equal(b.overlap,120);assert.equal(b.gap,0);assert.equal(r.groups.find(g=>g.step==='Sampling').all.n,2);
});
test('batch: exact duplicates across sources invalidate every copy with row-level audit',()=>{
  const a=row('1','A',0,60),n=B.normalize([source([a],{id:'one'}),source([a.slice()],{id:'two'})]);assert.equal(n.records.length,2);assert.ok(n.records.every(r=>r.duration===null&&r.errors.includes('duplicateRecord')));
  const r=B.analyze(n.records);assert.equal(r.groups[0].all.n,0);assert.equal(r.batches[0].elapsed,null);assert.equal(r.invalidRecords.length,2);assert.ok(r.audit.every(a=>a.currentStatus==='invalid'));assert.notEqual(n.records[0].id,n.records[1].id);
});
test('batch: an invalid observed row suppresses full elapsed/gap but preserves valid step duration',()=>{
  const r=run([row('1','A',0,60),row('1','B',90,60,{5:''})]),b=r.batches[0];assert.equal(b.complete,false);assert.equal(b.elapsed,null);assert.equal(b.gap,null);assert.equal(b.active,null);assert.equal(b.stepTotal,60);assert.equal(b.observedElapsed,60);assert.equal(r.groups.find(g=>g.step==='A').all.n,1);
});
test('batch: civil and instant rows are separated; a mixed-clock batch has no elapsed',()=>{
  const zoned=row('1','B',120,60,{4:'2026-09-01T10:00Z',5:'2026-09-01T11:00Z'}),r=run([row('1','A',0,60),zoned]);assert.equal(r.batches[0].complete,false);assert.equal(r.batches[0].elapsed,null);assert.equal(r.batches[0].start,null);assert.ok(codes(r.issues).includes('mixedBatchClocks'));
  zoned[0]='2';zoned[3]='A';const separated=run([row('1','A',0,60),zoned]);assert.equal(separated.groups.length,2);assert.ok(codes(separated.issues).includes('separateClocks'));
});
test('batch: cohort period uses full batch start including inclusive end of day',()=>{
  const a=row('early','Charging',0,60,{4:'2026-09-30 23:00',5:'2026-10-01 00:00'}),b=row('early','Reaction',0,60,{4:'2026-10-01 01:00',5:'2026-10-01 02:00'}),c=row('late','Reaction',0,60,{4:'2026-10-01 23:59:59',5:'2026-10-02 00:59:59'});
  const r=run([a,b,c],{from:'2026-10-01',to:'2026-10-01'});assert.equal(r.batches.length,1);assert.equal(r.batches[0].batch,'late');assert.equal(r.audit[1].currentStatus,'outsidePeriod');
});
test('batch: a missing start prevents period attribution instead of inventing a cohort date',()=>{
  const r=run([row('1','A',0,60),row('1','B',120,60,{4:''})],{from:'2026-09-01'});assert.equal(r.records.length,0);assert.equal(r.audit[0].currentStatus,'undated');assert.ok(codes(r.issues).includes('undatedBatches'));
});
test('batch: step/equipment filters mark partial selection while preserving full batch totals',()=>{
  const r=run([row('1','A',0,60),row('1','B',120,90,{2:'E2'})],{step:'B',equipment:'E2'});assert.equal(r.records.length,1);assert.equal(r.batches[0].partial,true);assert.equal(r.batches[0].records.length,2);assert.equal(r.batches[0].selectedRecords.length,1);assert.equal(r.batches[0].elapsed,210);assert.equal(r.batches[0].stepTotal,150);assert.ok(codes(r.issues).includes('partialBatchSelection'));
});
test('batch: exact product/batch filters do not mix matching identifiers in another product',()=>{
  const r=run([row('1','A',0,60),row('1','A',0,90,{1:'SYN-B'}),row('2','A',0,120)],{product:'SYN-A',batch:'1'});assert.equal(r.batches.length,1);assert.equal(r.records.length,1);assert.equal(r.batches[0].elapsed,60);
});
test('batch: IQR inclusive reference and original excluded row provenance',()=>{
  for(const example of reference.iqr){const rows=example.values.map((v,i)=>row(String(i),'A',i*200,v)),r=run(rows,{outlier:'iqr'}),g=r.groups[0];for(const k of ['q1','q3','lower','upper'])close(g.fences[k],example[k]);assert.deepEqual(r.excludedRows.map(x=>x.rowIndex),example.excludedIndices);assert.deepEqual(g.validRecords.filter(x=>!x.outlier).map(x=>x.duration),example.retained);assert.equal(g.stats,g.withoutOutliers);assert.equal(r.records.length,rows.length);assert.ok(r.audit.some(a=>a.currentStatus==='iqrExcluded'));}
});
test('batch: IQR cannot erase physical long-stop timeline, losses or Pareto',()=>{
  const rows=[10,11,12,13,14,100].map((v,i)=>row(String(i),'A',i*200,v,{8:10,9:'downtime'}));
  const all=run(rows,{outlier:'all'}),iqr=run(rows,{outlier:'iqr'});assert.equal(all.groups[0].all.n,6);assert.equal(iqr.groups[0].stats.n,5);assert.equal(iqr.batches.find(b=>b.batch==='5').elapsed,100);assert.equal(iqr.timeLoss.downtime,160);assert.equal(iqr.pareto.result.total,100);assert.equal(iqr.pareto.result.total,all.pareto.result.total);
});
test('batch: below minimum and post-IQR below minimum suppress percentiles, not source observations',()=>{
  const r=run([1,2,3,4,100].map((v,i)=>row(String(i),'A',i*200,v)),{outlier:'iqr'}),g=r.groups[0];assert.equal(g.all.p50,3);assert.equal(g.withoutOutliers.p50,null);assert.equal(g.withoutOutliers.p95,null);assert.equal(g.withoutOutliers.n,4);assert.equal(g.withoutOutliers.status,'insufficient');assert.ok(codes(r.issues).includes('insufficientAfterIqr'));
  const short=run([1,2,100].map((v,i)=>row(String(i),'A',i*200,v)),{outlier:'iqr'});assert.equal(short.groups[0].fences,null);assert.equal(short.excludedRows.length,0);
});
test('batch: explicit targets use configured units; invalid targets do not discard duration',()=>{
  const r=run([row('1','A',0,150,{8:2}),row('2','A',200,100,{8:'bad'}),row('3','A',400,120,{8:''})],{targetUnit:'hour'});
  assert.equal(r.records[0].referenceMinutes,120);assert.equal(r.records[0].excess,30);assert.equal(r.records[1].duration,100);assert.equal(r.records[1].excess,null);assert.equal(r.records[2].excess,null);assert.equal(r.timeLoss.excess,30);assert.equal(r.timeLoss.unreferencedCount,2);assert.ok(codes(r.issues).includes('invalidTarget'));
  const normal=B.normalize([source([row('1','A',0,150,{8:2})])]);assert.equal(B.analyze(normal.records,{targetUnit:'hour'}).records[0].excess,30);
});
test('batch: no targets differs from zero excess; P50 reference requires valid minimum N',()=>{
  const missing=run([row('1','A',0,60,{8:''})]);assert.equal(missing.timeLoss.excess,null);assert.equal(missing.pareto.rows.length,0);
  const zero=run([row('1','A',0,60,{8:60})]);assert.equal(zero.timeLoss.excess,0);assert.equal(zero.pareto.rows[0][1],0);
  const low=run([row('1','A',0,60)],{reference:'p50'});assert.equal(low.records[0].excess,null);assert.ok(codes(low.issues).includes('insufficientReference'));
  const enough=run([10,20,30,40,100].map((v,i)=>row(String(i),'A',i*200,v)),{reference:'p50',outlier:'iqr'});assert.ok(enough.records.every(x=>x.referenceMinutes===30));assert.equal(enough.timeLoss.excess,80);
});
test('batch: explicit waiting/downtime/process delay differ from unclassified gaps and excess',()=>{
  const r=run([row('1','A',0,60,{8:30,9:'Waiting Time'}),row('1','B',120,30,{9:'停止'}),row('1','C',150,30,{9:'Process Delay'}),row('1','D',180,30,{9:'Unknown category'})]);
  assert.equal(r.timeLoss.waiting,60);assert.equal(r.timeLoss.downtime,30);assert.equal(r.timeLoss.processDelay,30);assert.equal(r.timeLoss.gap,60);assert.equal(r.timeLoss.excess,30);assert.equal(r.timeLoss.nonAdditive,true);assert.ok(codes(r.issues).includes('unrecognizedLossType'));assert.equal(r.records[3].duration,30);
});
test('batch: Pareto count/total/excess and category aggregation reuse shared C.pareto',()=>{
  const rows=[row('1','A',0,100,{6:'Recorded cause',8:60}),row('2','A',200,80,{6:'Recorded cause',8:60}),row('3','B',400,30,{6:'Other recorded cause',8:20})];
  for(const [metric,expected] of [['count',3],['total',210],['excess',70]]){const r=run(rows,{paretoMetric:metric,paretoGroup:'category'});assert.equal(r.pareto.result.total,expected);assert.deepEqual(r.pareto.result,C.pareto(r.pareto.rows));assert.equal(r.pareto.result.items[0].label,'Recorded cause');}
  const missing=run([row('1','A',0,100)],{paretoGroup:'category'});assert.equal(missing.pareto.rows.length,0);assert.ok(codes(missing.issues).includes('missingCategory'));
});
test('batch: before/after known means/tails/deltas, no comparison across individual batch IDs',()=>{
  const rows=fixtureRows(),r=run(rows,{from:'2026-10-01',to:'2026-10-05',previousFrom:'2026-09-01',previousTo:'2026-09-05'}),expected=reference.beforeAfter;
  const c=r.comparisons.find(c=>c.kind==='step'&&c.step==='Heating');assert.ok(c);close(c.current.mean,expected.after.mean);close(c.previous.mean,expected.before.mean);for(const [k,v] of Object.entries(expected.deltaAfterMinusBeforeMinutes))close(c.deltas[k].absolute,v);close(c.deltas.mean.relative,-expected.meanReductionPercent);
  const b=r.comparisons.find(c=>c.kind==='batch');assert.ok(b);assert.equal(b.current.n,5);assert.equal(b.previous.n,5);assert.equal(b.current.status,'reference');
});
test('batch: incompatible equipment/recipe/clock do not produce whole-batch comparison',()=>{
  const rows=[row('before','A',0,60),row('before','B',60,60),row('after','A',0,60,{4:'2026-10-01 08:00',5:'2026-10-01 09:00'}),row('after','C',60,60,{4:'2026-10-01 09:00',5:'2026-10-01 10:00'})];
  const settings={from:'2026-10-01',to:'2026-10-01',previousFrom:'2026-09-01',previousTo:'2026-09-01'},r=run(rows,settings);assert.equal(r.comparisons.filter(x=>x.kind==='batch').length,0);assert.ok(r.comparisons.some(x=>x.kind==='step'&&x.step==='A'));assert.ok(codes(r.issues).includes('noComparablePrevious'));
  rows[2][2]='Other equipment';const other=run(rows,settings);assert.equal(other.comparisons.length,0);
});
test('batch: repeated-step recipe multiplicity differs and invalid batch totals not compared as valid',()=>{
  const rows=[row('before','A',0,60),row('before','A',60,60),row('after','A',0,60,{4:'2026-10-01 08:00',5:'2026-10-01 09:00'})],r=run(rows,{from:'2026-10-01',previousFrom:'2026-09-01',previousTo:'2026-09-01'});assert.equal(r.comparisons.filter(x=>x.kind==='batch').length,0);
});
test('batch: overlapping comparison periods disclose warning; zero baseline percent change null',()=>{
  const r=run([row('1','A',0,60)],{from:'2026-09-01',previousFrom:'2026-09-01'});assert.ok(codes(r.issues).includes('overlappingPeriods'));assert.equal(r.comparisons[0].deltas.sd.relative,null);
});
test('batch: full 98-row fixture validates independent elapsed, union, gap and target excess',()=>{
  const r=run(fixtureRows());assert.equal(r.records.length,98);assert.equal(r.invalidRecords.length,5);assert.equal(r.counts.completeBatches,13);assert.equal(r.counts.currentBatches,17);
  for(const expected of reference.fixture.completeReferenceBatches){const b=r.batches.find(b=>b.batch===expected.batch);assert.ok(b.complete);assert.equal(b.records.length,9);for(const [actual,key] of [['elapsed','elapsed'],['stepTotal','sumStep'],['active','active'],['gap','gap'],['overlap','overlap']])close(b[actual],expected[key]);close(b.records.reduce((sum,r)=>sum+(r.excess??0),0),expected.excess);}
  assert.equal(r.groups.find(g=>g.product==='SYN-RESIN-B').all.p95,null);
});
test('batch: invalid settings/input fail safely and preserve original normalized records',()=>{
  const records=B.normalize([source([row('1','A',0,60)])]).records,before=JSON.stringify(records);records.forEach(Object.freeze);Object.freeze(records);
  for(const settings of [null,{minSamples:1},{from:'2026-02-30'},{from:'2026-10-03',to:'2026-10-01'},{outlier:'delete'},{reference:'guess'},{targetUnit:'day'},{paretoMetric:'unknown'}])assert.equal(B.analyze(records,settings).valid,false);
  assert.equal(B.analyze(null).valid,false);assert.equal(B.analyze([{}]).valid,false);B.analyze(records);assert.equal(JSON.stringify(records),before);
});
test('batch: switching display units does not change underlying duration/statistics',()=>{
  const rows=[10,20,30,40,50].map((v,i)=>row(String(i),'A',i*200,v)),a=run(rows,{displayUnit:'minute'}),b=run(rows,{displayUnit:'hour'});assert.deepEqual(a.groups[0].all,b.groups[0].all);assert.deepEqual(a.records.map(r=>r.duration),b.records.map(r=>r.duration));
});
test('batch: previous-period audit applies previous IQR fences independently',()=>{
  const rows=[1,2,3,4,100].map((v,i)=>row('before'+i,'A',i*200,v));
  rows.push(...[60,60,60,60,60].map((v,i)=>row('after'+i,'A',i*200,v,{4:`2026-10-0${i+1} 08:00`,5:`2026-10-0${i+1} 09:00`})));
  const r=run(rows,{from:'2026-10-01',to:'2026-10-31',previousFrom:'2026-09-01',previousTo:'2026-09-30',outlier:'iqr'});
  assert.equal(r.excludedRows.length,0);assert.equal(r.audit.find(x=>x.record.batch==='before4').previousStatus,'iqrExcluded');assert.equal(r.audit.find(x=>x.record.batch==='before4').currentStatus,'outsidePeriod');assert.equal(r.comparisons.find(x=>x.kind==='step').previous.p95,null);
});
test('batch: overflowing target conversion is unavailable without corrupting valid duration',()=>{
  const r=run([row('1','A',0,60,{8:1e308})],{targetUnit:'hour'});assert.equal(r.records[0].duration,60);assert.equal(r.records[0].target,null);assert.equal(r.records[0].excess,null);assert.ok(codes(r.issues).includes('invalidTarget'));
});
test('batch: 30,000 malformed rows remain auditable without spread-argument stack overflow',()=>{
  const n=B.normalize([source(Array.from({length:30000},()=>[]))]),r=B.analyze(n.records);assert.equal(r.valid,true);assert.equal(r.counts.records,30000);assert.equal(r.invalidRecords.length,30000);assert.equal(r.counts.completeBatches,0);assert.ok(r.issues.length>=150000);
});
