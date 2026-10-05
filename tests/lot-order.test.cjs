const {test}=require('node:test'),assert=require('node:assert/strict');
const I=require('../dist/import-core.js'),V=require('../dist/chart-view-core.js'),S=require('../dist/spc-core.js');
test('Lot hints reuse importer matching and exclude columns already assigned',()=>{
  assert.equal(I.lotColumn(['Value','ロット番号','Date']),1);
  assert.equal(I.lotColumn(['Value','Batch No.']),1);
  assert.equal(I.lotColumn(['Value','Date']),-1);
  assert.equal(I.lotColumn(['Value','Lot'],[1]),-1);
  assert.equal(I.lotColumn(['Lot count','Value','Batch No.'],[0,1]),2);
});
test('Natural lot comparison preserves zeros and stable ties without numeric precision loss',()=>{
  const lots=['LOT-10','LOT-2','LOT-01','LOT-1','LOT-100000000000000000001','LOT-100000000000000000000'];
  const sorted=lots.map((lot,index)=>({lot,index})).sort((a,b)=>I.compareLots(a.lot,b.lot)||a.index-b.index);
  assert.deepEqual(sorted.map(x=>x.lot),['LOT-01','LOT-1','LOT-2','LOT-10','LOT-100000000000000000000','LOT-100000000000000000001']);
  assert.equal(I.compareLots('ＬＯＴ－２','LOT-2'),0);
  assert.equal(lots[0],'LOT-10');
});
test('Legacy mappings/presets gain lot column and migrate former automatic date order',()=>{
  const settings={lsl:'0',usl:'10',unit:'',chart:'imr',subgroupSize:2,rules:[1],productValue:'',order:'date'};
  const entry={tool:'capability',headers:['Date','Value','Lot'],mapping:{value:1,date:0,product:-1}};
  const pref=I.validate({version:1,mappings:[entry],presets:[{...entry,name:'old',auto:true,settings}]});
  assert.equal(pref.mappings[0].mapping.lot,2);
  assert.equal(pref.presets[0].settings.order,'lot');
  assert.equal(pref.presets[0].settings.usl,'10');
  const noLot={...entry,headers:['Date','Value','Other']};
  assert.equal(I.validate({version:1,mappings:[],presets:[{...noLot,name:'old',auto:true,settings}]}).presets[0].settings.order,'input');
  const explicit={...entry,mapping:{...entry.mapping,lot:2}};
  assert.equal(I.validate({version:1,mappings:[],presets:[{...explicit,name:'explicit',auto:true,settings}]}).presets[0].settings.order,'date');
});
test('Lot mapping validates distinct columns and supports settings round trips',()=>{
  assert.deepEqual(I.mapping('capability',{value:1,date:0,product:-1,lot:2},3),{value:1,date:0,product:-1,lot:2});
  assert.throws(()=>I.mapping('capability',{value:1,date:0,product:-1,lot:1},3));
  assert.equal(I.settings('capability',{lsl:'',usl:'',unit:'',chart:'imr',subgroupSize:2,rules:[1],productValue:'',order:'lot'}).order,'lot');
});
test('Date filtering retains lot order, metadata, gaps, and previously calculated MR',()=>{
  const r=S.analyze([1,8,9,11]);
  r.input=[['L1','2026-09-02'],['L2','2026-09-01'],['L3','2026-09-02'],['L4','2026-09-03']].map(([lot,date],index)=>({lot,time:I.date(date).ms,index}));
  const before=JSON.stringify(r),v=V.windowFor(r,'date',{start:'2026-09-02',end:'2026-09-02'});
  assert.deepEqual(v.first.map(x=>x.lot),['L1','L3']);
  assert.deepEqual(v.first.map(x=>x.index),[0,2]);
  assert.equal(v.ranges[0].value,1);
  assert.equal(v.axis.mode,'index');
  assert.equal(JSON.stringify(r),before);
});
test('Xbar-R labels the final lot while retaining the first lot of the complete subgroup',()=>{
  const r=S.analyze([1,3,5,7],{chart:'xbar',subgroupSize:2});r.input=['001','002','003','004'].map((lot,index)=>({lot,index,time:I.date('2026-09-01').ms}));
  const v=V.windowFor(r,'date');
  assert.deepEqual(v.first.map(x=>[x.startLot,x.lot,x.position]),[['001','002',2],['003','004',4]]);
  assert.deepEqual(v.ranges.map(x=>x.lot),['002','004']);
});
