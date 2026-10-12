/* Shared, versioned preference schema for the two review workflows. No data rows. */
(function(root){'use strict';
const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore,Y=typeof module!=='undefined'?require('./cycle-core.js'):root.CycleCore;
const F={recurring:['date','product','lot','equipment','item','value','unit','lsl','usl'],batch:['batch','product','equipment','step','start','end','category','reason','target','lossType']};
const defaults={product:'',item:'',equipment:'',lot:'',step:'',batch:'',from:'',to:'',previousFrom:'',previousTo:'',chart:'imr',subgroupSize:5,rules:[1],minSamples:5,cpkThreshold:1.33,deltaThreshold:null,attentionOos:true,attentionSpc:true,attentionOnly:false,rationalSubgroups:false,reportTitle:'',reportCharts:4,outlier:'all',targetUnit:'minute',displayUnit:'hour',reference:'target',paretoMetric:'excess',paretoGroup:'step'};
function fail(){throw Error('workflow.invalidSettings');}
function text(v,max=200){if(typeof v!=='string'||v.length>max)fail();return v;}
function limit(v){if(v===null||v===undefined||typeof v==='string'&&!v.trim())return null;const n=C.numeric(v);if(n===null)fail();return n;}
function mapping(tool,m,width){if(!Object.hasOwn(F,tool)||!m||typeof m!=='object'||Array.isArray(m)||!Number.isInteger(width)||width<1||width>300)fail();const out={};for(const k of F[tool]){const n=m[k]??-1;if(!Number.isInteger(n)||n< -1||n>=width)fail();out[k]=n;}
 if(tool==='recurring'){if(!['long','wide'].includes(m.format))fail();out.format=m.format;out.measurements=[];if(out.format==='wide'){if(!Array.isArray(m.measurements)||!m.measurements.length||m.measurements.length>100)fail();out.measurements=m.measurements.map(x=>{if(!x||!Number.isInteger(x.column)||x.column<0||x.column>=width)fail();const v={column:x.column,name:text(x.name),unit:text(x.unit??'',40),lsl:limit(x.lsl),usl:limit(x.usl)};if(!v.name.trim()||(v.lsl!==null&&v.usl!==null&&v.lsl>=v.usl))fail();return v;});for(const k of ['item','value','unit','lsl','usl'])out[k]=-1;}else if(out.value<0)fail();}
 else if(['batch','step','start','end'].some(k=>out[k]<0))fail();
 const used=F[tool].map(k=>out[k]).filter(n=>n>=0).concat(out.measurements?.map(x=>x.column)||[]);if(new Set(used).size!==used.length)fail();return out;
}
function settings(tool,s={}){if(!Object.hasOwn(F,tool)||!s||typeof s!=='object'||Array.isArray(s))fail();const o={...defaults,...s},out={};for(const k of ['product','item','equipment','lot','step','batch','reportTitle'])out[k]=text(o[k]);for(const k of ['from','to','previousFrom','previousTo']){out[k]=text(o[k],10);if(out[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[k])||!Y.timestamp(out[k]+' 00:00')))fail();}
 for(const [a,b] of [['from','to'],['previousFrom','previousTo']])if(out[a]&&out[b]&&out[a]>out[b])fail();
 for(const [k,values] of Object.entries({chart:['imr','xbar'],outlier:['all','iqr'],targetUnit:['minute','hour'],displayUnit:['minute','hour'],reference:['target','p50'],paretoMetric:['count','total','excess'],paretoGroup:['step','category']})){if(!values.includes(o[k]))fail();out[k]=o[k];}
 for(const [k,min,max] of [['subgroupSize',2,10],['minSamples',2,1000],['reportCharts',0,12]]){if(!Number.isInteger(o[k])||o[k]<min||o[k]>max)fail();out[k]=o[k];}
 if(!Array.isArray(o.rules)||o.rules.length>8||o.rules.some(n=>!Number.isInteger(n)||n<1||n>8))fail();out.rules=[...new Set(o.rules)];
 for(const k of ['cpkThreshold','deltaThreshold']){out[k]=limit(o[k]);if(out[k]!==null&&out[k]<0)fail();}
 for(const k of ['attentionOos','attentionSpc','attentionOnly','rationalSubgroups']){if(typeof o[k]!=='boolean')fail();out[k]=o[k];}return out;
}
// Inputs are already normalized/validated by ImportCore. Repeated files may
// share a layout; a preset cannot choose among conflicting layouts by filename.
function uniqueLayouts(layouts,strict=false){const seen=new Map(),out=[];for(const layout of layouts){const key=JSON.stringify(layout.headers),value=JSON.stringify(layout.mapping),variants=seen.get(key)||new Set();if(variants.has(value))continue;if(strict&&variants.size)throw Error('workflow.ambiguousLayouts');variants.add(value);seen.set(key,variants);out.push(layout);}return out;}
const api={fields:F,defaults,mapping,settings,uniqueLayouts};root.WorkflowConfig=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
