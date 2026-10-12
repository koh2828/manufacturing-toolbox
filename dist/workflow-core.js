(function(root){'use strict';
const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore,W=typeof module!=='undefined'?require('./workflow-config.js'):root.WorkflowConfig;
function suggest(tool,table){const headers=table.headers,used=new Set(),m={};const patterns={date:/日付|日時|date|timestamp/i,product:/製品|品番|product|material|sku/i,lot:/ロット|lot|batch/i,batch:/バッチ|ロット|batch|lot/i,equipment:/設備|装置|equipment|machine/i,item:/検査項目|測定項目|inspection.*item|^item$|parameter/i,value:/測定値|結果|measurement|^value$|result/i,unit:/単位|^unit$/i,lsl:/規格下限|下限|^lsl$/i,usl:/規格上限|上限|^usl$/i,step:/工程|process.*step|^step$/i,start:/開始|start/i,end:/終了|end|finish/i,category:/理由区分|原因区分|delay.*category|category/i,reason:/理由|reason/i,target:/基準時間|目標|target/i,lossType:/ロス種別|loss.*type/i};
 for(const k of W.fields[tool]){m[k]=headers.findIndex((h,n)=>!used.has(n)&&patterns[k]?.test(I.normalized(h)));if(m[k]>=0)used.add(m[k]);}
 if(tool==='recurring'){m.format=m.value>=0?'long':'wide';m.measurements=m.format==='wide'?I.infer(table).filter(x=>x.type==='number'&&!used.has(x.index)).map(x=>({column:x.index,name:headers[x.index],unit:'',lsl:null,usl:null})):[];}return m;
}
function checkSize(sources,tool){if(!Array.isArray(sources)||sources.length>20)throw Error('workflow.limit');let rows=0,measurements=0;for(const s of sources){rows+=s.table?.rows?.length||0;measurements+=(s.table?.rows?.length||0)*(tool==='recurring'&&s.mapping?.format==='wide'?(s.mapping.measurements?.length||0):1);}if(rows>50000||measurements>200000)throw Error('workflow.limit');return {rows,measurements};}
function layouts(sources,tool,forPreset=false){return W.uniqueLayouts(sources.map(s=>({headers:s.table.headers.map(I.normalized),mapping:I.mapping(tool,s.mapping,s.table.headers.length)})),forPreset);}
function matchLayouts(sources,p){return sources.length>0&&sources.every(s=>(p.layouts||[p]).some(l=>I.match({...l,tool:p.tool},p.tool,s.table.headers)));}
function project(tool,sources,settings){return validateProject({format:'manufacturing-toolbox-project',version:1,tool,settings,sources:sources.map(s=>({id:s.id,name:s.name,sheet:s.sheet,date1904:s.date1904??s.table?.date1904??false,isDemo:s.isDemo??false,table:s.table,mapping:s.mapping}))});}
function validateProject(p){
 if(!p||p.format!=='manufacturing-toolbox-project'||p.version!==1||!W.fields[p.tool]||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>20)throw Error('workflow.invalidProject');
 let n=0;const invalid=()=>{throw Error('workflow.invalidProject');};
 const sources=p.sources.map((s,i)=>{
  if(!s||!s.table||!Array.isArray(s.table.headers)||!s.table.headers.length||s.table.headers.length>300||s.table.headers.some(h=>typeof h!=='string'||h.length>200)||!Array.isArray(s.table.rows))invalid();
  n+=s.table.rows.length;if(n>50000)throw Error('workflow.limit');
  const rows=s.table.rows.map(r=>{if(!Array.isArray(r)||r.length>s.table.headers.length||r.some(v=>!(v===null||typeof v==='string'&&v.length<=100000||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean')))invalid();return r.slice();});
  for(const k of ['name','sheet'])if(typeof(s[k]??'')!=='string'||(s[k]||'').length>300)invalid();
  for(const value of [s.date1904,s.table.date1904,s.isDemo,s.table.sourceHasHeader])if(value!==undefined&&typeof value!=='boolean')invalid();
  if(s.date1904!==undefined&&s.table.date1904!==undefined&&s.date1904!==s.table.date1904)invalid();
  const date1904=s.date1904??s.table.date1904??false;
  const table={headers:s.table.headers.slice(),rows,date1904,sourceHeaderRow:s.table.sourceHeaderRow??1,sourceHasHeader:s.table.sourceHasHeader!==false};
  if(!Number.isSafeInteger(table.sourceHeaderRow)||table.sourceHeaderRow<1)invalid();
  if(s.table.sourceRows!==undefined){if(!Array.isArray(s.table.sourceRows)||s.table.sourceRows.length!==rows.length||s.table.sourceRows.some(row=>!Number.isSafeInteger(row)||row<1))invalid();table.sourceRows=s.table.sourceRows.slice();}
  return {id:'source-'+i,name:s.name||'',sheet:s.sheet||'',date1904,isDemo:s.isDemo??false,table,mapping:I.mapping(p.tool,s.mapping,s.table.headers.length)};
 });
 return {format:p.format,version:1,tool:p.tool,settings:W.settings(p.tool,p.settings),sources};
}
function period(kind,records=[]){
 if(!['month','week'].includes(kind)||!Array.isArray(records))throw Error('workflow.invalidSettings');
 let end=-Infinity;for(const record of records){const value=record?.date??record?.start;if(Number.isFinite(value)&&Number.isFinite(new Date(value).getTime())&&value>end)end=value;}
 const d=new Date(end===-Infinity?Date.now():end),iso=x=>new Date(x).toISOString().slice(0,10);let a,b,c;
 if(kind==='month'){a=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);b=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);c=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1);}
 else{const midnight=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());a=midnight-((d.getUTCDay()+6)%7)*86400000;b=a+7*86400000;c=a-7*86400000;}
 return {from:iso(a),to:iso(b-1),previousFrom:iso(c),previousTo:iso(a-1)};
}
const api={suggest,checkSize,layouts,matchLayouts,project,validateProject,period};root.WorkflowCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
