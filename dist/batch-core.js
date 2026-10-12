(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const Y=typeof module!=='undefined'?require('./cycle-core.js'):root.CycleCore;
  const W=typeof module!=='undefined'?require('./workflow-config.js'):root.WorkflowConfig;
  const DAY=86400000,MINUTE=60000;
  const text=v=>String(v??'').trim(),empty=v=>v===null||v===undefined||typeof v==='string'&&!v.trim();
  const issue=(code,params=[],context={})=>({code,params,...context});
  const rowContext=r=>({recordId:r.id,sourceId:r.sourceId,file:r.file,sheet:r.sheet,row:r.row});
  const finite=v=>typeof v==='number'&&Number.isFinite(v);

  /* Public, local-only contract; input tables and normalized records are immutable.
   * normalize([{id,name,sheet,date1904,table,mapping}], {targetUnit}) returns
   * {records,issues}. Dates reuse CycleCore; times are epoch-like milliseconds,
   * durations/targets/excess are always minutes, independent of display language.
   * Row provenance is file/sheet/row (1-based); raw retains the original cells.
   * Invalid rows are auditable. All members of exact duplicate event records are
   * excluded, not silently collapsed. Repeated steps at distinct times are valid.
   * analyze(records, WorkflowConfig settings) returns current/previous step groups,
   * full batches, same-condition comparisons, audit, timeLoss, and shared Pareto.
   * Cohorts use full recorded batch START before equipment/step selection. Batch
   * totals remain full-batch values; partial=true labels a selected subset.
   * IQR affects distribution statistics/comparisons only, never physical elapsed
   * time, timelines, losses or Pareto. Losses can overlap and must not be added.
   * All-data P50 is an explicit statistical reference, never a proven standard.
   * A complete batch means all OBSERVED rows are usable, not that unrecorded
   * steps can be detected. Invalid observed rows suppress full elapsed/gaps.
   */
  function normalize(sources,{targetUnit='minute'}={}){
    const records=[],issues=[];
    if(!Array.isArray(sources))return {records,issues:[issue('invalidSources')]};
    if(!['minute','hour'].includes(targetUnit))return {records,issues:[issue('invalidSettings')]};
    sources.forEach((source,sourceIndex)=>{
      const sourceId=text(source?.id)||String(sourceIndex),file=text(source?.name),sheet=text(source?.sheet),context={sourceId,file,sheet};
      const table=source?.table;let mapping;
      try{if(!table||!Array.isArray(table.headers)||!Array.isArray(table.rows))throw Error();mapping=W.mapping('batch',source.mapping,table.headers.length);}catch{issues.push(issue('invalidMapping',[],context));return;}
      table.rows.forEach((raw,rowIndex)=>{
        if(!Array.isArray(raw)){issues.push(issue('invalidRow',[],{...context,row:rowIndex+1}));return;}
        const cell=key=>mapping[key]>=0?raw[mapping[key]]:'',sourceRow=table.sourceRows?.[rowIndex];
        const row=Number.isInteger(sourceRow)&&sourceRow>0?sourceRow:rowIndex+(table.sourceHeaderRow||1)+(table.sourceHasHeader===false?0:1);
        const a=Y.timestamp(cell('start'),!!(source.date1904??table.date1904)),b=Y.timestamp(cell('end'),!!(source.date1904??table.date1904));
        const targetValue=empty(cell('target'))?null:C.numeric(cell('target')),targetMinutes=targetValue===null?null:targetValue*(targetUnit==='hour'?60:1);
        const targetValid=empty(cell('target'))||targetValue!==null&&targetValue>=0&&finite(targetMinutes);
        const r={id:JSON.stringify([sourceId,sourceIndex,rowIndex]),...context,sourceIndex,rowIndex,row,sourceRow:row,sourceName:file,raw:raw.slice(),
          batch:text(cell('batch')),product:text(cell('product')),equipment:text(cell('equipment')),step:text(cell('step')),
          rawStart:cell('start'),rawEnd:cell('end'),start:a?.ms??null,end:b?.ms??null,clock:a?.kind??b?.kind??null,timeKind:a?.kind??b?.kind??null,
          rawTarget:cell('target'),target:targetValid?targetMinutes:null,targetUnit,
          rawLossType:text(cell('lossType')),lossType:'',category:text(cell('category')),reason:text(cell('reason')),duration:null,errors:[],issues:[]};
        const add=(code,invalid=true)=>{const e=issue(code,[],rowContext(r));r.issues.push(e);issues.push(e);if(invalid)r.errors.push(code);};
        if(!r.batch)add('missingBatch');if(!r.step)add('missingStep');
        if(!a)add(empty(r.rawStart)?'missingStart':'invalidStart');if(!b)add(empty(r.rawEnd)?'missingEnd':'invalidEnd');
        if(a&&b&&a.kind!==b.kind){r.clock=null;r.timeKind=null;add('mixedTimeKinds');}
        if(a&&b&&a.kind===b.kind&&b.ms<=a.ms)add('nonPositiveDuration');
        if(!targetValid)add('invalidTarget',false);
        const loss=r.rawLossType.normalize('NFKC').toLowerCase().replace(/[ _-]/g,'');
        if(['waiting','waitingtime','待機','待機時間','待ち時間'].includes(loss))r.lossType='waiting';
        else if(['downtime','停止','設備停止','停止時間'].includes(loss))r.lossType='downtime';
        else if(['processdelay','delay','工程遅延','遅延'].includes(loss))r.lossType='processDelay';
        else if(loss)add('unrecognizedLossType',false);
        if(!r.errors.length)r.duration=(r.end-r.start)/MINUTE;
        records.push(r);
      });
    });
    // Detect across files as well as within one file; target/category differences
    // do not make identical observed event intervals into two physical events.
    const duplicates=new Map();
    for(const r of records){if(!r.batch||!r.step||!finite(r.start)||!finite(r.end)||!r.clock)continue;const key=JSON.stringify([r.product,r.batch,r.equipment,r.step,r.clock,r.start,r.end]);if(!duplicates.has(key))duplicates.set(key,[]);duplicates.get(key).push(r);}
    for(const list of duplicates.values())if(list.length>1)for(const r of list){const e=issue('duplicateRecord',[list.length],rowContext(r));r.errors.push('duplicateRecord');r.issues.push(e);issues.push(e);r.duration=null;}
    return {records,issues};
  }

  function summary(values,minSamples=5){
    if(!Array.isArray(values)||values.some(v=>!finite(v)||v<0)||!Number.isInteger(minSamples)||minSamples<2||minSamples>1000)throw Error('batch.invalidStatistics');
    const n=values.length,status=n<minSamples?'insufficient':n<20?'reference':'available';
    const d=n>1?C.analyze(values):{mean:n?values[0]:null,median:n?values[0]:null,sd:null,min:n?values[0]:null,max:n?values[0]:null};
    const out={n,status,mean:d.mean,median:d.median,sd:d.sd,min:d.min,max:d.max};
    for(const [key,p] of [['p50',.5],['p75',.75],['p90',.9],['p95',.95]])out[key]=n<minSamples?null:Y.percentile(values,p);
    return out;
  }
  // Sorted interval union; adjacent intervals meet with zero unrecorded gap.
  function intervals(spans){
    if(!Array.isArray(spans)||spans.some(s=>!Array.isArray(s)||s.length!==2||!finite(s[0])||!finite(s[1])||s[1]<=s[0]))throw Error('batch.invalidIntervals');
    if(!spans.length)return {start:null,end:null,elapsed:null,stepTotal:0,active:0,gap:0,overlap:0,merged:[],gaps:[]};
    const sorted=spans.map(s=>s.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),merged=[];
    let stepTotal=0;
    for(const span of sorted){stepTotal+=(span[1]-span[0])/MINUTE;const last=merged.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push(span);}
    const start=merged[0][0],end=merged.at(-1)[1],elapsed=(end-start)/MINUTE,active=merged.reduce((s,[a,b])=>s+(b-a)/MINUTE,0);
    const gaps=merged.slice(1).map((span,i)=>({start:merged[i][1],end:span[0],duration:(span[0]-merged[i][1])/MINUTE}));
    return {start,end,elapsed,stepTotal,active,gap:Math.max(0,elapsed-active),overlap:Math.max(0,stepTotal-active),merged,gaps};
  }
  const groupKey=r=>JSON.stringify([r.product,r.equipment,r.step,r.clock]);
  const batchKey=r=>JSON.stringify([r.product,r.batch]);
  function distribution(records,s,value=r=>r.duration){
    const validRecords=records.filter(r=>finite(value(r))&&value(r)>=0),values=validRecords.map(value),all=summary(values,s.minSamples);
    let fences=null,excludedIds=[],retained=validRecords;
    if(values.length>=s.minSamples){const q1=Y.percentile(values,.25),q3=Y.percentile(values,.75),iqr=q3-q1;fences={q1,q3,iqr,lower:q1-1.5*iqr,upper:q3+1.5*iqr};retained=validRecords.filter(r=>value(r)>=fences.lower&&value(r)<=fences.upper);excludedIds=validRecords.filter(r=>value(r)<fences.lower||value(r)>fences.upper).map(r=>r.id);}
    const withoutOutliers=summary(retained.map(value),s.minSamples);
    return {records,validRecords,all,withoutOutliers,fences,excludedIds,stats:s.outlier==='iqr'?withoutOutliers:all};
  }
  function groupRecords(records,s){
    const map=new Map();for(const r of records){const key=groupKey(r);if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
    return [...map].map(([key,list])=>({key,product:list[0].product,equipment:list[0].equipment,step:list[0].step,clock:list[0].clock,...distribution(list,s)}));
  }
  function makeBatches(records){
    const map=new Map();for(const r of records){const key=r.batch?batchKey(r):JSON.stringify(['missingBatch',r.id]);if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
    return [...map].map(([key,list])=>{
      const valid=list.filter(r=>finite(r.duration)),clocks=new Set(list.map(r=>r.clock).filter(Boolean)),clock=clocks.size===1?[...clocks][0]:null;
      const mixed=clocks.size>1,complete=list.every(r=>finite(r.duration))&&!mixed;
      const observed=clock?intervals(valid.map(r=>[r.start,r.end])):intervals([]),start=clock&&list.every(r=>finite(r.start))?list.reduce((min,r)=>Math.min(min,r.start),Infinity):null;
      const end=clock&&list.every(r=>finite(r.end))?list.reduce((max,r)=>Math.max(max,r.end),-Infinity):null;
      const issues=list.flatMap(r=>r.issues||[]);if(mixed)issues.push(issue('mixedBatchClocks',[],{batchKey:key}));if(!complete)issues.push(issue('incompleteBatch',[],{batchKey:key}));
      const equipmentSet=[...new Set(list.map(r=>r.equipment))].sort(),counts=new Map();for(const r of list){const stepKey=JSON.stringify([r.equipment,r.step]);counts.set(stepKey,(counts.get(stepKey)||0)+1);}
      const stepSignature=JSON.stringify([...counts].sort(([a],[b])=>a.localeCompare(b)));
      return {id:key,key,product:list[0].product,batch:list[0].batch,clock,start,end,records:list,selectedRecords:list,complete,partial:false,issues,equipmentSet,stepSignature,
        elapsed:complete?observed.elapsed:null,stepTotal:valid.reduce((sum,r)=>sum+r.duration,0),active:complete?observed.active:null,gap:complete?observed.gap:null,
        overlap:complete?observed.overlap:null,merged:complete?observed.merged:[],gaps:complete?observed.gaps:[],observedElapsed:observed.elapsed};
    });
  }
  function period(from,to){
    const parse=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?Y.timestamp(v+' 00:00'):null,a=from?parse(from):null,b=to?parse(to):null;
    return {from,to,start:a?.ms??-Infinity,end:b?b.ms+DAY-1:Infinity,active:!!(from||to),valid:(!from||!!a)&&(!to||!!b)&&(!a||!b||a.ms<=b.ms)};
  }
  function batchGroups(batches,s){
    const map=new Map();for(const b of batches){const key=JSON.stringify([b.product,b.equipmentSet,b.clock,b.stepSignature]);if(!map.has(key))map.set(key,[]);map.get(key).push(b);}
    return [...map].map(([key,list])=>({key,product:list[0].product,equipment:list[0].equipmentSet.join(' / '),equipmentSet:list[0].equipmentSet,step:'',clock:list[0].clock,stepSignature:list[0].stepSignature,batches:list,...distribution(list,s,r=>r.elapsed)}));
  }
  function comparison(current,previous,kind){
    const deltas={};
    for(const metric of ['n','mean','median','sd','min','max','p50','p75','p90','p95']){const a=current.stats[metric],b=previous.stats[metric],absolute=finite(a)&&finite(b)?a-b:null;deltas[metric]={absolute,relative:absolute!==null&&b!==0?absolute/Math.abs(b)*100:null};}
    return {kind,key:current.key,product:current.product,equipment:current.equipment,step:current.step,clock:current.clock,current:current.stats,previous:previous.stats,deltas};
  }
  function analyze(input,config={}){
    const result={valid:true,settings:null,conditions:null,records:[],previousRecords:[],issues:[],groups:[],previousGroups:[],batches:[],previousBatches:[],batchGroups:[],previousBatchGroups:[],comparisons:[],audit:[],excludedRows:[],invalidRecords:[],counts:{records:Array.isArray(input)?input.length:0,current:0,previous:0,currentValid:0,currentExcluded:0,currentBatches:0,completeBatches:0,undatedBatches:0},timeLoss:null,pareto:null};
    let s;try{s=W.settings('batch',config);}catch{result.valid=false;result.issues.push(issue('invalidSettings'));return result;}
    if(!Array.isArray(input)||input.some(r=>!r||typeof r!=='object'||!Array.isArray(r.errors)||!Array.isArray(r.issues))){result.valid=false;result.issues.push(issue('invalidRecords'));return result;}
    result.settings=s;const current=period(s.from,s.to),previous=period(s.previousFrom,s.previousTo);
    if(!current.valid||!previous.valid){result.valid=false;result.issues.push(issue('invalidPeriod'));return result;}
    const records=input.map(r=>({...r,errors:r.errors.slice(),issues:r.issues.slice(),excess:null,referenceMinutes:null,outlier:false}));
    // Reinterpret explicit target units from raw input if settings were changed.
    for(const r of records)if(r.rawTarget!==undefined){const target=C.numeric(r.rawTarget),minutes=target===null?null:target*(s.targetUnit==='hour'?60:1);r.target=target!==null&&target>=0&&finite(minutes)?minutes:null;r.targetUnit=s.targetUnit;if(!empty(r.rawTarget)&&r.target===null&&!r.issues.some(i=>i.code==='invalidTarget'))r.issues.push(issue('invalidTarget',[],rowContext(r)));}
    const allBatches=makeBatches(records),matchesBatch=b=>(!s.product||b.product===s.product)&&(!s.batch||b.batch===s.batch),matchesRow=r=>(!s.equipment||r.equipment===s.equipment)&&(!s.step||r.step===s.step);
    const candidates=allBatches.filter(matchesBatch),inPeriod=(b,p)=>!p.active||finite(b.start)&&b.start>=p.start&&b.start<=p.end;
    const select=p=>candidates.filter(b=>inPeriod(b,p)).map(b=>({...b,selectedRecords:b.records.filter(matchesRow),partial:b.records.some(r=>!matchesRow(r))})).filter(b=>b.selectedRecords.length);
    result.batches=select(current);result.previousBatches=previous.active?select(previous):[];
    result.records=result.batches.flatMap(b=>b.selectedRecords);result.previousRecords=result.previousBatches.flatMap(b=>b.selectedRecords);
    result.groups=groupRecords(result.records,s);result.previousGroups=groupRecords(result.previousRecords,s);
    result.batchGroups=batchGroups(result.batches,s);result.previousBatchGroups=batchGroups(result.previousBatches,s);
    for(const g of result.groups){const excluded=new Set(g.excludedIds);for(const r of g.records){r.outlier=excluded.has(r.id);r.groupKey=g.key;if(r.outlier)result.excludedRows.push({...r,lower:g.fences.lower,upper:g.fences.upper});r.referenceMinutes=s.reference==='p50'?g.all.p50:r.target;r.excess=finite(r.duration)&&finite(r.referenceMinutes)?Math.max(0,r.duration-r.referenceMinutes):null;}}
    result.invalidRecords=result.records.filter(r=>!finite(r.duration));
    if(previous.active){
      if(current.start<=previous.end&&previous.start<=current.end)result.issues.push(issue('overlappingPeriods'));
      for(const [kind,now,old] of [['step',result.groups,result.previousGroups],['batch',result.batchGroups,result.previousBatchGroups]]){
        const before=new Map(old.map(g=>[g.key,g])),nowKeys=new Set(now.map(g=>g.key));
        for(const g of now){if(before.has(g.key))result.comparisons.push(comparison(g,before.get(g.key),kind));else result.issues.push(issue('noComparablePrevious',[],{kind,groupKey:g.key}));}
        for(const g of old)if(!nowKeys.has(g.key))result.issues.push(issue('noComparableCurrent',[],{kind,groupKey:g.key}));
      }
    }
    const currentIds=new Set(result.records.map(r=>r.id)),previousIds=new Set(result.previousRecords.map(r=>r.id)),outliers=new Set(result.excludedRows.map(r=>r.id)),previousOutliers=new Set(result.previousGroups.flatMap(g=>g.excludedIds));
    const allBatchMap=new Map(allBatches.flatMap(b=>b.records.map(r=>[r.id,b])));
    const status=(r,ids,p,enabled,excluded)=>!enabled?'notRequested':!matchesBatch(allBatchMap.get(r.id))||!matchesRow(r)?'filtered':!ids.has(r.id)?allBatchMap.get(r.id).start===null&&p.active?'undated':'outsidePeriod':!finite(r.duration)?'invalid':s.outlier==='iqr'&&excluded.has(r.id)?'iqrExcluded':'included';
    result.audit=records.map(record=>({record,currentStatus:status(record,currentIds,current,true,outliers),previousStatus:status(record,previousIds,previous,previous.active,previousOutliers)}));
    for(const b of candidates)for(const i of b.issues)result.issues.push(i);
    const partial=result.batches.filter(b=>b.partial).length;if(partial)result.issues.push(issue('partialBatchSelection',[partial]));
    const undated=candidates.filter(b=>b.start===null).length;if((current.active||previous.active)&&undated)result.issues.push(issue('undatedBatches',[undated]));
    const clockGroups=new Map();for(const g of [...result.groups,...result.previousGroups]){const key=JSON.stringify([g.product,g.equipment,g.step]);if(!clockGroups.has(key))clockGroups.set(key,new Set());if(g.clock)clockGroups.get(key).add(g.clock);}
    for(const [key,clocks] of clockGroups)if(clocks.size>1)result.issues.push(issue('separateClocks',[],{groupKey:key}));
    const small=result.groups.filter(g=>g.all.n<s.minSamples).length;if(small)result.issues.push(issue('insufficientSamples',[small,s.minSamples]));
    const retainedSmall=result.groups.filter(g=>g.all.n>=s.minSamples&&g.withoutOutliers.n<s.minSamples).length;if(s.outlier==='iqr'&&retainedSmall)result.issues.push(issue('insufficientAfterIqr',[retainedSmall,s.minSamples]));
    const valid=result.records.filter(r=>finite(r.duration)),referenced=valid.filter(r=>r.excess!==null),complete=result.batches.filter(b=>b.complete);
    result.timeLoss={waiting:0,downtime:0,processDelay:0,excess:referenced.length?referenced.reduce((sum,r)=>sum+r.excess,0):null,gap:complete.length?complete.reduce((sum,b)=>sum+b.gap,0):null,referenceCount:referenced.length,unreferencedCount:valid.length-referenced.length,completeBatches:complete.length,nonAdditive:true};
    for(const r of valid)if(['waiting','downtime','processDelay'].includes(r.lossType))result.timeLoss[r.lossType]+=r.duration;
    if(result.timeLoss.unreferencedCount)result.issues.push(issue(s.reference==='p50'?'insufficientReference':'missingTarget',[result.timeLoss.unreferencedCount]));
    const paretoRows=[];let missingCategory=0,missingReference=0;
    for(const r of valid){const label=s.paretoGroup==='category'?r.category:r.step;if(!label){missingCategory++;continue;}const value=s.paretoMetric==='count'?1:s.paretoMetric==='total'?r.duration:r.excess;if(value===null){missingReference++;continue;}paretoRows.push([label,value]);}
    result.pareto={rows:paretoRows,result:C.pareto(paretoRows),metric:s.paretoMetric,group:s.paretoGroup,missingCategory,missingReference};
    if(missingCategory)result.issues.push(issue('missingCategory',[missingCategory]));
    result.counts={...result.counts,current:result.records.length,previous:result.previousRecords.length,currentValid:valid.length,currentExcluded:result.invalidRecords.length,currentBatches:result.batches.length,completeBatches:complete.length,undatedBatches:undated,iqrExcluded:result.excludedRows.length};
    result.conditions={...s,currentPeriod:current,previousPeriod:previous,cohort:'batchStart',percentileMethod:'R7',standardDeviation:'sample-n-1',iqrMultiplier:1.5,outlierScope:'statisticsOnly',referencePopulation:'allValidStepRecords',batchCompleteness:'observedRecordsOnly',timeUnit:'minute',lossesAdditive:false};
    return result;
  }
  const api={normalize,analyze,summary,intervals,groupKey,batchKey,period};root.BatchCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
