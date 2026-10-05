(function(root){
  'use strict';
  const I18n=root.I18n||(typeof require==='function'?require('./i18n.js'):null);
  const numeric=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string'||!v.trim())return null;const s=v.trim().replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/．/g,'.').replace(/−/g,'-');return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;};
  function analyze(raw,lsl=null,usl=null){
    if(lsl!==null&&!Number.isFinite(lsl)||usl!==null&&!Number.isFinite(usl))throw Error((I18n.t("core.dcab20df7e")));
    if(lsl!==null&&usl!==null&&lsl>=usl)throw Error((I18n.t("core.88165e4239")));
    if(lsl!==null&&usl!==null&&!Number.isFinite(usl-lsl))throw Error((I18n.t("core.139f1c65c5")));
    const records=raw.map((v,i)=>({value:numeric(v),index:i})).filter(r=>r.value!==null),v=records.map(r=>r.value),n=v.length;
    if(n<2)throw Error((I18n.t("core.6edc0a44af")));
    let mean=0,m2=0;v.forEach((x,i)=>{const d=x-mean;mean+=d/(i+1);m2+=d*(x-mean);});
    const sd=Math.sqrt(m2/(n-1)),mrs=[];records.forEach((r,i)=>{if(i&&r.index===records[i-1].index+1)mrs.push(Math.abs(r.value-records[i-1].value));});
    const mr=mrs.length?mrs.reduce((a,b)=>a+b,0)/mrs.length:null,within=mr===null?null:mr/1.128;
    const idx=s=>{if(s===null||s===0)return {cp:null,cpk:null};return {cp:lsl!==null&&usl!==null?(usl-lsl)/(6*s):null,cpk:lsl===null&&usl===null?null:Math.min(lsl===null?Infinity:(mean-lsl)/(3*s),usl===null?Infinity:(usl-mean)/(3*s))};};
    const a=idx(within),b=idx(sd),ucl=within===null?null:mean+3*within,lcl=within===null?null:mean-3*within;
    const oos=records.filter(r=>(lsl!==null&&r.value<lsl)||(usl!==null&&r.value>usl));
    const signals=within>0?records.filter(r=>r.value>ucl||r.value<lcl):[];
    if(!Number.isFinite(mean)||!Number.isFinite(sd)||within!==null&&!Number.isFinite(within))throw Error((I18n.t("core.bfa8a63566")));const sorted=[...v].sort((a,b)=>a-b);
    return {n,mean,sd,within,mr,lcl,ucl,cp:a.cp,cpk:a.cpk,pp:b.cp,ppk:b.cpk,min:sorted[0],max:sorted[n-1],median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,oos,signals,records,excluded:raw.length-n,lsl,usl};
  }
  function pareto(rows){
    const sums=new Map();let excluded=0;rows.forEach(r=>{const label=String(r[0]??'').trim(),value=numeric(r[1]);if(!label||value===null||value<0){excluded++;return;}sums.set(label,(sums.get(label)||0)+value);});
    const items=[...sums].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value),total=items.reduce((a,b)=>a+b.value,0);if(!Number.isFinite(total))throw Error((I18n.t("core.5b3f5278bf")));let cum=0;items.forEach(r=>{cum+=r.value;r.percent=total?r.value/total*100:0;r.cumulative=total?cum/total*100:0;});return {items,total,excluded};
  }
  function csv(text,delimiter){
    text=String(text).replace(/^\uFEFF/,'');if(!delimiter){let quoted=false,commas=0,tabs=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted){if(c==='\n'||c==='\r')break;if(c===',')commas++;if(c==='\t')tabs++;}}delimiter=tabs>commas?'\t':',';}
    const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else field+=c;}else if(c===delimiter&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error((I18n.t("core.af518506d2")));row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
  }
  function table(rows,header=true){
    if(!rows.length)throw Error((I18n.t("core.431f0d09f4")));const width=rows.reduce((m,r)=>Math.max(m,r.length),0);if(width>300)throw Error((I18n.t("core.ec8a2d8b3e")));const source=header?rows[0]:[];const headers=Array.from({length:width},(_,i)=>String(source[i]??'').trim()||`列 ${i+1}`);const data=rows.slice(header?1:0);while(data.length&&!data.at(-1).some(v=>v!==null&&v!==undefined&&String(v).trim()))data.pop();return {headers,rows:data};
  }
  function detectHeader(rows){
    const filled=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
    const key=v=>String(v??'').normalize('NFKC').trim().toLowerCase();
    const dataLike=v=>/^(?:未測定|未検査|欠測|欠損|n\/?a|n\.?d\.?|nan|null|[-—–－]+)$/i.test(key(v))||/^[<>≤≥~≈約]?\s*[+-]?[\d,.]+\s*(?:%|ppm|ppb|mg\/kg|mg\/l|g\/l|mpa[·・.]?s|cps|mm|cm|kg|g|°c|℃)?$/i.test(key(v))||/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(key(v));
    const label=v=>typeof v==='string'&&filled(v)&&numeric(v)===null&&!dataLike(v);
    const typed=v=>numeric(v)!==null||/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}/i.test(key(v));
    const known=v=>/粘度|濃度|揮発|^vi\s*[%％\[]|測定|検査|ロット|日付|日時|採取日|件数|数量|不良|分類|項目|単位|温度|圧力|密度|重量|時間|value|result|count|category|date|lot|sample|viscosity|product|start|end|製品|開始|終了/i.test(String(v));
    const first=rows.findIndex(r=>r.some(filled));
    if(first<0)throw Error((I18n.t("core.431f0d09f4")));
    const candidates=[];
    // Only inspect the opening 100 rows and a short sample beneath each candidate.
    // Numeric-looking labels alone cannot establish a header; keep those values as data.
    for(let i=0;i<Math.min(rows.length,100);i++){
      const row=rows[i],cells=row.map((v,c)=>({v,c})).filter(x=>filled(x.v));
      const labels=cells.filter(x=>label(x.v));
      if(!labels.length||labels.length/cells.length<.6)continue;
      const below=rows.slice(i+1,i+21).filter(r=>r.some(filled)).slice(0,8);
      if(!below.length)continue;
      const width=Math.min(300,Math.max(row.length,...below.map(r=>r.length)));
      const active=Array.from({length:width},(_,c)=>c).filter(c=>below.filter(r=>filled(r[c])).length>=Math.min(2,below.length));
      if(!active.length)continue;
      const numericCols=active.filter(c=>below.filter(r=>typed(r[c])).length/below.length>=.5);
      const transitions=labels.filter(x=>numericCols.includes(x.c));
      if(!transitions.length)continue;
      const coverage=active.filter(c=>label(row[c])).length/active.length;
      if(coverage<.5)continue;
      const unique=new Set(labels.map(x=>key(x.v))).size/labels.length;
      const immediate=transitions.filter(x=>typed(below[0][x.c])).length/transitions.length;
      // A title or group label preceding the real header must not win a single-column match.
      if(labels.length===1&&immediate===0)continue;
      const repeated=labels.filter(x=>below.some(r=>key(r[x.c])===key(x.v))).length/labels.length;
      const numericShare=(cells.length-labels.length)/cells.length;
      const score=4*transitions.length/Math.max(1,numericCols.length)+3*coverage+2*labels.length/cells.length+immediate+unique+Math.min(1,labels.filter(x=>known(x.v)).length*.25)-repeated-3*numericShare;
      candidates.push({headerRow:i+1,hasHeader:true,score,coverage,immediate,samples:below.length});
    }
    candidates.sort((a,b)=>b.score-a.score||a.headerRow-b.headerRow);
    if(candidates.length){
      const strong=candidates.filter(c=>c.score>=9&&c.coverage>=.75&&c.immediate>=.5&&c.samples>=2);
      if(strong.length>1){
        // Repeated headings or multiple tables must not silently discard the first table.
        const earliest=strong.reduce((a,b)=>a.headerRow<b.headerRow?a:b);
        return {headerRow:earliest.headerRow,hasHeader:true,confidence:'low',reason:'ambiguous'};
      }
      const best=candidates[0],gap=candidates[1]?best.score-candidates[1].score:Infinity;
      const confidence=best.score>=9&&best.coverage>=.75&&best.immediate>=.5&&best.samples>=2&&gap>=1?'high':'low';
      return {headerRow:best.headerRow,hasHeader:true,confidence,reason:confidence==='high'?'header':'ambiguous'};
    }
    const cells=rows[first].filter(filled),numericCount=cells.filter(v=>numeric(v)!==null).length;
    const hasNumeric=numericCount>0;
    return {headerRow:first+1,hasHeader:false,confidence:hasNumeric?'high':'low',reason:hasNumeric?'no-header':'no-candidate'};
  }
  function validateRCI(obj){
    if(!obj||obj.format!=='manufacturing-toolbox-rci'||![1,2].includes(obj.version)||!obj.project)throw Error((I18n.t("core.8e52241bdf")));
    const p=obj.project,text=v=>{if(typeof v!=='string'||v.length>20000)throw Error((I18n.t("core.2e580934ec")));return v;};
    const list=(key,fields,max)=>{if(!Array.isArray(p[key])||p[key].length>max)throw Error((I18n.t("core.e20603a5c3")));return p[key].map(r=>Object.fromEntries(fields.map(k=>[k,text(r[k])])));};
    const out=Object.fromEntries(['title','when','where','impact','immediate'].map(k=>[k,text(p[k])]));out.whys=list('whys',['cause','evidence','status'],20);out.timeline=list('timeline',['time','event'],300);out.actions=list('actions',['action','owner','due','status'],300);
    if(out.whys.some(w=>!['unknown','confirmed','rejected'].includes(w.status))||out.actions.some(a=>!['open','progress','done'].includes(a.status)))throw Error((I18n.t("core.848bdca44c")));
    if(obj.version===2){out.rootCause=text(p.rootCause);out.sourceEvidence=text(p.sourceEvidence);if(!Array.isArray(p.causeTree)||p.causeTree.length>50)throw Error((I18n.t("core.3b6705789f")));out.causeTree=p.causeTree.map((x,i)=>{if(!x||!Number.isInteger(x.parent)||x.parent< -1||x.parent>=i||!['unknown','confirmed','rejected'].includes(x.status))throw Error((I18n.t("core.2dc99f0d2f")));return {parent:x.parent,cause:text(x.cause),evidence:text(x.evidence),status:x.status};});}
    if(typeof p.isDemo==='boolean')out.isDemo=p.isDemo;
    return out;
  }
  const api={numeric,analyze,pareto,csv,table,detectHeader,validateRCI};root.ToolboxCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
