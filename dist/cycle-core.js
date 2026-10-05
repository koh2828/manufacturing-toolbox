(function(root){
  'use strict';
  const I18n=root.I18n||(typeof require==='function'?require('./i18n.js'):null);
  const DAY=86400000;
  const text=v=>String(v??'').trim();
  function timestamp(value,date1904=false){
    if(typeof value==='number'){
      if(!Number.isFinite(value)||value<(date1904?0:1)||value>2958465||!date1904&&Math.floor(value)===60)return null;
      const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,value<60?31:30);
      return {ms:base+Math.round(value*DAY),kind:'wall'};
    }
    if(typeof value!=='string')return null;
    const s=value.normalize('NFKC').trim();
    const m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
    if(!m)return null;
    const [y,mo,d,h,mi,se]=[m[1],m[2],m[3],m[4],m[5],m[6]||0].map(Number);
    if(y<1900||mo<1||mo>12||d<1||h>23||mi>59||se>59)return null;
    const ms=Date.UTC(y,mo-1,d,h,mi,se,Number((m[7]||'').padEnd(3,'0'))),date=new Date(ms);
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
    let offset=0;
    if(m[8]&&m[8].toUpperCase()!=='Z'){
      const z=m[8].replace(':',''),zh=Number(z.slice(1,3)),zm=Number(z.slice(3));
      if(zh>14||zm>59||zh===14&&zm!==0)return null;
      offset=(z[0]==='-'?-1:1)*(zh*60+zm)*60000;
    }
    return {ms:ms-offset,kind:m[8]?'instant':'wall'};
  }
  // R7: linear interpolation at zero-based rank (n - 1) * p.
  function percentile(values,p){
    if(!Number.isFinite(p)||p<0||p>1||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error((I18n.t("cycle-core.eef0fedf1d")));
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b),rank=(sorted.length-1)*p,lo=Math.floor(rank);
    return sorted[lo]+(sorted[Math.min(lo+1,sorted.length-1)]-sorted[lo])*(rank-lo);
  }
  function summary(values,minSamples){
    const n=values.length,status=n<minSamples?'insufficient':n<20?'reference':'available';
    return {n,status,p25:n<minSamples?null:percentile(values,.25),p50:n<minSamples?null:percentile(values,.5)};
  }
  function suggestColumns(headers){
    const find=re=>headers.findIndex(h=>re.test(text(h).normalize('NFKC')));
    return {product:find(/製品|品番|品目|product|material|sku/i),lot:find(/ロット|バッチ|lot|batch/i),start:find(/start|開始|着手/i),end:find(/end|finish|終了|完了/i),equipment:find(/設備|ライン|装置|equipment|machine|line/i)};
  }
  function analyze(rows,columns,{minSamples=5,date1904=false}={}){
    if(!Number.isInteger(minSamples)||minSamples<2||minSamples>1000)throw Error((I18n.t("cycle-core.7e0764daac")));
    const fields=['product','lot','start','end'];
    if(fields.some(k=>!Number.isInteger(columns[k])||columns[k]<0))throw Error((I18n.t("cycle-core.fbd1640f5f")));
    const selected=fields.map(k=>columns[k]);if(columns.equipment>=0)selected.push(columns.equipment);
    if(new Set(selected).size!==selected.length)throw Error((I18n.t("cycle-core.c819c8c061")));
    let blankRows=0;
    const records=[];
    rows.forEach((row,index)=>{
      if(!row.some(v=>text(v))){blankRows++;return;}
      const a=timestamp(row[columns.start],date1904),b=timestamp(row[columns.end],date1904);
      const r={index,product:text(row[columns.product]),lot:text(row[columns.lot]),equipment:columns.equipment>=0?text(row[columns.equipment]):'単一工程',start:a?.ms??null,end:b?.ms??null,kind:a?.kind||b?.kind||'wall',timeKinds:[a?.kind,b?.kind].filter(Boolean),errors:[],overlap:false,processing:null,gap:null,cycle:null,nextStart:null,nextProduct:'',nextLot:'',cycleReason:''};
      if(!r.product)r.errors.push((I18n.t("cycle-core.3cada180a2")));if(!r.lot)r.errors.push((I18n.t("cycle-core.af0e325733")));if(!r.equipment)r.errors.push((I18n.t("cycle-core.161584cc94")));
      if(!a)r.errors.push((I18n.t("cycle-core.525077a585")));if(!b)r.errors.push((I18n.t("cycle-core.db4ce7d72d")));
      if(a&&b&&b.ms<=a.ms)r.errors.push((I18n.t("cycle-core.53084dd670")));
      records.push(r);
    });
    // Mixing civil Excel dates with explicitly zoned instants can corrupt every interval.
    const mixedTimezones=new Set(records.flatMap(r=>r.timeKinds)).size>1;
    if(mixedTimezones)records.forEach(r=>r.errors.push((I18n.t("cycle-core.b263854b69"))));
    const duplicates=new Map();
    for(const r of records){if(!r.product||!r.lot||!r.equipment)continue;const key=JSON.stringify([r.equipment,r.product,r.lot]);if(!duplicates.has(key))duplicates.set(key,[]);duplicates.get(key).push(r);}
    for(const list of duplicates.values())if(list.length>1)list.forEach(r=>r.errors.push((I18n.t("cycle-core.7cf8e8899b"))));
    const lines=new Map();for(const r of records){if(!lines.has(r.equipment))lines.set(r.equipment,[]);lines.get(r.equipment).push(r);if(!r.errors.length)r.processing=(r.end-r.start)/60000;}
    const missingEquipment=records.some(r=>!r.equipment);
    let blockedLines=0;
    for(const list of lines.values()){
      const unknownOrder=missingEquipment||list.some(r=>r.start===null)||mixedTimezones;
      if(unknownOrder)blockedLines++;
      const ordered=list.filter(r=>r.start!==null).sort((a,b)=>a.start-b.start||a.index-b.index);
      let cluster=[],until=-Infinity;
      const flush=()=>{if(cluster.length>1)cluster.forEach(r=>r.overlap=true);};
      for(const r of ordered){if(r.end===null||r.end<=r.start)continue;if(r.start>=until){flush();cluster=[];until=-Infinity;}cluster.push(r);until=Math.max(until,r.end);}flush();
      for(let i=0;i<ordered.length;i++){
        const r=ordered[i],next=ordered[i+1];
        if(next){r.nextStart=next.start;r.nextProduct=next.product;r.nextLot=next.lot;}
        if(unknownOrder)r.cycleReason=(I18n.t("cycle-core.d64c545c53"));
        else if(r.errors.length)r.cycleReason=(I18n.t("cycle-core.1f8aef8c6b"));
        else if(!next)r.cycleReason=(I18n.t("cycle-core.c982f0574f"));
        else if(next.errors.length)r.cycleReason=(I18n.t("cycle-core.64a28f83f7"));
        else if(r.overlap||next.overlap||next.start<r.end)r.cycleReason=(I18n.t("cycle-core.0ad96c3465"));
        else{r.gap=(next.start-r.end)/60000;r.cycle=(next.start-r.start)/60000;}
      }
      list.filter(r=>r.start===null).forEach(r=>r.cycleReason=(I18n.t("cycle-core.525077a585")));
    }
    const grouped=new Map();
    for(const r of records){if(!r.product)continue;const key=JSON.stringify([r.equipment,r.product]);if(!grouped.has(key))grouped.set(key,{key,product:r.product,equipment:r.equipment||'未指定',total:0,processing:[],gap:[],cycle:[]});const g=grouped.get(key);g.total++;for(const metric of ['processing','gap','cycle'])if(r[metric]!==null)g[metric].push(r[metric]);}
    const groups=[...grouped.values()].map(g=>({...g,processing:summary(g.processing,minSamples),gap:summary(g.gap,minSamples),cycle:summary(g.cycle,minSamples)})).sort((a,b)=>a.equipment.localeCompare(b.equipment,'ja')||a.product.localeCompare(b.product,'ja'));
    return {records,groups,blankRows,mixedTimezones,blockedLines,invalidRows:records.filter(r=>r.errors.length).length,overlapRows:records.filter(r=>r.overlap).length,processingCount:records.filter(r=>r.processing!==null).length,cycleCount:records.filter(r=>r.cycle!==null).length,minSamples};
  }
  const api={timestamp,percentile,summary,suggestColumns,analyze};root.CycleCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
