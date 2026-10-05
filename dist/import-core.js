(function(root){
  'use strict';
  const I18n=root.I18n||(typeof require==='function'?require('./i18n.js'):null);
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const Y=typeof module!=='undefined'?require('./cycle-core.js'):root.CycleCore;
  const KEY='manufacturing-toolbox.preferences.v1';
  const normalized=v=>String(v??'').normalize('NFKC').trim();
  const fields={capability:['value','date','product','lot'],cycle:['product','lot','start','end','equipment'],pareto:['category','quantity'],rci:['date','event']};
  function signature(tool,headers){return JSON.stringify([tool,headers.map(normalized)]);}
  function sheetRows(X,sheet){
    const range=X.utils.decode_range(sheet['!ref']||'A1');if(range.e.r>50000||range.e.c>299)throw Error((I18n.t("import-core.b6ddc84d1c")));
    const rows=X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true,range:{s:{r:0,c:0},e:range.e}});
    // SheetJS may materialize Date objects from formatted numeric cells even with
    // raw:true. Restore the original serial to avoid any local timezone conversion.
    for(const [address,cell] of Object.entries(sheet)){
      if(address[0]==='!')continue;const pos=X.utils.decode_cell(address);if(cell.t==='e'&&rows[pos.r])rows[pos.r][pos.c]=cell.w||X.utils.format_cell(cell)||'#ERROR!';if(cell.t!=='n')continue;
      if(rows[pos.r])rows[pos.r][pos.c]=/^0{2,}$/.test(cell.z||'')?(cell.w||X.utils.format_cell(cell)):cell.v;
    }return rows;
  }
  function date(v,date1904=false){if(typeof v==='string'&&/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v.trim()))return Y.timestamp(v.trim()+' 00:00',date1904);return Y.timestamp(v,date1904);}
  function infer(d){return d.headers.map((header,i)=>{
    const cells=d.rows.slice(0,1000).map(r=>r[i]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''),n=cells.length;
    const id=/製品|品番|品目|ロット|番号|コード|product|material|sku|lot|batch|\bid\b/i.test(header);
    const dateHint=/(?:日付|日時|測定日|採取日|開始時刻|終了時刻)$|^(?:(?:start|end|finish|measurement|sample)[ _-]*(?:date|time)|date|datetime|timestamp)$/i.test(normalized(header));
    const numbers=cells.filter(v=>C.numeric(v)!==null).length,dates=cells.filter(v=>(typeof v!=='number'||dateHint)&&date(v,!!d.date1904)).length;
    const type=id?'category':n&&dates/n>=.8?'date':n&&numbers/n>=.8?'number':'category';
    return {index:i,type,filled:n,numeric:numbers,dates,confidence:n===0?'low':type==='number'?numbers===n?'high':'low':type==='date'?dates===n?'high':'low':'high'};
  });}
  function mapping(tool,m,width){
    if(!m||typeof m!=='object')throw Error((I18n.t("import-core.e720147c09")));const out={};
    for(const key of fields[tool]||[]){const v=tool==='capability'&&key==='lot'&&m[key]===undefined?-1:m[key];if(!Number.isInteger(v)||v< -1||v>=width)throw Error((I18n.t("import-core.d7fce27e8b")));out[key]=v;}
    const required={capability:['value'],cycle:['product','lot','start','end'],pareto:['category','quantity'],rci:['event']}[tool];
    if(!required||required.some(k=>out[k]<0))throw Error((I18n.t("import-core.32f1746b71")));
    const used=Object.values(out).filter(v=>v>=0);if(new Set(used).size!==used.length)throw Error((I18n.t("import-core.99a6422b97")));return out;
  }
  function settings(tool,s={}){
    const str=(v,max=200)=>{if(typeof v!=='string'||v.length>max)throw Error((I18n.t("import-core.254e4b2b93")));return v;};
    if(tool==='capability'){
      const out={lsl:str(s.lsl),usl:str(s.usl),unit:str(s.unit,40),chart:s.chart,subgroupSize:s.subgroupSize,rules:s.rules,productValue:str(s.productValue),order:s.order};
      if(!['imr','xbar'].includes(out.chart)||!Number.isInteger(out.subgroupSize)||out.subgroupSize<2||out.subgroupSize>10||!['input','date','lot'].includes(out.order)||!Array.isArray(out.rules)||out.rules.length>8||out.rules.some(n=>!Number.isInteger(n)||n<1||n>8))throw Error((I18n.t("import-core.254e4b2b93")));
      for(const k of ['lsl','usl'])if(out[k].trim()&&C.numeric(out[k])===null)throw Error((I18n.t("import-core.703edc5623")));
      if(out.lsl.trim()&&out.usl.trim()&&C.numeric(out.lsl)>=C.numeric(out.usl))throw Error((I18n.t("import-core.88165e4239")));
      return {...out,rules:[...new Set(out.rules)]};
    }
    if(tool==='cycle'){
      if(!['cycle','processing'].includes(s.mode)||!['hour','minute'].includes(s.unit)||!Number.isInteger(s.minSamples)||s.minSamples<2||s.minSamples>1000||!Number.isFinite(s.hoursPerDay)||s.hoursPerDay<=0||s.hoursPerDay>24)throw Error((I18n.t("import-core.254e4b2b93")));
      return {mode:s.mode,unit:s.unit,minSamples:s.minSamples,hoursPerDay:s.hoursPerDay};
    }return {};
  }
  function validate(p){
    if(!p||p.version!==1||!Array.isArray(p.mappings)||!Array.isArray(p.presets)||p.mappings.length>50||p.presets.length>50)throw Error((I18n.t("import-core.dff2c8ab1b")));
    const clean=x=>{
      if(!x||!fields[x.tool]||!Array.isArray(x.headers)||!x.headers.length||x.headers.length>300||x.headers.some(h=>typeof h!=='string'||h.length>200))throw Error((I18n.t("import-core.defc876158")));
      const headers=x.headers.map(normalized);if(new Set(headers).size!==headers.length)throw Error((I18n.t("import-core.a72bd8ed34")));
      const m={...x.mapping};if(x.tool==='capability'&&m.lot===undefined)m.lot=lotColumn(headers,Object.values(m));return {tool:x.tool,headers,mapping:mapping(x.tool,m,headers.length)};
    };
    return {version:1,mappings:p.mappings.map(clean),presets:p.presets.map(x=>{
      const out=clean(x);if(typeof x.name!=='string'||!x.name.trim()||x.name.length>80||typeof x.auto!=='boolean')throw Error((I18n.t("import-core.15f4a3776f")));return {...out,name:x.name,auto:x.auto,settings:settings(x.tool,x.tool==='capability'&&x.mapping.lot===undefined&&x.settings?.order==='date'?{...x.settings,order:out.mapping.lot>=0?'lot':'input'}:x.settings)};
    })};
  }
  function read(storage){try{const raw=storage.getItem(KEY);return {data:raw?validate(JSON.parse(raw)):{version:1,mappings:[],presets:[]},error:null};}catch(e){return {data:{version:1,mappings:[],presets:[]},error:(I18n.t("import-core.68a68ea1d1"))};}}
  function write(storage,data){const clean=validate(data);storage.setItem(KEY,JSON.stringify(clean));return clean;}
  function match(entry,tool,headers){const names=headers.map(normalized);return new Set(names).size===names.length&&signature(entry.tool,entry.headers)===signature(tool,headers);}
  // Reuse the shared importer column hint; preserve ID text and stable source order for ties.
  function lotColumn(headers,used=[]){return Y.suggestColumns(headers.map((h,i)=>used.includes(i)?'':h)).lot;}
  const lotCollator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const compareLots=(a,b)=>lotCollator.compare(normalized(a),normalized(b));
  const api={lotColumn,compareLots,KEY,normalized,fields,signature,sheetRows,date,infer,mapping,settings,validate,read,write,match};root.ImportCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
