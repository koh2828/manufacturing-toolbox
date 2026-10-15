const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const X=require('../dist/vendor/xlsx.full.min.js'),F=require('../dist/file-reader.js'),I=require('../dist/import-core.js'),C=require('../dist/core.js'),S=require('../dist/spc-core.js'),K=require('../dist/clean-core.js'),Y=require('../dist/cycle-core.js'),Q=require('../dist/recurring-core.js'),B=require('../dist/batch-core.js'),W=require('../dist/workflow-core.js');
const root=path.resolve(__dirname,'../demo-data'),expected=id=>JSON.parse(fs.readFileSync(path.join(root,'expected',id+'.json'),'utf8'));
const tolerance=expected('definitions').tolerances.numericAbsolute;
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${a} != ${b} (absolute tolerance ${tolerance})`);
async function load(relative){const location=path.join(root,relative),bytes=fs.readFileSync(location),before=crypto.createHash('sha256').update(bytes).digest('hex'),input={name:path.basename(location),size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)},data=await F.read(input,X);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(location)).digest('hex'),before,'input file remains unchanged');return data;}
const known=(id,file)=>`B-known-answer/${id}/${file}`;
const source=(data,id)=>({id,name:data.name,sheet:data.sheet,date1904:data.date1904,table:data.table,mapping:W.suggest(id.startsWith('batch')?'batch':'recurring',data.table)});
const batch=async(file,settings={})=>{const d=await load(known('D05',file));return B.analyze(B.normalize([source(d,'batch-fixture')]).records,settings);};

test('release demo D01: actual CSV and XLSX match independent hand values and preserve Lot',async()=>{
  const e=expected('D01').known;
  for(const ext of ['csv','xlsx']){const d=await load(known('D01','D01B_known_1_to_5.'+ext)),r=S.analyze(d.table.rows.map(row=>row[3]),{lsl:e.lsl,usl:e.usl});
    assert.equal(r.n,e.n);assert.equal(d.table.rows[0][2],'000123');assert.equal(r.oos.length,e.oosCount);
    for(const [actual,key] of Object.entries({mean:'mean',median:'median',sd:'sampleSd',within:'withinSigma',mr:'mrbar',cp:'cp',cpk:'cpk',pp:'pp',ppk:'ppk',ucl:'individualsUcl',lcl:'individualsLcl',rangeUcl:'mrUcl',rangeLcl:'mrLcl'}))near(r[actual],e[key]);near(r.sd*r.sd,e.sampleVariance);
  }
  const mixed=await load(known('D01','D01B_mixed_conditions.csv'));assert.ok(I.conditionConflicts(mixed.table.headers,mixed.table.rows).length>0);
});
test('release demo D02: real two-file import compares each period against independent values',async()=>{
  const inputs=await Promise.all(['09','10'].map(month=>load(known('D02',`D02B_2026-${month}.xlsx`)))),e=expected('D02').known;
  const r=Q.analyze(Q.normalize(inputs.map((d,i)=>source(d,'quality-'+i))).records,{from:e.currentPeriod[0],to:e.currentPeriod[1],previousFrom:e.previousPeriod[0],previousTo:e.previousPeriod[1]});
  assert.equal(r.groups.length,1);assert.equal(r.comparisons.length,1);for(const [g,ref] of [[r.groups[0],e.current],[r.previousGroups[0],e.previous]]){assert.equal(g.stats.n,ref.n);near(g.stats.mean,ref.mean);near(g.stats.sd,ref.sampleSd);}
  near(r.comparisons[0].deltas.mean.absolute,e.meanDelta);near(r.comparisons[0].deltas.sd.absolute,e.sdDelta);assert.notEqual(r.groups[0].result.ucl,r.previousGroups[0].result.ucl);
});
test('release demo D03: actual CleanCore export preserves original types, ambiguous dates and censored text',async()=>{
  const d=await load(known('D03','D03B_preserve_values.xlsx')),e=expected('D03').preservation,before=JSON.stringify(d.table);
  const prepared=K.prepare(d.table,[],{format:'xlsx',sourceSheet:d.workbook.Sheets[d.sheet],X});assert.equal(prepared.issues.length,0);
  const bytes=F.safeWrite(X,K.workbook(X,prepared),{bookType:'xlsx',type:'buffer'}),wb=X.read(bytes,{type:'buffer'}),sheet=wb.Sheets.Cleaned,back=I.sheetRows(X,sheet);
  assert.deepEqual(back.slice(1).map(r=>r[0]),e.lots);assert.deepEqual(back.slice(1).map(r=>r[1]),e.values.map(v=>v??''));
  assert.equal(sheet.B2.t,'n');assert.equal(sheet.B3.t,'s');assert.equal(sheet.B3.v,'0');assert.equal(sheet.C5.v,e.ambiguousDate);assert.equal(I.date(sheet.C5.v),null);assert.equal(JSON.stringify(d.table),before);
  const csv=C.csv(K.csv(K.prepare(d.table,[],{format:'csv'})));assert.deepEqual(csv.slice(1).map(r=>r[0]),e.lots);assert.deepEqual(csv.slice(1).map(r=>r[1]),e.values.map(v=>String(v??'')));
});
test('release demo D03: cached formulas export values only, without recalculation or formulas',async()=>{
  const d=await load(known('D03','D03B_cached_formula.xlsx')),e=expected('D03').formula,prepared=K.prepare(d.table,[],{sourceSheet:d.workbook.Sheets[d.sheet],X});
  assert.equal(prepared.changes.formulaValues,2);assert.equal(prepared.issues.length,0);assert.deepEqual(prepared.rows.map(r=>r[3]),e.storedResults);
  const back=X.read(F.safeWrite(X,K.workbook(X,prepared),{bookType:'xlsx',type:'buffer'}),{type:'buffer'});assert.equal(back.Sheets.Cleaned.D2.f,undefined);assert.equal(back.Sheets.Cleaned.D2.v,100);assert.equal(back.Sheets.Cleaned.D3.v,104);
});
test('release demo D04: real files distinguish valid tails, midnight and invalid dates',async()=>{
  const e=expected('D04');
  for(const [filename,ref] of [['D04B_minutes.csv',e.known],['D04B_midnight.csv',e.midnight],['D04B_invalid_dates.csv',e.invalid]]){
    const d=await load(known('D04',filename)),r=Y.analyze(d.table.rows,Y.suggestColumns(d.table.headers));
    if(filename.includes('invalid')){assert.equal(r.processingCount,ref.validProcessingRows);assert.equal(r.invalidRows,ref.rows);}
    else if(filename.includes('midnight')){assert.equal(r.records[0].processing,ref.processingMinutes);assert.equal(r.groups[0].processing.p50,null);}
    else{assert.deepEqual(r.records.map(r=>r.processing),ref.inputMinutes);assert.equal(r.processingCount,ref.n);near(r.groups[0].processing.p25,ref.p25);near(r.groups[0].processing.p50,ref.p50);assert.equal(r.cycleCount,ref.cycleN);assert.ok(r.records.filter(r=>r.cycle!==null).every(r=>r.cycle===ref.cycleStartToNextStartMinutes));}
  }
});
test('release demo D05: independent parallel union and IQR values match actual files',async()=>{
  const e=expected('D05'),parallel=await batch('D05B_parallel.csv'),b=parallel.batches[0];assert.equal(b.batch,e.parallel.batch);
  for(const [actual,key] of Object.entries({stepTotal:'stepTotalMinutes',active:'activeUnionMinutes',elapsed:'elapsedMinutes',gap:'gapMinutes',overlap:'overlapMinutes'}))near(b[actual],e.parallel[key]);
  const all=await batch('D05B_percentiles_iqr.csv'),iqr=await batch('D05B_percentiles_iqr.csv',{outlier:'iqr'}),g=iqr.groups[0];
  assert.equal(all.groups[0].stats.n,10);assert.equal(g.stats.n,9);for(const metric of ['p50','p75','p90','p95']){near(all.groups[0].stats[metric],e.percentiles.all[metric]);near(g.stats[metric],e.percentiles.iqr[metric]);}
  near(g.fences.lower,e.percentiles.iqr.lowerFence);near(g.fences.upper,e.percentiles.iqr.upperFence);assert.deepEqual(iqr.excludedRows.map(r=>r.duration),e.percentiles.iqr.candidateMinutes);
  near(iqr.batches.reduce((n,b)=>n+b.elapsed,0),e.percentiles.physicalElapsedTotalMinutes);assert.equal(iqr.records.length,10);
  const invalid=await batch('D05B_incomplete.csv');assert.equal(invalid.batches.length,e.incomplete.batches);assert.equal(invalid.counts.completeBatches,0);
});
test('release demo D06: actual aggregated and event-level inputs match independent Pareto',async()=>{
  const e=expected('D06');for(const file of [known('D06','D06B_counts.xlsx'),'A-experience/D06/D06A_defect_events.csv']){const d=await load(file),r=C.pareto(d.table.rows);assert.equal(r.total,e.total);assert.deepEqual(r.items.map(r=>r.value),e.counts);assert.deepEqual(r.items.map(r=>r.cumulative),e.cumulativePercent);}
  const zero=await load(known('D06','D06B_all_zero.csv')),r=C.pareto(zero.table.rows);assert.equal(r.total,0);assert.ok(r.items.every(i=>i.percent===0&&i.cumulative===0));
});
test('release demo D07 and manual checklist: native RCI is valid, owner results remain Not Tested',()=>{
  const rci=JSON.parse(fs.readFileSync(path.join(root,'A-experience/D07/D07A_investigation.rci'),'utf8'));assert.ok(C.validateRCI(rci).title);
  const wb=X.read(fs.readFileSync(path.join(root,'Manual_Test_Checklist.xlsx')),{type:'buffer'}),sheet=wb.Sheets[wb.SheetNames[0]],rows=I.sheetRows(X,sheet),status=rows[0].indexOf('Status');assert.ok(status>=0);assert.ok(rows.length>10);assert.ok(rows.slice(1).every(row=>row[status]==='Not Tested'));
});
