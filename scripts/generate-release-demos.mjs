/** Reproducible synthetic beta fixtures. No application calculations are imported.
 * Requires @oai/artifact-tool. See demo-data/README.md for regeneration.
 * REVIEW_OUTPUT is an optional directory for workbook preview PNGs, never published.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook, SpreadsheetFile, FileBlob} from '@oai/artifact-tool';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.resolve(process.env.DEMO_OUTPUT||path.join(ROOT,'demo-data'));
const PROOF=process.env.REVIEW_OUTPUT;
export const SEED=20261015;
let state=SEED;
function random(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
const fixed=n=>Number(n.toFixed(3));
const pad=n=>String(n).padStart(6,'0');
const date=(month,i)=>`2026-${month}-${String(i+1).padStart(2,'0')}`;
const stamp=ms=>new Date(ms).toISOString().slice(0,16).replace('T',' ');
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const rowsToCsv=rows=>'\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const variance=x=>x.reduce((s,v)=>s+(v-mean(x))**2,0)/(x.length-1);
const quantile=(x,p)=>{const a=[...x].sort((a,b)=>a-b),h=(a.length-1)*p,k=Math.floor(h);return a[k]+(h-k)*(a[Math.min(k+1,a.length-1)]-a[k]);};
const percentiles=x=>Object.fromEntries([25,50,75,90,95].map(p=>['p'+p,quantile(x,p/100)]));
const data=[],catalog=[];
const sheet=(rows,opts={})=>({name:'Data',rows,headerRow:1,...opts});
function add(id,kind,name,sheets,purpose,testIds,expectedRef,extra={}){
 const file=`${kind}/${id}/${name}`;
 data.push({id,kind,file,sheets,...extra});
 catalog.push({demoId:id,variant:kind==='A-experience'?'A':'B',path:file,purpose,rowCount:sheets.reduce((n,s)=>n+s.rows.length-s.headerRow,0),sheetCount:sheets.length,relatedTool:{D01:'capability',D02:'recurring',D03:'clean',D04:'cycle',D05:'batch',D06:'pareto',D07:'rci'}[id],testIds,expectedRef});
}
const headers=['Date','Product','Lot','Equipment','Viscosity','Volatile Matter'];
const qaRows=p=>[headers,...Array.from({length:40},(_,i)=>[date('09',Math.floor(i/2)),p,pad(123+i),'DEMO-R1',fixed((p==='DEMO-A'?100:180)+(random()-.5)*6),fixed(.03+random()*.015)])];
add('D01','A-experience','D01A_inspection.xlsx',[sheet(qaRows('DEMO-A'),{name:'Product_A',formats:{'C2:C41':'@'}}),sheet(qaRows('DEMO-B'),{name:'Product_B',formats:{'C2:C41':'@'}})],'Separate product sheets, two inspection items, same-date lots; all records fictional.',['T01','T03'],'expected/D01.json#/experience');
const known=[['Date','Product','Lot','Value'],...Array.from({length:5},(_,i)=>[date('09',i),'DEMO-KNOWN',pad(123+i),i+1])];
for(const ext of ['csv','xlsx'])add('D01','B-known-answer',`D01B_known_1_to_5.${ext}`,[sheet(known,{formats:{'C2:C6':'@'}})],'Hand-checkable values 1..5. LSL=0, USL=6, Individuals/MR. N=5 is not adequate process qualification.',['T02'],'expected/D01.json#/known');
add('D01','B-known-answer','D01B_mixed_conditions.csv',[sheet([['Date','Product','Lot','Value','Unit','Test Method'],['2026-09-01','DEMO-A','000123',100,'mPa.s','Method A'],['2026-09-02','DEMO-A','000124',101,'mPa.s','Method B'],['2026-09-03','DEMO-B','000125',.1,'Pa.s','Method A']])],'Condition-boundary check; do not pool different products, methods or units.',['T04'],'expected/D01.json#/mixed');

const longHeader=['Date','Product','Lot','Equipment','Inspection Item','Measurement','Unit','LSL','USL'];
function monthRows(month){const out=[longHeader];for(const product of ['DEMO-A','DEMO-B'])for(let i=0;i<30;i++)for(const [item,unit,lsl,usl] of [['Viscosity','mPa.s',90,115],['Volatile Matter','%',0,.1]]){
 const base=item==='Viscosity'?(product==='DEMO-A'?100:105):.03;
 const drift=month==='10'&&product==='DEMO-A'?(item==='Viscosity'?4:.01):0;
 const spread=(month==='10'&&product==='DEMO-A'?1.8:1)*(item==='Viscosity'?3:.006);
 out.push([date(month,i),product,`${month}-${pad(i+1)}`,'DEMO-R1',item,fixed(base+drift+(random()-.5)*spread),unit,lsl,usl]);
}return out;}
for(const month of ['09','10'])add('D02','A-experience',`D02A_2026-${month}.csv`,[sheet(monthRows(month))],'Monthly inspection records: two products and two items; same layout in both periods.',['T05','T07'],'expected/D02.json#/experience');
for(const [month,values] of [['09',[1,2,3,4,5]],['10',[3,5,7,9,11]]])add('D02','B-known-answer',`D02B_2026-${month}.xlsx`,[sheet([longHeader,...values.map((v,i)=>[date(month,i),'DEMO-KNOWN',`${month}-${pad(i+1)}`,'DEMO-R1','Value',v,'unit',0,12])])],'Two periods with independently known means and sample standard deviations.',['T06'],'expected/D02.json#/known');

const messy=[['SYNTHETIC / 架空の検査日報'],[],['記録日: 2026-09 / 元表の意味を変えずに整形する'],[],['Identifiers','','Laboratory','','Notes'],['Date','Lot','Measurement','Unit','Note'],['2026-09-01','000123',100,'mPa.s','Normal'],['01/02/2026','000124','<0.01','mPa.s','Date order ambiguous'],[],['2026-09-03','000125','ND','mPa.s','Not detected'],['2026-09-04','000126',0,'mPa.s','Numeric zero'],['2026-09-05','000127','0','mPa.s','Text zero'],['2026-09-06','000128',null,'mPa.s','Not measured']];
add('D03','A-experience','D03A_messy_log.xlsx',[sheet(messy,{name:'Inspection',headerRow:6,merges:['A1:E1','A3:E3','A5:B5','C5:D5'],formats:{'B7:B13':'@'},widths:[23,20,24,18,36]}),sheet([['Lot','Sample','Value'],['000901','A',10],[null,'B',11],['000902','A',12],[null,'B',13]],{name:'Merged_cells_review',merges:['A2:A3','A4:A5'],formats:{'A2:A5':'@'}})],'Title and blank rows, a two-level heading, merged cells, ambiguous date, missing and censored values.',['T08','T09'],'expected/D03.json#/experience');
const preserve=[['Lot','Value','Date','Note'],['000123',0,'2026-09-01','Numeric zero'],['000124','0','2026-09-02','Text zero'],['000125',null,'2026-09-03','Blank'],['000126','<0.01','01/02/2026','Do not infer date or value'],['000127','ND','2026-09-05','Not detected'],['000128','Pass','2026-09-06','Qualitative']];
add('D03','B-known-answer','D03B_preserve_values.xlsx',[sheet(preserve,{formats:{'A2:A7':'@','B3':'@'},widths:[20,20,23,34]})],'Typed zeros, blank, identifiers and qualified results must survive export without inferred values.',['T10'],'expected/D03.json#/preservation');
add('D03','B-known-answer','D03B_cached_formula.xlsx',[sheet([['Lot','Gross mass','Tare mass','Net mass'],['000123',120,20,null],['000124',125,21,null]],{formats:{'A2:A3':'@'},formulas:[{cell:'D2',formula:'=B2-C2',expected:100},{cell:'D3',formula:'=B3-C3',expected:104}]})],'Read stored formula results; the app does not recalculate formulas.',['T11'],'expected/D03.json#/formula');

const cycleHeaders=['Product','Lot','Start Time','End Time','Equipment'];
let clock=Date.UTC(2026,7,1,8);const cy=[cycleHeaders];
for(let i=0;i<40;i++){const product=i%8<4?'DEMO-P1':'DEMO-P2',hours=i===18?144:12+(i%7)*6,end=clock+hours*3600000;cy.push([product,pad(1000+i),stamp(clock),stamp(end),'DEMO-LINE1']);clock=end+(i%5===0?24:2+i%4)*3600000;}
add('D04','A-experience','D04A_production_log.xlsx',[sheet(cy,{formats:{'B2:B41':'@'},widths:[22,20,25,25,22]})],'Forty chronological lots, two products, campaigns and genuine long cycles (12–144 hours).',['T12'],'expected/D04.json#/experience');
const durations=[10,11,12,13,14,15,16,17,18,60];
const cycleKnown=[cycleHeaders,...durations.map((m,i)=>{const start=Date.UTC(2026,8,i+1,9);return ['DEMO-KNOWN',pad(123+i),stamp(start),stamp(start+m*60000),'DEMO-LINE1'];})];
add('D04','B-known-answer','D04B_minutes.csv',[sheet(cycleKnown)],'Start→End minutes 10..18,60; all valid durations stay included. Cycle UI supports P25/P50.',['T13'],'expected/D04.json#/known');
add('D04','B-known-answer','D04B_midnight.csv',[sheet([cycleHeaders,['DEMO-MIDNIGHT','000123','2026-09-01 23:50','2026-09-02 00:10','DEMO-LINE1']])],'One valid midnight interval of20 minutes; product percentiles suppressed for N<5.',['T14'],'expected/D04.json#/midnight');
add('D04','B-known-answer','D04B_invalid_dates.csv',[sheet([cycleHeaders,['DEMO-BAD','000123','2026-09-01 23:50','2026-09-01 00:10','DEMO-LINE1'],['DEMO-BAD','000124','2026-02-30 08:00','2026-02-30 09:00','DEMO-LINE1'],['DEMO-BAD','000125','01/02/2026 08:00','01/02/2026 09:00','DEMO-LINE1']])],'Separate invalid cases; never automatically add a day or infer day/month order.',['T15'],'expected/D04.json#/invalid');

const bh=['Batch ID','Product','Equipment','Process Step','Start Time','End Time','Delay Category','Delay Reason','Target Time','Loss Type'];
const batches=[bh];
for(let i=0;i<8;i++){const start=Date.UTC(2026,8,i+1,22),b=pad(2000+i);const event=(equipment,step,from,to,category,reason,target,loss)=>batches.push([b,'DEMO-RESIN',equipment,step,stamp(start+from*60000),stamp(start+to*60000),category,reason,target,loss]);event('DEMO-R1','Charge',0,30,'','',30,'');event('DEMO-R1','Reaction',30,180+i*10,'','',150,'');event('DEMO-QA','Inspection',60,100,'','',40,'');event('DEMO-R1','Wait release',180+i*10,200+i*10,'Approval','Recorded QA hold',0,'waiting');event('DEMO-PACK','Packing',210+i*10,250+i*10,'','',40,'');}
add('D05','A-experience','D05A_batch_events.xlsx',[sheet(batches,{formats:{'A2:A41':'@'},widths:[19,22,20,22,25,25,22,25,19,20]})],'Eight batches with midnight, parallel inspection, explicit waiting and an unclassified10-minute gap.',['T16','T19'],'expected/D05.json#/experience');
add('D05','B-known-answer','D05B_parallel.csv',[sheet([bh,['000123','DEMO-PARALLEL','DEMO-A','Step A','2026-09-01 09:00','2026-09-01 09:20','','',20,''],['000123','DEMO-PARALLEL','DEMO-B','Step B','2026-09-01 09:10','2026-09-01 09:30','','',20,'']])],'Two parallel20-minute steps; sum40, union30 and elapsed30 minutes.',['T17'],'expected/D05.json#/parallel');
add('D05','B-known-answer','D05B_percentiles_iqr.csv',[sheet([bh,...durations.map((m,i)=>{const start=Date.UTC(2026,8,i+1,9);return [pad(123+i),'DEMO-KNOWN','DEMO-LINE1','Process',stamp(start),stamp(start+m*60000),'','',15,''];})])],'Same durations asD04B. Existing Batch IQR comparison must preserve source events and physical totals.',['T18'],'expected/D05.json#/percentiles');
add('D05','B-known-answer','D05B_incomplete.csv',[sheet([bh,['000123','DEMO-INCOMPLETE','DEMO-A','Step A','2026-09-01 09:00','2026-09-01 09:20','','',20,''],['000123','DEMO-INCOMPLETE','DEMO-A','Step A','2026-09-01 09:00','2026-09-01 09:20','','',20,''],['000124','DEMO-INCOMPLETE','DEMO-A','Step A','2026-09-02 09:00','','','',20,'']])],'Exact duplicate events and missing End Time; full-batch elapsed must not look complete.',['T20'],'expected/D05.json#/incomplete');

const counts=[['Scratch',40],['Bubble',30],['Color',20],['Other',10]];
add('D06','A-experience','D06A_defect_events.csv',[sheet([['Defect Type','Count','Event ID'],...counts.flatMap(([c,n])=>Array.from({length:n},(_,i)=>[c,1,`${c}-${pad(i+1)}`]))])],'One row per incident, Count=1; use Count as quantity, not Event ID.',['T21'],'expected/D06.json');
add('D06','B-known-answer','D06B_counts.xlsx',[sheet([['Defect Type','Count'],...counts])],'Four categories total100. Cumulative40,70,90,100%.',['T22'],'expected/D06.json');
add('D06','B-known-answer','D06B_all_zero.csv',[sheet([['Defect Type','Count'],...counts.map(([c])=>[c,0])])],'Separate all-zero boundary: no meaningful cumulative percentage.',['T23'],'expected/D06.json#/zero');

const rci={format:'manufacturing-toolbox-rci',version:2,project:{isDemo:true,title:'【架空】温度センサー交換後の粘度上昇',when:'2026-09-14T10:30',where:'DEMO-R1',impact:'架空の2ロットを確認待ちとした。実際の事故・製品ではない。',immediate:'対象ロットを保留し、温度記録と交換記録を確認する。',sourceEvidence:'事実：交換後の検査記録で粘度上昇を観測。因果関係は未確認。',rootCause:'未確定。校正記録と比較試験を確認する。',whys:[{cause:'検査値が上昇した',evidence:'架空の検査記録で確認済み',status:'confirmed'},{cause:'センサー補正値の未設定の可能性',evidence:'校正記録は未入手',status:'unknown'}],causeTree:[{parent:-1,cause:'設備条件の影響',evidence:'交換作業の記録あり',status:'unknown'},{parent:0,cause:'補正値の設定漏れの仮説',evidence:'未検証',status:'unknown'}],timeline:[{time:'2026-09-14T08:00',event:'架空のセンサー交換を完了'},{time:'2026-09-14T10:30',event:'粘度上昇を観測'}],actions:[{action:'校正記録を入手し補正値を照合',owner:'架空 保全担当',due:'2026-09-20',status:'open'},{action:'同一条件の比較試験を計画',owner:'架空 品質担当',due:'2026-09-25',status:'open'}]}};
add('D07','A-experience','D07A_investigation.rci',[], 'Facts, hypotheses, unknowns and proposed actions are kept separate.',['T24'],'expected/D07.json',{content:rci});
add('D07','B-known-answer','D07B_timeline.csv',[sheet([['Event time','Description'],['2026-09-14 11:00','校正記録を依頼'],['2026-09-14 12:00','確認待ち, 承認前']])],'Import two timeline entries after the nativeRCI project; preserve the comma in the event text.',['T25'],'expected/D07.json#/timeline');

const knownS=Math.sqrt(2.5),within=1/1.128;
const expected={
 D01:{known:{input:[1,2,3,4,5],n:5,mean:3,median:3,sampleVariance:2.5,sampleSd:knownS,populationVariance:2,populationSd:Math.sqrt(2),lsl:0,usl:6,mrbar:1,withinSigma:within,cp:1.128,cpk:1.128,pp:1/knownS,ppk:1/knownS,individualsUcl:3+3*within,individualsLcl:3-3*within,mrUcl:1+3*.8525/1.128,mrLcl:0,oosCount:0,oosRatePercent:0,warning:'N=5 is a numerical fixture, not a qualified capability study; any SPC signal remains visible.'},experience:{sheets:['Product_A','Product_B'],rowsPerSheet:40,items:['Viscosity','Volatile Matter'],firstLot:'000123',select:'Product_A / Viscosity / LSL95 USL110 / mPa.s'},mixed:{expected:'Different products, units and methods must not be silently pooled. A warning/block or separately selected homogeneous data is required.'}},
 D02:{known:{previous:{values:[1,2,3,4,5],n:5,mean:3,sampleSd:Math.sqrt(2.5)},current:{values:[3,5,7,9,11],n:5,mean:7,sampleSd:Math.sqrt(10)},meanDelta:4,sdDelta:Math.sqrt(10)-Math.sqrt(2.5),currentPeriod:['2026-10-01','2026-10-31'],previousPeriod:['2026-09-01','2026-09-30'],warning:'N=5 in each period: reference values. SPC limits are recalculated per period; not a causal comparison.'},experience:{rowsPerFile:120,products:2,items:2,groupsPerPeriod:4,nPerGroup:30,expected:'DEMO-A mean and spread change by design; DEMO-B is generated from the same distribution, not identical values.'}},
 D03:{experience:{headerRow:6,sheets:['Inspection','Merged_cells_review'],dataRowsIncludingBlank:7,measuredRows:6,blankExcelRow:9,ambiguousDate:'01/02/2026',expected:'Inspect Original/Cleaned, explicitly choose row6. Do not infer a date convention or fill merged Lot cells. Empty rows may be preserved in exported table; no measurements may be invented.'},preservation:{rows:6,lots:['000123','000124','000125','000126','000127','000128'],values:[0,'0',null,'<0.01','ND','Pass'],types:['number','string','blank','string','string','string'],ambiguousDate:'01/02/2026',expected:'Preserve values and types in XLSX with unchanged types. CSV has no cell type metadata; import identifier columns as text in Excel.'},formula:{rows:2,storedResults:[100,104],expected:'App exports stored results as values. Changing upstream cells without recalculating/saving in Excel cannot update cached results in the app.'}},
 D04:{known:{inputMinutes:durations,n:10,...percentiles(durations),cycleStartToNextStartMinutes:1440,cycleN:9,status:'reference',default:'include all valid data;60 is not an input error'},midnight:{start:'2026-09-01 23:50',end:'2026-09-02 00:10',processingMinutes:20,n:1,p25:null,p50:null},invalid:{rows:3,validProcessingRows:0,expected:'End before Start, nonexistent date and ambiguous date format are invalid; no overnight correction.'},experience:{rows:40,products:2,maxProcessingHours:144,minProcessingHours:12,expected:'For Start→End all40 rows valid. One final record has no following batch, so at most39 Start→nextStart intervals.'}},
 D05:{parallel:{rows:2,stepTotalMinutes:40,activeUnionMinutes:30,elapsedMinutes:30,gapMinutes:0,overlapMinutes:10,batch:'000123',nBatches:1},percentiles:{inputMinutes:durations,all:{n:10,...percentiles(durations)},iqr:{q1:12.25,q3:16.75,iqr:4.5,lowerFence:5.5,upperFence:23.5,candidateMinutes:[60],filteredN:9,...percentiles(durations.slice(0,9))},physicalElapsedTotalMinutes:durations.reduce((a,b)=>a+b,0),expected:'IQR changes statistical comparison only; raw records, elapsed, timeline and losses retain60 minutes.'},incomplete:{rows:3,batches:2,duplicateRows:2,missingEndRows:1,completeBatches:0},experience:{rows:40,batches:8,firstBatch:{stepTotalMinutes:280,activeUnionMinutes:240,elapsedMinutes:250,gapMinutes:10,overlapMinutes:40},waitingMinutesPerBatch:20,expected:'Recorded waiting is identified from Loss Type. Ten-minute gaps have no inferred cause.'}},
 D06:{categories:['Scratch','Bubble','Color','Other'],counts:[40,30,20,10],total:100,cumulativePercent:[40,70,90,100],zero:{total:0,expected:'No meaningful percent or cumulative percent. A warning/empty percentage is required, never100% orNaN.'}},
 D07:{expected:'Whys:1 confirmed and1 unknown; cause tree2 unknown; no automatically confirmed root cause;2 open actions;2 initial timeline events.',timeline:{addedRows:2,totalRows:4,lastEvent:'確認待ち, 承認前'}}
};
const methods={schemaVersion:1,seed:SEED,synthetic:true,source:'Fixed inputs requested by the owner; arithmetic in this standalone generator, no imports from application calculation modules.',definitions:{mean:'sum(x)/n',sampleVariance:'sum((x-mean)^2)/(n-1)',populationVariance:'sum((x-mean)^2)/n',quantile:'R7: h=(n-1)p; linear interpolation between sorted[floor(h)] and sorted[ceil(h)]',iqr:'Q3-Q1; candidate outside Q1-1.5IQR or Q3+1.5IQR; no automatic deletion',withinXmR:'mean adjacent moving range / d2; d2=1.128, d3=.8525',capability:'Cp=(USL-LSL)/(6*withinSigma); Cpk=min((USL-mean),(mean-LSL))/(3*withinSigma); Pp/Ppk use sampleSd',oos:'outside strict specification limits / all valid numeric measurements; limits themselves are in specification',time:'Wall-clock ISO date-times with one consistent basis. Minute=(end-start)/60000. No timezone inference.',parallel:'Sum of durations differs from union of intervals and firstStart-to-lastEnd elapsed.'},tolerances:{numericAbsolute:1e-10,reason:'Fixed small inputs and double-precision arithmetic; UI formatting is compared separately at its shown precision.',identifiers:'exact',counts:'exact',timestamps:'exact millisecond',ocr:'No numerical tolerance for OCR transcription: compare source text exactly and correct before confirming.'},sources:[{title:'Owner-provided hand-checkable examples',reference:'Request sections8 and7; preserved in expected files.'},{title:'R quantile documentation, type7 definition',url:'https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html'},{title:'NIST Individuals Control Charts, MRbar/d2',url:'https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm'}]};
const tests=[
 ['T01','Process Capability','検査日報からレポートまで','A-experience/D01/D01A_inspection.xlsx','Product_A40件。粘度・ロット順を選択。Excel/PDFを開ける'],
 ['T02','Process Capability','既知値とXmR','B-known-answer/D01/D01B_known_1_to_5.xlsx','N5 Mean3 SD1.581139 Cp/Cpk1.128 Pp/Ppk0.632456'],
 ['T03','Process Capability','日本語/Englishと表示範囲','A-experience/D01/D01A_inspection.xlsx','言語・拡大・期間ズームで元の集計値/ロット順を変えない'],
 ['T04','Process Capability','製品・単位・方法の混在','B-known-answer/D01/D01B_mixed_conditions.csv','異条件を無警告で合算しない'],
 ['T05','Recurring Quality','二か月の品質レビュー','A-experience/D02/D02A_2026-09.csv + D02A_2026-10.csv','期間ごと4層・各N30。条件別のままレポート'],
 ['T06','Recurring Quality','小さい既知の期間比較','B-known-answer/D02/D02B_2026-09.xlsx + D02B_2026-10.xlsx','平均3→7 標本SD1.581139→3.162278 参考値'],
 ['T07','Recurring Quality','Preset・作業の退避/復元','A-experience/D02/','設定再利用と.mtb再開。上書き前に退避'],
 ['T08','Clean & Export','現場帳票の見出し確認','A-experience/D03/D03A_messy_log.xlsx','Inspection見出し6行。値を補完せずExcel/CSV出力'],
 ['T09','Clean & Export','結合セル・曖昧な日付','A-experience/D03/D03A_messy_log.xlsx','Merged_cells_reviewの空欄を補完しない。日付変換は停止'],
 ['T10','Clean & Export','文字列・先頭ゼロ・欠損保全','B-known-answer/D03/D03B_preserve_values.xlsx','6行。000123、<0.01、ND、Pass、空欄とゼロを保持'],
 ['T11','Clean & Export','数式の保存済み結果','B-known-answer/D03/D03B_cached_formula.xlsx','正味重量100,104。再計算なし/値出力'],
 ['T12','Cycle Time','通常と6日サイクル','A-experience/D04/D04A_production_log.xlsx','40加工時間。144hを通常の有効値として含める'],
 ['T13','Cycle Time','既知P25/P50・指標切替','B-known-answer/D04/D04B_minutes.csv','Start→End N10 P25 12.25 P50 14.5分;Start→nextStart N9 P25/P50 1440分'],
 ['T14','Cycle Time','日跨ぎ・少数データ','B-known-answer/D04/D04B_midnight.csv','個別加工時間20分。N1のP25/P50非表示'],
 ['T15','Cycle Time','不正日時を分離','B-known-answer/D04/D04B_invalid_dates.csv','3行とも加工時間対象外。翌日補正なし'],
 ['T16','Batch Process','並列・待機・日跨ぎ','A-experience/D05/D05A_batch_events.xlsx','8バッチ、40工程記録。明示待機と未記録区間を区別'],
 ['T17','Batch Process','小さい並列既知値','B-known-answer/D05/D05B_parallel.csv','工程合計40分/記録時間30分/経過30分'],
 ['T18','Batch Process','R7/IQR比較','B-known-answer/D05/D05B_percentiles_iqr.csv','P50/75/90/95 14.5/16.75/22.2/41.1→14/16/17.2/17.6;原記録保持'],
 ['T19','Batch Process','パレート引継ぎと出力','A-experience/D05/D05A_batch_events.xlsx','時間ロスの分類と単位を保ち、パレートからレポート'],
 ['T20','Batch Process','重複・終了欠落','B-known-answer/D05/D05B_incomplete.csv','2バッチとも不完全。全体経過時間を確定しない'],
 ['T21','Pareto Analysis','100件の明細を集計','A-experience/D06/D06A_defect_events.csv','件数40/30/20/10 累積40/70/90/100%'],
 ['T22','Pareto Analysis','集計済み既知値','B-known-answer/D06/D06B_counts.xlsx','T21と同じ結果。出力4分類/総数100'],
 ['T23','Pareto Analysis','全件ゼロ','B-known-answer/D06/D06B_all_zero.csv','総数0。比率を有効な百分率と表示しない'],
 ['T24','RCI','調査保存・復元・レポート','A-experience/D07/D07A_investigation.rci','確認済みWhy1・未確認1・未着手対策2。保存復元で保持'],
 ['T25','RCI','時系列CSV追加','B-known-answer/D07/D07B_timeline.csv','既存2+追加2=4件。引用符/カンマ保持'],
 ['T26','Document Intelligence','テンプレート設定用原本','A-experience/D08/','Aster3行(text)/Aoba2行(scan)。未確認のまま取り込む'],
 ['T27','Document Intelligence','未使用の検証用原本','B-known-answer/D08/','Aster5行(text)/Aoba4行(scan)。同じテンプレートを使う'],
 ['T28','Document Intelligence','確認前後・退避復元','B-known-answer/D08/','未確認の値は解析対象外。原本照合後に明示確認。バックアップを開ける'],
 ['T29','Common','Feedback往復・任意入力','A-experience/D01/D01A_inspection.xlsx','データ/ファイル名の自動転送なし。未設定時は送信を装わない'],
 ['T30','Common','サンプル・再読込・安全な退避','A-experience/D02/','保存済み設定と退避ファイルを保持。戻る/再読込前に注意を読む']
];
await fs.mkdir(OUT,{recursive:true});if(PROOF)await fs.mkdir(PROOF,{recursive:true});
await fs.mkdir(path.join(OUT,'expected'),{recursive:true});
for(const [id,v]of Object.entries(expected))await fs.writeFile(path.join(OUT,'expected',id+'.json'),JSON.stringify(v,null,2)+'\n');
await fs.writeFile(path.join(OUT,'expected','definitions.json'),JSON.stringify(methods,null,2)+'\n');
const checklistHeader=['Test ID','Version or Commit','Tool','Scenario','Demo File','Expected','Status','Actual','Time to Result','Time to Export','Usability 1–5','Confusing Step','Issue','Next Action'];
data.push({id:'CHECKLIST',file:'Manual_Test_Checklist.xlsx',sheets:[sheet([checklistHeader,...tests.map(t=>[t[0],'v0.8.1-beta.1 / record tested commit',...t.slice(1),'Not Tested','','','','','','',''])],{name:'Manual Tests',widths:[13,34,25,36,58,76,18,48,19,19,18,42,48,42],checklist:true})]});
const proofs=[];
for(const d of data){
 const dest=path.join(OUT,d.file);await fs.mkdir(path.dirname(dest),{recursive:true});
 if(d.content){await fs.writeFile(dest,JSON.stringify(d.content,null,2)+'\n');continue;}
 const wb=Workbook.create();
 for(const spec of d.sheets){const sh=wb.worksheets.add(spec.name),w=Math.max(...spec.rows.map(r=>r.length)),h=spec.rows.length;const matrix=spec.rows.map(r=>Array.from({length:w},(_,i)=>r[i]??null));
  // Text identifiers, dates and deliberate text zeros retain their original cell types.
  for(let r=0;r<h;r++)for(let c=0;c<w;c++)if(typeof matrix[r][c]==='string')sh.getRange(`${col(c)}${r+1}`).setNumberFormat('@');
  sh.getRange(`A1:${col(w-1)}${h}`).values=matrix;sh.showGridLines=false;
  const all=sh.getRange(`A1:${col(w-1)}${h}`);all.format.font={name:'Arial',size:11,color:'#182E40'};all.format.rowHeight=24;all.format.verticalAlignment='center';
  for(let c=0;c<w;c++)sh.getRange(`${col(c)}1:${col(c)}${h}`).format.columnWidth=spec.widths?.[c]||(/date|time/i.test(String(spec.rows[spec.headerRow-1]?.[c]||''))?25:22);
  sh.getRange(`A${spec.headerRow}:${col(w-1)}${spec.headerRow}`).format={fill:'#2B4660',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},rowHeight:38,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
  for(const merge of spec.merges||[])sh.mergeCells(merge);
  for(const [range,fmt]of Object.entries(spec.formats||{}))sh.getRange(range).setNumberFormat(fmt);
  for(const f of spec.formulas||[])sh.getRange(f.cell).formulas=[[f.formula]];
  if(h>20)sh.freezePanes.freezeRows(spec.headerRow);
  if(spec.checklist){sh.freezePanes.freezeColumns(1);sh.getRange(`G2:G${h}`).dataValidation={rule:{type:'list',values:['Not Tested','Pass','Fail','Blocked','Not Applicable']}};sh.getRange(`G2:N${h}`).format.fill='#FFF4D1';sh.getRange(`D2:F${h}`).format.wrapText=true;sh.getRange(`A2:N${h}`).format.rowHeight=64;sh.getRange(`G2:G${h}`).conditionalFormats.add('containsText',{text:'Fail',format:{fill:'#FBE2DF',font:{color:'#8C241B',bold:true}}});}
 }
 wb.recalculate();
 if(d.file.endsWith('.csv'))await fs.writeFile(dest,rowsToCsv(d.sheets[0].rows));
 else {
  if(PROOF)for(let i=0;i<d.sheets.length;i++){const s=d.sheets[i],w=Math.max(...s.rows.map(r=>r.length));const range=`A1:${col(Math.min(w,d.id==='CHECKLIST'?7:w)-1)}${Math.min(s.rows.length,d.id==='CHECKLIST'?7:Math.max(10,s.headerRow+7))}`;const img=await wb.render({sheetName:s.name,range,scale:1.2,format:'png'});const p=`${d.id}-${path.basename(d.file)}-${i}.png`;await fs.writeFile(path.join(PROOF,p),new Uint8Array(await img.arrayBuffer()));proofs.push(p);}
  const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:2000});
  if(PROOF)await fs.writeFile(path.join(PROOF,path.basename(d.file)+'.inspection.json'),scan.ndjson);
  await (await SpreadsheetFile.exportXlsx(wb)).save(dest);
  // Reopen with a separate workbook instance; assert values and source types.
  const reread=await SpreadsheetFile.importXlsx(await FileBlob.load(dest));
  await fs.rm(dest+'.inspect.ndjson',{force:true});
  for(const s of d.sheets){const sh=reread.worksheets.getItem(s.name),w=Math.max(...s.rows.map(r=>r.length)),got=sh.getRange(`A1:${col(w-1)}${s.rows.length}`).values;
   for(let r=0;r<s.rows.length;r++)for(let c=0;c<s.rows[r].length;c++){const want=s.rows[r][c];if(want===null||want===undefined||want==='')continue;if(got[r][c]!==want)throw Error(`XLSX re-read mismatch: ${d.file}/${s.name}/${r+1},${c+1} expected${JSON.stringify(want)} got${JSON.stringify(got[r][c])}`);}
   for(const f of s.formulas||[]){if(sh.getRange(f.cell).values[0][0]!==f.expected)throw Error('Formula cached result mismatch '+d.file+'/'+f.cell);}
  }
 }
 console.log('created',d.file);
}
for(const supplier of ['aster','aoba'])for(const heldout of [false,true])catalog.push({demoId:'D08',variant:heldout?'B':'A',path:`${heldout?'B-known-answer':'A-experience'}/D08/D08${heldout?'B':'A'}_${supplier}_${supplier==='aster'?'text':'scan'}.pdf`,purpose:heldout?'Held-out document; do not change template from this file before first evaluation.':'Template setup and learning file. All companies and values are fictional.',pageCount:1,measurementRows:supplier==='aster'?(heldout?5:3):(heldout?4:2),textLayer:supplier==='aster',relatedTool:'documents',testIds:heldout?['T27','T28']:['T26'],expectedRef:'expected/D08.json'});
await fs.writeFile(path.join(OUT,'catalog.json'),JSON.stringify({schemaVersion:1,seed:SEED,synthetic:true,release:'v0.8.1-beta.1',files:catalog},null,2)+'\n');
await fs.writeFile(path.join(OUT,'manual-tests.json'),JSON.stringify(tests.map(t=>({id:t[0],tool:t[1],scenario:t[2],file:t[3],expected:t[4],status:'Not Tested'})),null,2)+'\n');
await fs.writeFile(path.join(OUT,'Feedback_Tracking_Template.csv'),rowsToCsv([['ID','種類 / Type','困った業務 / Task','頻度 / Frequency','回避策 / Workaround','影響 / Impact','対応方針 / Next action','Status','Owner'],['','','','','','','','New','']]));
if(PROOF)await fs.writeFile(path.join(PROOF,'workbook-proof-index.json'),JSON.stringify({seed:SEED,xlsxFiles:data.filter(d=>d.file.endsWith('.xlsx')).length,previews:proofs,checks:'Exported XLSX reopened; source values/types and formula caches checked. Owner manual status remains Not Tested.'},null,2));
console.log('complete',data.length,'input/checklist files; expected files are independent of application modules');
