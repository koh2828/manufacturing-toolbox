(function(root){
  'use strict';
  const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore,DAY=86400000;
  const isoDay=day=>new Date(day*DAY).toISOString().slice(0,10);
  function canUseDates(data,column){if(column<0||!data.rows.length)return false;let kind;for(const row of data.rows){const value=I.date(row[column],!!data.date1904);if(!value||kind&&kind!==value.kind)return false;kind=value.kind;}return true;}
  // The viewport only selects already-calculated points. Never regroup, recompute
  // MR, change control limits, or run Nelson tests on the displayed subset.
  function windowFor(result,mode='index',selection={}){
    const dated=mode==='date',input=result.input;
    const positions=input.map((x,i)=>dated?x.time:i+1);
    const min=dated?Math.floor(Math.min(...positions)/DAY):1,max=dated?Math.floor(Math.max(...positions)/DAY):input.length;
    const parse=(s,fallback)=>{if(s===''||s===null||s===undefined)return fallback;if(!dated)return Number(s);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const d=I.date(s);return d?Math.floor(d.ms/DAY):NaN;};
    const from=parse(selection.start,min),to=parse(selection.end,max);
    const valid=Number.isInteger(from)&&Number.isInteger(to)&&from<=to&&(!dated?from>=1&&to<=input.length:true);
    const groups=new Map(result.groups.map(g=>[g.index,g]));
    function select(records){return records.map(point=>{const group=result.chart==='xbar'?groups.get(point.index):null,start=group?.start??point.index,end=group?.end??point.index;return {...point,position:end+1,time:input[end]?.time,startTime:input[start]?.time,startPosition:start+1,isSubgroup:!!group};}).filter(point=>valid&&(dated?point.time>=from*DAY&&point.time<(to+1)*DAY:point.position>=from&&point.position<=to));}
    return {mode:dated?'date':'index',min,max,from,to,valid,start:valid?(dated?isoDay(from):String(from)):'',end:valid?(dated?isoDay(to):String(to)):'',first:select(result.chartRecords),ranges:select(result.rangeRecords),firstTotal:result.chartRecords.length,rangeTotal:result.rangeRecords.length,axis:{mode:dated?'date':'index',min:dated?from*DAY:from,max:dated?(to+1)*DAY-1:to}};
  }
  const api={DAY,isoDay,canUseDates,windowFor};root.ChartViewCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
