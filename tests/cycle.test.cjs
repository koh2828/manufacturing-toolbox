const {test}=require('node:test'),assert=require('node:assert/strict');
const Y=require('../dist/cycle-core.js'),C=require('../dist/core.js');
const cols={product:0,lot:1,start:2,end:3,equipment:-1};
const at=h=>`2026-09-01 ${String(h).padStart(2,'0')}:00:00`;
const row=(p,l,s,e)=>[p,l,at(s),at(e)];
test('R7のP25/P50と最低件数境界',()=>{
  assert.equal(Y.percentile([40,10,30,20],.25),17.5);assert.equal(Y.percentile([40,10,30,20],.5),25);
  assert.deepEqual(Y.summary([1,2,3,4],5),{n:4,status:'insufficient',p25:null,p50:null});
  assert.deepEqual(Y.summary([10,20,30,40,50],5),{n:5,status:'reference',p25:20,p50:30});
  assert.equal(Y.summary(Array(19).fill(10),5).status,'reference');assert.equal(Y.summary(Array(20).fill(10),5).status,'available');
});
test('異製品を挟んでも実際の隣接バッチを使用し、最終バッチは加工のみ',()=>{
  const r=Y.analyze([row('A','3',13,14),row('B','2',10,12),row('A','1',8,9),row('A','4',16,17)],cols,{minSamples:2});
  const a=r.groups.find(g=>g.product==='A');assert.equal(a.cycle.n,2);assert.equal(a.cycle.p25,135);assert.equal(a.cycle.p50,150);assert.equal(a.processing.n,3);assert.equal(a.processing.p50,60);
  assert.equal(r.records[2].nextProduct,'B');assert.equal(r.records[2].gap,60);assert.equal(r.records[2].cycle,120);assert.equal(r.records[3].cycle,null);assert.match(r.records[3].cycleReason,/最終/);
});
test('日跨ぎ・日付妥当性・時刻だけの入力・タイムゾーン',()=>{
  const r=Y.analyze([['A','1','2026-09-01 23:00','2026-09-02 02:00'],['A','2','2026-09-02 05:00','2026-09-02 06:00']],cols);
  assert.equal(r.records[0].processing,180);assert.equal(r.records[0].gap,180);assert.equal(r.records[0].cycle,360);
  for(const v of ['23:00','2026-02-30 10:00','2026-13-01 10:00','2026-09-01 25:00','2026-09-01','09/01/2026 10:00',.5])assert.equal(Y.timestamp(v),null);
  assert.equal(Y.timestamp('2026-09-01T09:00:00+09:00').ms,Y.timestamp('2026-09-01T00:00:00Z').ms);
  assert.equal(Y.timestamp('2026/09/01 00:00:00.123').ms%1000,123);
  const mixed=Y.analyze([['A','1','2026-09-01 00:00','2026-09-01T01:00Z']],cols);assert.equal(mixed.processingCount,0);assert.equal(mixed.mixedTimezones,true);
});
test('Excelの1900/1904日付方式で同じ日時・期間になる',()=>{
  const ms=Date.UTC(2026,8,1,8),serial=(ms-Date.UTC(1899,11,30))/86400000;
  assert.equal(Y.timestamp(serial).ms,ms);assert.equal(Y.timestamp(serial-1462,true).ms,ms);
  const r=Y.analyze([['A','1',serial,serial+.125],['A','2',serial+.25,serial+.375]],cols);assert.equal(r.records[0].processing,180);assert.equal(r.records[0].cycle,360);
});
test('設備ごとに時系列を分離する',()=>{
  const r=Y.analyze([row('A','1',8,9).concat('設備1'),row('A','2',10,11).concat('設備1'),row('A','1',8,10).concat('設備2'),row('A','2',12,14).concat('設備2')],{...cols,equipment:4});
  assert.equal(r.overlapRows,0);assert.equal(r.groups.length,2);assert.equal(r.cycleCount,2);assert.deepEqual(r.records.filter(x=>x.cycle!==null).map(x=>x.cycle),[120,240]);
});
test('不備バッチを削除して前後を接続しない',()=>{
  const r=Y.analyze([row('A','1',8,9),['A','2',at(10),'bad'],row('A','3',12,13)],cols);
  assert.equal(r.processingCount,2);assert.equal(r.cycleCount,0);assert.equal(r.invalidRows,1);assert.equal(r.records[0].nextLot,'2');
  const missing=Y.analyze([row('A','1',8,9),['A','2','bad',at(11)],row('A','3',12,13)],cols);assert.equal(missing.blockedLines,1);assert.equal(missing.cycleCount,0);
});
test('入れ子の時間重複を検出し、加工時間は残す',()=>{
  const r=Y.analyze([row('A','1',8,20),row('B','2',9,10),row('C','3',11,12),row('A','4',21,22),row('A','5',23,24).map((v,i)=>i===3?'2026-09-02 00:00':v)],cols);
  assert.equal(r.overlapRows,3);assert.equal(r.processingCount,5);assert.equal(r.cycleCount,1);assert.equal(r.records[3].cycle,120);
});
test('重複・逆転・ゼロ時間は除外し、長い空き時間は保持する',()=>{
  const rows=[row('A','1',8,9),row('A','1',8,9),row('A','2',10,10),row('A','3',13,12),['B','4','2026-09-01 15:00','2026-09-01 16:00'],['B','5','2026-09-04 15:00','2026-09-04 16:00']];
  const r=Y.analyze(rows,cols);assert.equal(r.invalidRows,4);assert.equal(r.records[4].gap,71*60);assert.equal(r.records[4].cycle,72*60);
  assert.throws(()=>Y.analyze(rows,{...cols,end:2}));assert.throws(()=>Y.analyze(rows,cols,{minSamples:1}));
});
test('日時文字列だけの表でも見出しを自動判定',()=>{
  const rows=[['バッチ記録'],[],['製品識別コード','ロット番号','Start time','End time'],['A','LOT-001','2026-09-01T08:00:00','2026-09-01T09:00:00'],['B','LOT-002','2026-09-01T10:00:00','2026-09-01T12:00:00']];
  const d=C.detectHeader(rows);assert.equal(d.headerRow,3);assert.equal(d.hasHeader,true);assert.equal(d.confidence,'high');assert.deepEqual(Y.suggestColumns(rows[2]),cols);
});
