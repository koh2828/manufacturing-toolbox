const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js'),I=require('../dist/import-core.js'),Y=require('../dist/cycle-core.js'),Q=require('../dist/recurring-core.js'),W=require('../dist/workflow-core.js'),I18n=require('../dist/i18n.js');
const headers=['Date','Product','Lot','Equipment','Inspection Item','Measurement','Unit','LSL','USL','Test Method'];
const mapping={format:'long',date:0,product:1,lot:2,equipment:3,item:4,value:5,unit:6,lsl:7,usl:8};
const source=(values,methods,extra={})=>({id:'fixture',name:'synthetic.csv',sheet:'Data',table:{headers,rows:values.map((v,i)=>['2026-09-01','SYN-A',String(i+1).padStart(6,'0'),'E1','Viscosity',v,'mPa·s',0,10,methods[i]])},mapping,...extra});
const analyze=sources=>Q.analyze(Q.normalize(sources).records,{minSamples:2});

test('release: recognizable condition columns block pooling; blank and known conditions differ',()=>{
  const rows=[['A','Viscosity',1,'ppm','M-01'],['A','Viscosity',2,'mg/L','M-01'],['A','Viscosity',3,'','M-02'],[]],before=JSON.stringify(rows);
  const conflicts=I.conditionConflicts(['Product','Item','Value','Unit','Test Method'],rows);
  assert.deepEqual(conflicts.map(c=>[c.kind,c.column,c.distinctCount,c.hasMissing]),[['unit',3,3,true],['method',4,2,false]]);
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(I.conditionConflicts(['Viscosity (mPa·s)','Sodium (ppm)'],[[100,1],[101,2]]),[]);
  assert.deepEqual(I.conditionConflicts(['製品','試験方法'],[['A','M1'],['B','M2']],{kinds:['method']}),[{kind:'method',column:1,header:'試験方法',distinctCount:2,hasMissing:false}]);
  assert.equal(I.conditionConflicts(['Product'],[['A'],['B']],{ignoreColumns:[0]}).length,0);
});
test('release: recurring quality never calculates a pooled mean across ignored test methods',()=>{
  const input=source([1,2,100,101],['M1','M1','M2','M2']),before=JSON.stringify(input),r=analyze([input]),g=r.groups[0];
  assert.equal(g.blocked,true);assert.equal(g.stats.mean,null);assert.equal(g.stats.cpk,null);assert.equal(g.result,null);
  assert.equal(g.stats.n,0);assert.equal(g.excluded.length,4);assert.equal(r.counts.currentValid,0);assert.equal(r.counts.currentExcluded,4);
  assert.ok(g.reasons.some(r=>r.code==='mixedTestMethods'));assert.ok(r.audit.every(r=>r.currentStatus==='mixedTestMethods'));
  assert.equal(JSON.stringify(input),before);
});
test('release: same method and independent product groups remain usable; repeated values retained',()=>{
  const same=analyze([source([2,2,2,2,2],Array(5).fill('M1'))]);assert.equal(same.groups[0].stats.n,5);assert.equal(same.groups[0].stats.mean,2);assert.equal(same.groups[0].stats.cpk,null);
  const input=source([1,2,10,11],['M1','M1','M2','M2']);input.table.rows[2][1]='SYN-B';input.table.rows[3][1]='SYN-B';
  const r=analyze([input]);assert.equal(r.groups.length,2);assert.deepEqual(r.groups.map(g=>g.stats.mean),[1.5,10.5]);
});
test('release: omitted methods in another file are unknown, not assumed equivalent',()=>{
  const a=source([1,2],['M1','M1']),b=source([3,4],['',''],{id:'other'});b.table.headers=b.table.headers.slice(0,-1);b.table.rows=b.table.rows.map(r=>r.slice(0,-1));
  const r=analyze([a,b]);assert.equal(r.groups[0].stats.mean,null);assert.equal(r.groups[0].excluded.length,4);
});
test('release: explicitly unmapped units/products/items cannot silently pool different conditions',()=>{
  for(const [kind,column,other] of [['unit',6,'Pa·s'],['product',1,'SYN-B'],['item',4,'Sodium']]){
    const input=source([1,2,9,10],Array(4).fill('M1'));input.mapping={...mapping,[kind]:-1};input.table.rows[2][column]=other;input.table.rows[3][column]=other;
    const r=analyze([input]);assert.equal(r.groups.length,1);assert.equal(r.groups[0].stats.mean,null);assert.equal(r.counts.currentValid,0);assert.ok(r.groups[0].reasons.some(i=>i.code==='mixedUnmappedConditions'));
  }
});
test('release: an excluded blank measurement does not introduce an artificial method conflict',()=>{
  const input=source([1,2,'',9,10],['M1','M1','','M1','M1']),r=analyze([input]);
  assert.equal(r.groups[0].stats.n,4);assert.equal(r.groups[0].stats.mean,5.5);assert.equal(r.groups[0].result.mr,1);assert.equal(r.groups[0].excluded.length,1);
});
test('release: method changes between periods cannot become a claimed improvement',()=>{
  const input=source([10,12,1,2],['M1','M1','M2','M2']);input.table.rows[2][0]='2026-10-01';input.table.rows[3][0]='2026-10-02';
  const r=Q.analyze(Q.normalize([input]).records,{from:'2026-10-01',to:'2026-10-31',previousFrom:'2026-09-01',previousTo:'2026-09-30',minSamples:2});
  assert.equal(r.groups[0].stats.mean,1.5);assert.equal(r.previousGroups[0].stats.mean,11);assert.equal(r.comparisons.length,0);assert.equal(r.groups[0].comparison,null);
  assert.ok(r.issues.some(i=>i.code==='incomparableTestMethods'));
});
test('release: existing workflow projects preserve method evidence on reload without schema changes',()=>{
  const input=source([1,2,9,10],['M1','M1','M2','M2']),project=W.project('recurring',[input],{}),copy=W.validateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(analyze(copy.sources).groups[0].blocked,true);assert.equal(copy.sources[0].table.rows[0][2],'000001');
});
test('release: ambiguity and censored values remain unparsed independently of UI language',()=>{
  const check=()=>[I.date('01/02/2026'),I.date('02/01/2026'),C.numeric('<0.01'),C.numeric('ND'),C.numeric('Pass'),C.numeric(''),C.numeric('0'),C.numeric(0),Y.timestamp('2026-09-01 23:50').ms];
  I18n.setLanguage('ja');const japanese=check();I18n.setLanguage('en');const english=check();I18n.setLanguage('ja');assert.deepEqual(japanese,english);
  assert.deepEqual(japanese.slice(0,-1),[null,null,null,null,null,null,0,0]);
});
test('release: a valid six-day processing time is retained and reversed dates are never repaired',()=>{
  const r=Y.analyze([['SYN-A','000123','2026-09-01 23:50','2026-09-07 23:50'],['SYN-A','000124','2026-09-08 00:00','2026-09-08 00:20'],['SYN-A','000125','2026-09-09 23:50','2026-09-09 00:10']],{product:0,lot:1,start:2,end:3,equipment:-1},{minSamples:2});
  assert.equal(r.records[0].processing,8640);assert.equal(r.records[0].cycle,8650);assert.equal(r.records[0].gap,10);assert.equal(r.records[0].lot,'000123');
  assert.equal(r.records[1].processing,20);assert.equal(r.records[2].processing,null);assert.ok(r.records[2].errors.length>0);
});
test('release: even-count median avoids overflow when valid repeated inputs are very large',()=>{
  const r=C.analyze([1e308,1e308]);assert.equal(r.mean,1e308);assert.equal(r.median,1e308);assert.equal(r.sd,0);
  assert.equal(C.analyze([Number.MIN_VALUE,Number.MIN_VALUE]).median,Number.MIN_VALUE);
});
