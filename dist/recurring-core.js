(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore;
  const S=typeof module!=='undefined'?require('./spc-core.js'):root.SPCCore;
  const DAY=86400000,indices=['cp','cpk','pp','ppk'];
  const text=v=>String(v??'').trim(),empty=v=>v===null||v===undefined||typeof v==='string'&&!v.trim();
  const issue=(code,params=[],extra={})=>({code,params,...extra});

  /* Public contract (all computations local, input objects never mutated):
   * normalize(sources) => {records,issues}. Each source contains a table and a
   * long mapping, or explicit wide measurements [{column,name,unit,lsl,usl}].
   * Each normalized record retains file/sheet/row, rawValue/rawDate/raw limits,
   * parsed value/date, clock kind, dimensions, and validation issue codes.
   * analyze(records,settings) => {valid,settings,groups,previousGroups,
   * comparisons,audit,issues,counts}. Group.stats contains nullable numbers;
   * oosRate and relative deltas are percentages. group.result is the shared
   * SPC result with suppressed capability indices, or null if SPC is invalid.
   * selectedRecords matches result's raw input order, including invalid-value
   * placeholders so MR/Nelson cannot bridge missing measurements.
   * Reason codes are deliberately untranslated: rendering/reporting resolves
   * the current language without recalculating or rewriting measurements.
   */
  function normalize(sources){
    const records=[],issues=[];
    if(!Array.isArray(sources))return {records,issues:[issue('invalidSources')]};
    sources.forEach((source,sourceIndex)=>{
      const sourceId=text(source?.id)||String(sourceIndex),file=text(source?.name),sheet=text(source?.sheet);
      const context={sourceId,file,sheet},table=source?.table,m=source?.mapping;
      if(!table||!Array.isArray(table.headers)||!Array.isArray(table.rows)||!m||!['long','wide'].includes(m.format)){
        issues.push(issue('invalidMapping',[],context));return;
      }
      const width=table.headers.length,optional=['date','product','lot','equipment','item','value','unit','lsl','usl'];
      const column=k=>m[k]===undefined||m[k]===null?-1:m[k];
      if(optional.some(k=>!Number.isInteger(column(k))||column(k)<-1||column(k)>=width)){
        issues.push(issue('invalidMapping',[],context));return;
      }
      const measurements=m.format==='long'?[{column:column('value')}]:m.measurements;
      if(!Array.isArray(measurements)||!measurements.length||measurements.some(x=>!x||!Number.isInteger(x.column)||x.column<0||x.column>=width)||new Set(measurements.map(x=>x.column)).size!==measurements.length){
        issues.push(issue('invalidMapping',[],context));return;
      }
      const used=optional.filter(k=>m.format==='long'||!['item','value','unit','lsl','usl'].includes(k)).map(column).filter(v=>v>=0);
      if(new Set(used).size!==used.length||m.format==='wide'&&measurements.some(x=>used.includes(x.column))){
        issues.push(issue('duplicateMapping',[],context));return;
      }
      table.rows.forEach((row,rowIndex)=>{
        if(!Array.isArray(row)){issues.push(issue('invalidRow',[],{...context,row:rowIndex+1}));return;}
        const sourceRow=table.sourceRows?.[rowIndex];
        const rowNumber=Number.isInteger(sourceRow)&&sourceRow>0?sourceRow:rowIndex+(table.sourceHeaderRow||1)+(table.sourceHasHeader===false?0:1);
        const cell=k=>column(k)>=0?row[column(k)]:'';
        const rawDate=cell('date'),parsedDate=column('date')>=0?I.date(rawDate,!!(source.date1904??table.date1904)):null;
        measurements.forEach((measurement,measurementIndex)=>{
          const rawValue=row[measurement.column]??'',value=C.numeric(rawValue);
          const rawLsl=m.format==='long'?cell('lsl'):measurement.lsl,rawUsl=m.format==='long'?cell('usl'):measurement.usl;
          const lsl=empty(rawLsl)?null:C.numeric(rawLsl),usl=empty(rawUsl)?null:C.numeric(rawUsl);
          const specInvalid=!empty(rawLsl)&&lsl===null||!empty(rawUsl)&&usl===null||lsl!==null&&usl!==null&&lsl>=usl;
          const r={id:JSON.stringify([sourceId,sourceIndex,rowIndex,measurementIndex]),...context,sourceIndex,rowIndex,row:rowNumber,column:measurement.column,
            rawValue,value,rawDate,date:parsedDate?.ms??null,timeKind:parsedDate?.kind??null,hasDate:column('date')>=0,
            product:text(cell('product')),lot:text(cell('lot')),equipment:text(cell('equipment')),
            item:m.format==='long'?text(cell('item')):text(measurement.name)||text(table.headers[measurement.column]),
            unit:text(m.format==='long'?cell('unit'):measurement.unit),rawLsl:rawLsl??'',rawUsl:rawUsl??'',lsl,usl,specInvalid,issues:[]};
          const add=code=>{const e=issue(code,[],{sourceId,file,sheet,row:rowNumber,column:measurement.column,recordId:r.id});r.issues.push(e);issues.push(e);};
          if(value===null)add(empty(rawValue)?'missingMeasurement':'invalidMeasurement');
          if(r.hasDate&&!parsedDate)add(empty(rawDate)?'missingDate':'invalidDate');
          if(specInvalid)add('invalidSpecification');
          records.push(r);
        });
      });
    });
    return {records,issues};
  }

  const defaults={product:'',item:'',equipment:'',lot:'',from:'',to:'',previousFrom:'',previousTo:'',chart:'imr',subgroupSize:5,rules:[1],minSamples:5,cpkThreshold:1.33,deltaThreshold:null,attentionOos:true,attentionSpc:true,rationalSubgroups:false};
  function settings(input={}){
    const object=!!input&&typeof input==='object'&&!Array.isArray(input),source=object?input:{};
    const out=Object.fromEntries(Object.keys(defaults).map(k=>[k,source[k]===undefined?defaults[k]:source[k]]));
    const validRules=Array.isArray(out.rules)&&out.rules.length<=8;out.rules=[...(validRules?out.rules:defaults.rules)];
    for(const key of ['product','item','equipment','lot','from','to','previousFrom','previousTo'])out[key]=text(out[key]);
    out.rules=[...new Set(out.rules)];
    const valid=object&&validRules&&['imr','xbar'].includes(out.chart)&&Number.isInteger(out.subgroupSize)&&out.subgroupSize>=2&&out.subgroupSize<=10&&Number.isInteger(out.minSamples)&&out.minSamples>=2&&out.minSamples<=1000&&out.rules.every(v=>Number.isInteger(v)&&v>=1&&v<=8)&&['cpkThreshold','deltaThreshold'].every(k=>out[k]===null||Number.isFinite(out[k])&&out[k]>=0)&&['attentionOos','attentionSpc','rationalSubgroups'].every(k=>typeof out[k]==='boolean');
    return {value:out,valid};
  }
  function period(from,to){
    const parse=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?I.date(s):null,a=from?parse(from):null,b=to?parse(to):null;
    const valid=(!from||a!==null)&&(!to||b!==null)&&(!a||!b||a.ms<=b.ms);
    return {from,to,start:a?.ms??-Infinity,end:b?b.ms+DAY-1:Infinity,active:!!(from||to),valid};
  }
  function inPeriod(r,p){return !p.active||Number.isFinite(r.date)&&r.date>=p.start&&r.date<=p.end;}
  function groupKey(r){return JSON.stringify([r.product,r.item,r.equipment,r.unit,r.lsl,r.usl,r.timeKind,r.specInvalid?[text(r.rawLsl),text(r.rawUsl)]:null]);}
  const nullable=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  function descriptors(raw){
    const values=raw.map(C.numeric).filter(v=>v!==null),n=values.length;
    if(n<2)return {n,mean:n?values[0]:null,median:n?values[0]:null,sd:null,min:n?values[0]:null,max:n?values[0]:null,cp:null,cpk:null,pp:null,ppk:null,within:null,oosCount:null,oosRate:null};
    const r=C.analyze(raw);
    return Object.fromEntries(['n','mean','median','sd','min','max','cp','cpk','pp','ppk','within','oosCount','oosRate'].map(k=>[k,nullable(r[k])]));
  }
  function summarize(records,s){
    const selectedRecords=[...records],first=records[0],reasons=[],add=(code,params=[])=>reasons.push(issue(code,params));
    const completeLots=records.every(r=>r.lot),order=completeLots?'lot':'input';
    if(completeLots)selectedRecords.sort((a,b)=>I.compareLots(a.lot,b.lot)||a.sourceIndex-b.sourceIndex||a.rowIndex-b.rowIndex||a.column-b.column);
    else add(records.some(r=>r.lot)?'partialLotOrder':'inputOrder');
    const raw=selectedRecords.map(r=>r.value),key=groupKey(first),g={key,product:first.product,item:first.item,equipment:first.equipment,unit:first.unit,lsl:first.lsl,usl:first.usl,timeKind:first.timeKind,specInvalid:!!first.specInvalid,order,selectedRecords,result:null,stats:null,reasons,attention:false,status:'unavailable',reference:false,excluded:[],comparison:null};
    try{g.stats=descriptors(raw);}catch{g.stats={n:raw.filter(v=>v!==null).length,mean:null,median:null,sd:null,min:null,max:null,cp:null,cpk:null,pp:null,ppk:null,within:null,oosCount:null,oosRate:null};add('numericOverflow');}
    const validSpec=!g.specInvalid,hasSpec=validSpec&&(g.lsl!==null||g.usl!==null),allowSpc=s.chart!=='xbar'||s.rationalSubgroups;
    if(g.specInvalid)add('invalidSpecification');else if(!hasSpec)add('missingSpecification');else if(g.lsl===null||g.usl===null)add('oneSidedSpecification');
    if(!allowSpc)add('rationalSubgroupsRequired');
    if(g.stats.n>=2&&allowSpc){
      try{
        g.result=S.analyze(raw,{lsl:validSpec?g.lsl:null,usl:validSpec?g.usl:null,chart:s.chart,subgroupSize:s.subgroupSize,rules:s.rules});
        for(const k of ['n','mean','median','sd','min','max','within',...indices])g.stats[k]=nullable(g.result[k]);
      }catch{add(s.chart==='xbar'?'insufficientSubgroups':'analysisUnavailable');}
    }
    const used=g.result?new Set(g.result.records.map(r=>r.index)):null;
    selectedRecords.forEach((r,index)=>{
      if(r.value===null)g.excluded.push({record:r,code:empty(r.rawValue)?'missingMeasurement':'invalidMeasurement'});
      else if(used&&!used.has(index))g.excluded.push({record:r,code:'excludedSubgroup'});
    });
    const retained=g.result?g.result.records.map(r=>r.value):raw.filter(v=>v!==null);
    g.stats.oosCount=hasSpec&&retained.length?retained.filter(v=>g.lsl!==null&&v<g.lsl||g.usl!==null&&v>g.usl).length:null;
    g.stats.oosRate=g.stats.oosCount===null?null:g.stats.oosCount/retained.length*100;
    if(g.stats.n<s.minSamples)add('insufficientSamples',[g.stats.n,s.minSamples]);
    else if(g.stats.n<30){g.reference=true;add('smallSampleReference',[g.stats.n,30]);}
    if(!g.result||g.stats.n<s.minSamples||!validSpec||!allowSpc)for(const k of indices){g.stats[k]=null;if(g.result)g.result[k]=null;}
    if(g.result){
      if(!(g.result.within>0))add(g.result.within===null?'noAdjacentPairs':'zeroWithinVariation');
      if(g.result.sd===0)add('zeroOverallVariation');
      if(g.result.excludedGroups.length)add('excludedSubgroups',[g.result.excludedGroups.length]);
      if(g.result.alarms.length||g.result.rangeSignals.length){g.reference=true;add('unstableProcess',[g.result.alarms.length,g.result.rangeSignals.length]);if(s.attentionSpc)g.attention=true;}
    }
    if(s.attentionOos&&g.stats.oosCount>0){g.attention=true;add('outOfSpecification',[g.stats.oosCount,g.stats.oosRate]);}
    if(s.cpkThreshold!==null&&g.stats.cpk!==null&&g.stats.cpk<s.cpkThreshold){g.attention=true;add('lowCpk',[g.stats.cpk,s.cpkThreshold]);}
    if(g.excluded.length)add('excludedMeasurements',[g.excluded.length]);
    g.status=g.attention?'attention':!g.result||g.stats.n<s.minSamples||g.specInvalid?'unavailable':g.reference?'reference':'ok';
    return g;
  }
  function compare(current,previous){
    const deltas={};
    for(const k of ['n','mean','median','sd','cp','cpk','pp','ppk','oosCount','oosRate']){
      const a=current.stats[k],b=previous.stats[k],absolute=a!==null&&b!==null?nullable(a-b):null;
      deltas[k]={absolute,relative:absolute!==null&&b!==0?nullable(absolute/Math.abs(b)*100):null};
    }
    return {key:current.key,current:current.stats,previous:previous.stats,deltas};
  }
  function analyze(records,input={}){
    const validated=settings(input),s=validated.value,current=period(s.from,s.to),previous=period(s.previousFrom,s.previousTo);
    const result={valid:true,settings:s,groups:[],previousGroups:[],comparisons:[],audit:[],issues:[],counts:{records:Array.isArray(records)?records.length:0,filtered:0,current:0,previous:0,currentValid:0,previousValid:0,currentExcluded:0,previousExcluded:0}};
    if(!Array.isArray(records)||!validated.valid||!current.valid||!previous.valid){result.valid=false;result.issues.push(issue(!validated.valid?'invalidSettings':!current.valid||!previous.valid?'invalidPeriod':'invalidRecords'));return result;}
    const matches=r=>['product','item','equipment','lot'].every(k=>!s[k]||r[k]===s[k]),chosen=records.filter(matches);
    result.counts.filtered=chosen.length;
    const curr=chosen.filter(r=>inPeriod(r,current)),prev=previous.active?chosen.filter(r=>inPeriod(r,previous)):[];
    result.counts.current=curr.length;result.counts.previous=prev.length;
    const grouped=list=>{const groups=new Map();for(const r of list){const key=groupKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}return [...groups.values()].map(rs=>summarize(rs,s)).sort((a,b)=>I.compareLots(a.product,b.product)||I.compareLots(a.item,b.item)||I.compareLots(a.equipment,b.equipment)||a.key.localeCompare(b.key));};
    result.groups=grouped(curr);result.previousGroups=grouped(prev);
    const previousMap=new Map(result.previousGroups.map(g=>[g.key,g]));
    if(previous.active){
      if(current.start<=previous.end&&previous.start<=current.end)result.issues.push(issue('overlappingPeriods'));
      for(const g of result.groups){const old=previousMap.get(g.key);if(old){
        const c=compare(g,old);g.comparison=c;result.comparisons.push(c);
        if(s.deltaThreshold!==null&&c.deltas.mean.absolute!==null&&Math.abs(c.deltas.mean.absolute)>s.deltaThreshold){g.attention=true;g.status='attention';g.reasons.push(issue('meanChange',[c.deltas.mean.absolute,s.deltaThreshold]));}
      }else{g.reasons.push(issue('noComparablePrevious'));result.issues.push(issue('noComparablePrevious',[],{groupKey:g.key}));}}
      const currentKeys=new Set(result.groups.map(g=>g.key));
      for(const g of result.previousGroups)if(!currentKeys.has(g.key))result.issues.push(issue('noComparableCurrent',[],{groupKey:g.key}));
    }
    const scope=new Map();
    for(const r of [...curr,...prev]){const key=JSON.stringify([r.product,r.item,r.equipment]);if(!scope.has(key))scope.set(key,{unit:new Set(),spec:new Set(),clock:new Set()});const v=scope.get(key);v.unit.add(r.unit);v.spec.add(JSON.stringify([r.lsl,r.usl,r.specInvalid?[text(r.rawLsl),text(r.rawUsl)]:null]));v.clock.add(r.timeKind);}
    for(const [key,v] of scope){if(v.unit.size>1)result.issues.push(issue('separateUnits',[],{scope:key}));if(v.spec.size>1)result.issues.push(issue('separateSpecifications',[],{scope:key}));if(v.clock.size>1)result.issues.push(issue('separateClocks',[],{scope:key}));}
    const currentSet=new Set(curr),previousSet=new Set(prev),excludedCurrent=new Map(result.groups.flatMap(g=>g.excluded.map(e=>[e.record,e.code]))),excludedPrevious=new Map(result.previousGroups.flatMap(g=>g.excluded.map(e=>[e.record,e.code])));
    result.audit=records.map(r=>({record:r,currentStatus:!matches(r)?'filtered':!currentSet.has(r)?r.date===null&&current.active?'undated':'outsidePeriod':excludedCurrent.get(r)||'included',previousStatus:!previous.active?'notRequested':!matches(r)?'filtered':!previousSet.has(r)?r.date===null?'undated':'outsidePeriod':excludedPrevious.get(r)||'included'}));
    result.counts.currentExcluded=excludedCurrent.size;result.counts.previousExcluded=excludedPrevious.size;
    result.counts.currentValid=curr.length-excludedCurrent.size;result.counts.previousValid=prev.length-excludedPrevious.size;
    const undated=chosen.filter(r=>r.date===null).length;if((current.active||previous.active)&&undated)result.issues.push(issue('undatedExcluded',[undated]));
    for(const r of chosen)for(const i of r.issues||[])result.issues.push(i);
    return result;
  }
  const api={normalize,analyze,groupKey,period,defaults};root.RecurringCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
