(function(root){
  'use strict';
  const VERSION=1, LIMITS={templates:100,documents:2000,pages:2000,rows:50000,words:30000,text:4000};
  const FIELDS=['product','productCode','lot','certificate','issueDate','inspectionDate','deliveryDate'];
  const COLUMNS=['item','result','unit','lsl','usl','method'];
  const META=['supplier','supplierId',...FIELDS];
  const STATUSES=['unconfirmed','confirmed','rejected'];
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const str=(v,max=LIMITS.text)=>{if(typeof v!=='string'||v.length>max)throw Error('document.invalidSchema');return v;};
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
  const compact=v=>norm(v).replace(/\s/g,'');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const optional=v=>v===undefined?'':str(v);
  const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error('document.invalidSchema');return v;};
  const strings=(v,max=40)=>array(v??[],max).map(x=>str(x,200)).filter(x=>x.trim());
  const bounded=v=>typeof v==='number'&&Number.isFinite(v);
  function box(v){if(v===null||v===undefined)return null;if(!Array.isArray(v)||v.length!==4||v.some(x=>!bounded(x)||x<0||x>1)||v[0]+v[2]>1.001||v[1]+v[3]>1.001)throw Error('document.invalidBox');return [...v];}
  const inside=(w,r)=>{const b=w.sourceBBox||w.bbox;return !r||b[0]+b[2]/2>=r[0]&&b[0]+b[2]/2<=r[0]+r[2]&&b[1]+b[3]/2>=r[1]&&b[1]+b[3]/2<=r[1]+r[3];};
  const union=words=>{if(!words.length)return null;const x=Math.min(...words.map(w=>w.bbox[0])),y=Math.min(...words.map(w=>w.bbox[1]));return [x,y,Math.max(...words.map(w=>w.bbox[0]+w.bbox[2]))-x,Math.max(...words.map(w=>w.bbox[1]+w.bbox[3]))-y];};
  const sourceUnion=words=>union(words.map(w=>({...w,bbox:w.sourceBBox||w.bbox})));
  function date(raw){const v=text(raw).normalize('NFKC'),m=v.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);if(!m)return '';const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(Date.UTC(y,mo-1,d));return y>=1900&&y<=2200&&dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?`${m[1]}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
  function number(raw){if(typeof raw==='number')return Number.isFinite(raw)&&!(Number.isInteger(raw)&&!Number.isSafeInteger(raw))?raw:null;if(typeof raw!=='string')return null;const s=raw.normalize('NFKC').trim().replace(/−/g,'-');if(!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s))return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)&&!(Number.isInteger(n)&&!Number.isSafeInteger(n))&&!(n===0&&/[1-9]/.test(s.split(/[eE]/)[0]))?n:null;}
  function parseResult(raw){
    if(typeof raw!=='string'&&typeof raw!=='number'&&raw!==null&&raw!==undefined)throw Error('document.invalidResult');
    const original=String(raw??''),s=original.normalize('NFKC').trim(),out={raw:original,numeric:null,qualifier:'text',lower:null,upper:null,nominal:null,tolerance:null};
    if(!s)return {...out,qualifier:'missing'};const exact=number(s);if(exact!==null)return {...out,numeric:exact,qualifier:'='};
    const relation=s.match(/^(<=|>=|<|>|≤|≥)\s*(.+)$/);if(relation){const n=number(relation[2]);if(n!==null){const q=relation[1].replace('≤','<=').replace('≥','>=');return {...out,qualifier:q,...(q[0]==='<'?{upper:n}:{lower:n})};}}
    if(/^(?:n\.?\s*d\.?|not\s+detected|不検出|検出せず)$/i.test(s))return {...out,qualifier:'ND'};
    if(/^(?:pass|合格|適合)$/i.test(s))return {...out,qualifier:'Pass'};if(/^(?:fail|不合格|不適合)$/i.test(s))return {...out,qualifier:'Fail'};
    if(/^(?:n\/?a|not applicable|該当なし|対象外)$/i.test(s))return {...out,qualifier:'N/A'};
    const tolerance=s.match(/^(.+?)\s*(?:±|\+\/-)\s*(.+)$/);if(tolerance){const a=number(tolerance[1]),b=number(tolerance[2]);if(a!==null&&b!==null&&b>=0&&Number.isFinite(a-b)&&Number.isFinite(a+b))return {...out,qualifier:'tolerance',nominal:a,tolerance:b,lower:a-b,upper:a+b};}
    const range=s.match(/^(.+?)\s*(?:–|—|~|〜|～|\bto\b|(?<=\d)\s*-\s*)\s*(.+)$/i);if(range){const a=number(range[1]),b=number(range[2]);if(a!==null&&b!==null&&a<=b)return {...out,qualifier:'range',lower:a,upper:b};}return out;
  }
  function aliases(v){if(v===undefined)return {};if(!object(v)||Object.keys(v).length>500)throw Error('document.invalidTemplate');const out={};for(const [k,val] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('document.invalidTemplate');str(k,200);out[k]=str(val,200);}return out;}
  // Patterns are a bounded literal prefix/suffix rule. The optional {value} token
  // captures text; user-provided regex and executable expressions are never run.
  function pattern(v){const s=optional(v);if(s.length>200||(s.match(/\{value\}/g)||[]).length>1)throw Error('document.invalidTemplate');return s;}
  function validateTemplate(t){
    if(!object(t)||t.schemaVersion!==VERSION)throw Error('document.invalidTemplate');
    const out={schemaVersion:VERSION,id:str(t.id,100),supplierId:str(t.supplierId,100),supplier:str(t.supplier,200),name:str(t.name,200),version:t.version,title:optional(t.title),keywords:strings(t.keywords),fields:{},table:{},aliases:{items:aliases(t.aliases?.items),products:aliases(t.aliases?.products)},continuationKeywords:strings(t.continuationKeywords)};
    if(!out.id.trim()||!out.supplier.trim()||!out.supplierId.trim()||!out.name.trim()||!Number.isInteger(out.version)||out.version<1||out.version>10000||!object(t.fields)||!object(t.table)||!object(t.table.columns))throw Error('document.invalidTemplate');
    for(const k of FIELDS){const f=t.fields[k]??{};if(!object(f))throw Error('document.invalidTemplate');out.fields[k]={labels:strings(f.labels),pattern:pattern(f.pattern),region:box(f.region)};}
    out.table={headerKeywords:strings(t.table.headerKeywords),columns:{},endKeywords:strings(t.table.endKeywords),region:box(t.table.region)};
    for(const k of COLUMNS)out.table.columns[k]=strings(t.table.columns[k]);
    if(!out.table.columns.item.length||!out.table.columns.result.length)throw Error('document.invalidTemplate');return out;
  }
  function validateTemplates(payload){if(!object(payload)||payload.schemaVersion!==VERSION)throw Error('document.invalidTemplate');const templates=array(payload.templates,LIMITS.templates).map(validateTemplate);if(new Set(templates.map(t=>t.id)).size!==templates.length)throw Error('document.duplicateTemplate');return {schemaVersion:VERSION,templates};}
  function defaults(){
    const common={product:['Product','Product Name','製品名','品名'],productCode:['Product Code','製品コード','品番'],lot:['Lot','Lot Number','Lot No','ロット番号','ロット'],certificate:['Certificate','Certificate No','成績書番号'],issueDate:['Issue Date','発行日'],inspectionDate:['Inspection Date','検査日'],deliveryDate:['Delivery Date','納品日']};
    return [{id:'aster',supplier:'Aster Materials',keywords:['Aster Materials'],title:'Certificate of Analysis'},{id:'aoba',supplier:'青葉試薬株式会社',keywords:['青葉試薬','Aoba Reagents'],title:'検査成績書'},{id:'northstar',supplier:'Northstar Polymers',keywords:['Northstar Polymers'],title:'Inspection Report'}].map(s=>validateTemplate({schemaVersion:1,id:s.id+'-v1',supplierId:s.id,supplier:s.supplier,name:s.supplier+' v1',version:1,title:s.title,keywords:s.keywords,fields:Object.fromEntries(FIELDS.map(k=>[k,{labels:common[k]}])),table:{headerKeywords:['Inspection Item','Result','検査項目','測定値'],columns:{item:['Inspection Item','Test Item','Item','検査項目','試験項目'],result:['Result','Value','測定値','結果','検査結果'],unit:['Unit','単位'],lsl:['LSL','Lower Limit','下限','規格下限'],usl:['USL','Upper Limit','上限','規格上限'],method:['Test Method','Method','試験方法','検査方法']},endKeywords:['END OF RESULTS','検査結果終了','Authorized Signature','承認者']},aliases:{items:{},products:{}},continuationKeywords:['Continued','Continuation','続き','継続'] }));
  }
  function page(input){
    if(!object(input))throw Error('document.invalidPage');const words=array(input.words||[],LIMITS.words).map(w=>{if(!object(w)||w.confidence!==null&&w.confidence!==undefined&&(!bounded(w.confidence)||w.confidence<0||w.confidence>100))throw Error('document.invalidPage');return {text:str(w.text),bbox:box(w.bbox),...(w.layoutBBox===undefined?{}:{layoutBBox:box(w.layoutBBox)}),confidence:w.confidence??null};});if(words.some(w=>!w.bbox))throw Error('document.invalidPage');
    return {id:str(input.id,200),fileId:optional(input.fileId),fileName:optional(input.fileName),pageNumber:input.pageNumber,width:input.width,height:input.height,words,text:input.text===undefined?words.map(w=>w.text).join(' '):str(input.text,500000),method:input.method==='ocr'?'ocr':'text',status:optional(input.status)};
  }
  function ocrOptions(input){
    if(input===undefined||input===null)return null;if(!object(input))throw Error('document.invalidPage');
    const allowed={language:['eng','jpn','eng+jpn','jpn+eng'],layout:['auto','block'],preprocess:['original','grayscale','contrast','binary']},out={};
    for(const [key,values] of Object.entries(allowed))if(input[key]!==undefined){if(!values.includes(input[key]))throw Error('document.invalidPage');out[key]=input[key];}
    for(const key of ['forceOCR','denoise'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')throw Error('document.invalidPage');out[key]=input[key];}
    if(input.rotation!==undefined){if(![0,90,180,270].includes(input.rotation))throw Error('document.invalidPage');out.rotation=input.rotation;}
    for(const [key,min,max] of [['deskew',-10,10],['scale',1,3]])if(input[key]!==undefined){if(!bounded(input[key])||input[key]<min||input[key]>max)throw Error('document.invalidPage');out[key]=input[key];}
    return out;
  }
  function revision(input){
    if(!object(input)||typeof input.at!=='string'||!Number.isFinite(Date.parse(input.at))||!['text','ocr'].includes(input.method)||!['completed','failed'].includes(input.status)||!Number.isInteger(input.wordCount)||input.wordCount<0||input.wordCount>LIMITS.words)throw Error('document.invalidPage');
    const value=str(input.text,200000),length=input.textLength??value.length,truncated=input.textTruncated??false;if(!Number.isInteger(length)||length<value.length||length>500000||typeof truncated!=='boolean'||!truncated&&length!==value.length)throw Error('document.invalidPage');
    const confidence=input.confidence??null;if(confidence!==null&&(!bounded(confidence)||confidence<0||confidence>100))throw Error('document.invalidPage');
    return {at:input.at,text:value,textLength:length,textTruncated:truncated,wordCount:input.wordCount,method:input.method,status:input.status,confidence,options:ocrOptions(input.options)};
  }
  function pageRevision(input,at=new Date().toISOString()){const p=validatePage(input);return revision({at,text:p.text.slice(0,200000),textLength:p.text.length,textTruncated:p.text.length>200000,wordCount:p.words.length,method:p.method,status:p.status,confidence:p.confidence,options:p.options});}
  function validatePage(input){
    const out=page(input);out.options=ocrOptions(input.options);out.revisions=array(input.revisions??[],5).map(revision);
    if(!out.id||!out.fileId||!out.fileName||!Number.isInteger(out.pageNumber)||out.pageNumber<1||out.pageNumber>10000||!bounded(out.width)||!bounded(out.height)||out.width<0||out.height<0||out.width>100000||out.height>100000||!['text','ocr'].includes(input.method)||!['completed','failed'].includes(out.status)||out.status==='completed'&&(!out.width||!out.height))throw Error('document.invalidPage');
    const confidence=input.confidence??null;if(confidence!==null&&(!bounded(confidence)||confidence<0||confidence>100))throw Error('document.invalidPage');out.confidence=confidence;
    out.timings={};for(const key of ['textMs','renderMs','preprocessMs','ocrMs','totalMs'])if(input.timings?.[key]!==undefined){const n=input.timings[key];if(!bounded(n)||n<0)throw Error('document.invalidPage');out.timings[key]=n;}
    if(input.errorCode!==undefined){const e=str(input.errorCode,100);if(!/^[A-Z_0-9]+$/.test(e))throw Error('document.invalidPage');out.errorCode=e;}
    return out;
  }
  function lines(words){
    const sorted=words.map(w=>({...w,sourceBBox:w.sourceBBox||w.bbox,bbox:w.layoutBBox||w.bbox})).filter(w=>w.text.trim()).sort((a,b)=>(a.bbox[1]+a.bbox[3]/2)-(b.bbox[1]+b.bbox[3]/2)||a.bbox[0]-b.bbox[0]),out=[];
    for(const w of sorted){const cy=w.bbox[1]+w.bbox[3]/2;let line=out[out.length-1];if(!line||Math.abs(cy-line.cy)>Math.max(.003,Math.min(w.bbox[3],line.height)*.55)){line={cy,height:w.bbox[3],words:[]};out.push(line);}line.words.push(w);}
    return out.map(l=>{l.words.sort((a,b)=>a.bbox[0]-b.bbox[0]);return {...l,text:l.words.map(w=>w.text).join(' '),bbox:union(l.words)};});
  }
  function anchors(line,labels){const found=[];for(let start=0;start<line.words.length;start++){let s='';for(let end=start;end<Math.min(line.words.length,start+10);end++){s+=line.words[end].text;const n=compact(s).replace(/[：:]$/,'');for(const label of labels)if(n===compact(label).replace(/[：:]$/,''))found.push({start,end,label,words:line.words.slice(start,end+1),bbox:union(line.words.slice(start,end+1))});}}return found.sort((a,b)=>b.end-b.start-(a.end-a.start));}
  function literalCapture(value,rule){if(!rule)return value;const parts=rule.split('{value}');if(parts.length===1)return norm(value).includes(norm(rule))?value:'';const a=norm(parts[0]),b=norm(parts[1]),n=norm(value);if(!n.startsWith(a)||b&&!n.endsWith(b))return '';return value.slice(parts[0].length,b?-parts[1].length:undefined).trim();}
  function fieldValue(ls,rule,allRules){
    const region=rule.region,candidates=[];
    for(const line of ls){
      const all=Object.values(allRules).flatMap(r=>anchors(line,r.labels));
      const matches=anchors(line,rule.labels).filter(a=>(!region||a.words.some(w=>inside(w,region)))&&!all.some(b=>b.start<=a.start&&b.end>=a.end&&(b.end-b.start)>(a.end-a.start)));
      for(const a of matches){
        const following=all.filter(x=>x.start>a.end).sort((x,y)=>x.start-y.start),end=following[0]?.start??line.words.length;
        let words=line.words.slice(a.end+1,end).filter(w=>!region||inside(w,region)),value=words.map(w=>w.text).join(' ').replace(/^\s*[:：]\s*/,'').trim();
        if(!value){const next=ls[ls.indexOf(line)+1];if(next&&next.bbox[1]-line.bbox[1]<.05){
          const left=a.bbox[0]-.01,right=following[0]?following[0].bbox[0]-.01:1;
          words=next.words.filter(w=>w.bbox[0]>=left&&w.bbox[0]<right&&(!region||inside(w,region)));
          const scoped={...next,words},hasAnotherLabel=Object.values(allRules).some(r=>anchors(scoped,r.labels).length);
          if(!hasAnotherLabel)value=words.map(w=>w.text).join(' ').trim();
        }}
        value=literalCapture(value,rule.pattern);if(value)candidates.push({value,bbox:sourceUnion(words)||sourceUnion(a.words)});
      }
    }
    if(!candidates.length&&region){const words=ls.flatMap(l=>l.words).filter(w=>inside(w,region));const value=literalCapture(words.map(w=>w.text).join(' ').trim(),rule.pattern);if(value)candidates.push({value,bbox:sourceUnion(words)});}
    const unique=[...new Set(candidates.map(x=>x.value))];return {value:candidates[0]?.value||'',bbox:candidates[0]?.bbox||null,ambiguous:unique.length>1};
  }
  function matchTemplate(p,templates){
    const n=compact(p.text),scores=templates.map(t=>{const keyword=t.keywords.filter(k=>n.includes(compact(k))).length,supplier=n.includes(compact(t.supplier)),title=t.title&&n.includes(compact(t.title)),headers=Object.values(t.table.columns).filter(labels=>labels.some(label=>n.includes(compact(label)))).length;return {template:t,score:(keyword?10:0)+(supplier?10:0)+(title?2:0)+headers,identified:!!(keyword||supplier)};}).filter(x=>x.identified).sort((a,b)=>b.score-a.score||b.template.version-a.template.version);
    if(!scores.length)return {template:null,ambiguous:false};const best=scores.filter(s=>s.score===scores[0].score);
    if(best.some(s=>s.template.supplierId!==best[0].template.supplierId)||best.filter(s=>s.template.version===best[0].template.version).length>1)return {template:null,ambiguous:true};
    return {template:scores[0].template,ambiguous:false};
  }
  function rowIssues(row){const issues=[];if(!row.item)issues.push('missingItem');if(row.qualifier==='missing')issues.push('missingResult');if(row.qualifier==='text')issues.push('nonNumericResult');if(row.confidence!==null&&row.confidence<80)issues.push('lowConfidence');if(row.lslRaw.trim()&&row.lsl===null||row.uslRaw.trim()&&row.usl===null||row.lsl!==null&&row.usl!==null&&row.lsl>=row.usl)issues.push('invalidSpecification');if(row.resultNumeric!==null&&(row.lsl!==null&&row.resultNumeric<row.lsl||row.usl!==null&&row.resultNumeric>row.usl))issues.push('outOfSpecification');return issues;}
  function originalRow(row){return Object.fromEntries(['item','method','resultRaw','unit','lslRaw','uslRaw','sourcePage','sourceFile','bbox','confidence'].map(k=>[k,clone(row[k]??null)]));}
  function makeRow(data){const parsed=parseResult(data.resultRaw??''),row={id:data.id,item:text(data.item),method:text(data.method),resultRaw:parsed.raw,resultNumeric:parsed.numeric,qualifier:parsed.qualifier,unit:text(data.unit),lslRaw:text(data.lslRaw),uslRaw:text(data.uslRaw),lsl:number(data.lslRaw),usl:number(data.uslRaw),sourcePage:data.sourcePage,sourceFile:data.sourceFile??'',bbox:data.bbox??null,confidence:data.confidence??null,issues:[],status:'unconfirmed',original:{},edits:[]};row.issues=rowIssues(row);row.original=originalRow(row);return row;}
  function tableRows(p,t,ls){
    const rows=[],issues=[];let headers=null,headerSeen=false;
    for(const line of ls){if(t.table.region&&!line.words.some(w=>inside(w,t.table.region)))continue;
      if(t.table.endKeywords.some(k=>compact(line.text).includes(compact(k)))){if(headerSeen)break;continue;}
      const hs=COLUMNS.map(k=>({key:k,anchor:anchors(line,t.table.columns[k])[0]})).filter(x=>x.anchor);
      if(hs.some(h=>h.key==='item')&&hs.some(h=>h.key==='result')){headers=hs.sort((a,b)=>a.anchor.bbox[0]-b.anchor.bbox[0]);headerSeen=true;continue;}
      if(!headers)continue;
      if(Object.values(t.fields).some(r=>anchors(line,r.labels).length)||t.continuationKeywords.some(k=>compact(line.text)===compact(k)))continue;
      const cells=Object.fromEntries(COLUMNS.map(k=>[k,[]]));
      for(const w of line.words){const x=w.bbox[0]+Math.min(w.bbox[2]/2,.008);let index=0;for(let i=1;i<headers.length;i++){const previous=headers[i-1].anchor.bbox,current=headers[i].anchor.bbox,boundary=(previous[0]+previous[2]+current[0])/2;if(x>=boundary)index=i;}cells[headers[index].key].push(w);}
      const val=k=>cells[k].map(w=>w.text).join(' ').trim();if(!val('item')&&!val('result'))continue;
      const resultWords=cells.result,confidences=line.words.map(w=>w.confidence).filter(v=>v!==null),r=makeRow({id:p.id+':r'+rows.length,item:val('item'),method:val('method'),resultRaw:val('result'),unit:val('unit'),lslRaw:val('lsl'),uslRaw:val('usl'),sourcePage:p.id,sourceFile:p.fileName,bbox:sourceUnion(resultWords.length?resultWords:line.words),confidence:confidences.length?Math.min(...confidences):null});
      const alias=Object.hasOwn(t.aliases.items,r.item)?t.aliases.items[r.item]:undefined;if(alias!==undefined)r.item=alias;const duplicate=rows.some(prev=>prev.item===r.item&&prev.method===r.method&&prev.unit===r.unit);if(duplicate)r.issues.push('duplicateItem');if(!val('item')||!val('result'))r.issues.push('ambiguousRow');rows.push(r);
    }
    if(!headerSeen)issues.push('tableNotFound');if(!rows.length)issues.push('noInspectionRows');return {rows,issues};
  }
  function extractPage(p,t,ambiguous=false){
    const d={schemaVersion:VERSION,id:'doc:'+p.id,templateId:t?.id||'',supplier:t?.supplier||'',supplierId:t?.supplierId||'',...Object.fromEntries(FIELDS.map(k=>[k,''])),pages:[p.id],sourceFile:p.fileName,fileId:p.fileId,pageRange:[p.pageNumber,p.pageNumber],rows:[],status:t?'identified':'unidentified',verification:'unconfirmed',issues:[],original:{},edits:[],fieldSources:{},continuation:false};
    if(!t){d.issues=[ambiguous?'ambiguousTemplate':'unidentifiedSupplier'];return d;}
    const ls=lines(p.words),tableStart=ls.findIndex(line=>anchors(line,t.table.columns.item).length&&anchors(line,t.table.columns.result).length),metadataLines=(tableStart>=0?ls.slice(0,tableStart):ls).filter(line=>!(t.title&&compact(line.text).includes(compact(t.title)))&&!/^certificate\s+page\b/i.test(line.text));
    for(const key of FIELDS){const f=fieldValue(metadataLines,t.fields[key],t.fields);d[key]=f.value;d.fieldSources[key]={sourcePage:p.id,bbox:f.bbox,raw:f.value};if(f.ambiguous)d.issues.push('ambiguousField:'+key);if(key.endsWith('Date')&&f.value){d[key]=date(f.value);if(!d[key])d.issues.push('invalidDate:'+key);}}
    if(Object.hasOwn(t.aliases.products,d.product))d.product=t.aliases.products[d.product];
    const result=tableRows(p,t,ls);d.rows=result.rows;d.issues.push(...result.issues);if(!d.product&&!d.productCode)d.issues.push('missingProduct');if(!d.lot)d.issues.push('missingLot');
    d.continuation=t.continuationKeywords.some(k=>compact(p.text).includes(compact(k)));d.original=Object.fromEntries(META.map(k=>[k,keyDateRaw(k,d)]));
    if(d.issues.length||d.rows.some(r=>r.issues.length))d.status='needsReview';return d;
  }
  function keyDateRaw(k,d){return d.fieldSources[k]?.raw??d[k];}
  function sameIdentity(a,b){return !!a.lot&&a.lot===b.lot&&!!(a.product||a.productCode)&&a.product===b.product&&a.productCode===b.productCode&&a.certificate===b.certificate&&a.supplierId===b.supplierId&&a.templateId===b.templateId&&['issueDate','inspectionDate','deliveryDate'].every(k=>!a[k]||!b[k]||a[k]===b[k]);}
  function extract(inputs,templateInputs=defaults(),options={}){
    const ps=array(inputs,LIMITS.pages).map(page),templates=array(templateInputs,LIMITS.templates).map(validateTemplate),documents=[];if(new Set(ps.map(p=>p.id)).size!==ps.length)throw Error('document.duplicatePage');
    for(const p of ps){const assigned=options.assignments?.[p.id],match=assigned?{template:templates.find(t=>t.id===assigned)||null,ambiguous:false}:matchTemplate(p,templates),d=extractPage(p,match.template,match.ambiguous),previous=documents[documents.length-1];
      if(assigned){const automatic=matchTemplate(p,templates);if(automatic.template&&automatic.template.supplierId!==d.supplierId){d.issues.push('supplierMismatch');d.status='needsReview';}}
      if(d.continuation&&previous&&d.fileId===previous.fileId&&d.pageRange[0]===previous.pageRange[1]+1&&sameIdentity(previous,d)){
        previous.pages.push(...d.pages);previous.pageRange[1]=d.pageRange[1];previous.rows.push(...d.rows);previous.issues=[...new Set([...previous.issues,...d.issues])];if(d.status!=='identified')previous.status='needsReview';
      }else{if(d.continuation){d.issues.push('unresolvedContinuation');d.status='needsReview';}else if(previous&&d.fileId===previous.fileId&&sameIdentity(previous,d)){d.issues.push('boundaryNeedsReview');d.status='needsReview';}documents.push(d);}
    }
    if(documents.reduce((n,d)=>n+d.rows.length,0)>LIMITS.rows)throw Error('document.tooManyRows');
    for(const d of documents){const units=new Map();for(const r of d.rows){const k=JSON.stringify([r.item,r.method]);if(!units.has(k))units.set(k,new Set());units.get(k).add(r.unit);}for(const r of d.rows)if(units.get(JSON.stringify([r.item,r.method])).size>1){r.issues.push('unitMismatch');d.status='needsReview';}const seen=new Map();for(const r of d.rows){const k=JSON.stringify([r.item,r.method,r.unit]);if(seen.has(k)){r.issues=[...new Set([...r.issues,'duplicateItem'])];seen.get(k).issues=[...new Set([...seen.get(k).issues,'duplicateItem'])];d.status='needsReview';}else seen.set(k,r);}if(!d.original||!Object.keys(d.original).length)d.original=Object.fromEntries(META.map(k=>[k,d[k]]));}
    return documents;
  }
  function audit(edits){return array(edits??[],500).map(e=>{if(!object(e)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at)))throw Error('document.invalidAudit');return {field:str(e.field,100),from:str(e.from),to:str(e.to),at:e.at};});}
  function validateRow(r){
    if(!object(r)||!STATUSES.includes(r.status))throw Error('document.invalidSchema');const row=makeRow({id:str(r.id,250),item:str(r.item),method:optional(r.method),resultRaw:str(r.resultRaw),unit:optional(r.unit),lslRaw:r.lslRaw===undefined?(r.lsl===null||r.lsl===undefined?'':String(r.lsl)):str(r.lslRaw),uslRaw:r.uslRaw===undefined?(r.usl===null||r.usl===undefined?'':String(r.usl)):str(r.uslRaw),sourcePage:str(r.sourcePage,200),sourceFile:optional(r.sourceFile),bbox:box(r.bbox),confidence:r.confidence??null});
    if(row.confidence!==null&&(!bounded(row.confidence)||row.confidence<0||row.confidence>100))throw Error('document.invalidSchema');
    if(r.resultNumeric!==undefined&&r.resultNumeric!==row.resultNumeric||r.qualifier!==undefined&&r.qualifier!==row.qualifier||r.lsl!==undefined&&r.lsl!==row.lsl||r.usl!==undefined&&r.usl!==row.usl)throw Error('document.invalidResult');
    row.status=r.status;row.issues=[...new Set([...strings(r.issues,100),...row.issues])];row.edits=audit(r.edits);
    if(r.original!==undefined){if(!object(r.original))throw Error('document.invalidSchema');row.original={item:optional(r.original.item),method:optional(r.original.method),resultRaw:optional(r.original.resultRaw),unit:optional(r.original.unit),lslRaw:optional(r.original.lslRaw),uslRaw:optional(r.original.uslRaw),sourcePage:optional(r.original.sourcePage),sourceFile:optional(r.original.sourceFile),bbox:box(r.original.bbox),confidence:r.original.confidence??null};if(row.original.confidence!==null&&(!bounded(row.original.confidence)||row.original.confidence<0||row.original.confidence>100))throw Error('document.invalidSchema');}return row;
  }
  function validateDocument(d){
    if(!object(d)||d.schemaVersion!==undefined&&d.schemaVersion!==VERSION||!['identified','needsReview','unidentified'].includes(d.status)||!STATUSES.includes(d.verification))throw Error('document.invalidSchema');
    const out={schemaVersion:VERSION,id:str(d.id,250),templateId:optional(d.templateId),...Object.fromEntries(META.map(k=>[k,optional(d[k])])),pages:strings(d.pages,LIMITS.pages),sourceFile:optional(d.sourceFile),fileId:optional(d.fileId),pageRange:array(d.pageRange??[],2),rows:array(d.rows,LIMITS.rows).map(validateRow),status:d.status,verification:d.verification,issues:strings(d.issues,100),original:{},edits:audit(d.edits),fieldSources:{},continuation:!!d.continuation};
    for(const k of FIELDS.filter(k=>k.endsWith('Date')))if(out[k]){if(!date(out[k]))throw Error('document.invalidDate');out[k]=date(out[k]);}
    if(out.pageRange.some(n=>!Number.isInteger(n)||n<1)||out.pageRange.length===2&&out.pageRange[0]>out.pageRange[1]||new Set(out.pages).size!==out.pages.length||new Set(out.rows.map(r=>r.id)).size!==out.rows.length||out.rows.some(r=>!out.pages.includes(r.sourcePage)))throw Error('document.invalidSchema');
    for(const k of META)out.original[k]=optional(d.original?.[k]);for(const k of FIELDS){const s=d.fieldSources?.[k];if(s)out.fieldSources[k]={sourcePage:str(s.sourcePage,200),bbox:box(s.bbox),raw:optional(s.raw)};}return out;
  }
  function validateDataset(payload){if(!object(payload)||payload.schemaVersion!==VERSION)throw Error('document.invalidSchema');const raw=array(payload.documents,LIMITS.documents);if(raw.reduce((n,d)=>n+(Array.isArray(d?.rows)?d.rows.length:0),0)>LIMITS.rows)throw Error('document.invalidSchema');const documents=raw.map(validateDocument);if(new Set(documents.map(d=>d.id)).size!==documents.length)throw Error('document.invalidSchema');return {schemaVersion:VERSION,documents};}
  function changed(edits,field,from,to,at){if(from!==to)edits.push({field,from:String(from??''),to:String(to??''),at:at||new Date().toISOString()});}
  function editDocument(input,patch,options={}){const d=validateDocument(input);if(!object(patch))throw Error('document.invalidEdit');let hasChanges=false;for(const key of META)if(Object.hasOwn(patch,key)){let value=str(patch[key]);if(key.endsWith('Date')&&value){if(!date(value))throw Error('document.invalidDate');value=date(value);}if(d[key]!==value){changed(d.edits,key,d[key],value,options.at);d[key]=value;hasChanges=true;}}if(hasChanges){d.verification='unconfirmed';d.status='needsReview';for(const r of d.rows)if(r.status!=='rejected')r.status='unconfirmed';d.issues=d.issues.filter(x=>!['missingProduct','missingLot'].includes(x));if(!d.product&&!d.productCode)d.issues.push('missingProduct');if(!d.lot)d.issues.push('missingLot');}return d;}
  function editRow(input,rowId,patch,options={}){const d=validateDocument(input),r=d.rows.find(r=>r.id===rowId);if(!r||!object(patch))throw Error('document.invalidEdit');for(const key of ['item','method','resultRaw','unit','lslRaw','uslRaw'])if(Object.hasOwn(patch,key)){const value=str(patch[key]);changed(r.edits,key,r[key],value,options.at);r[key]=value;}const updated=makeRow(r);Object.assign(r,{resultNumeric:updated.resultNumeric,qualifier:updated.qualifier,lsl:updated.lsl,usl:updated.usl,issues:updated.issues,status:'unconfirmed'});d.verification='unconfirmed';d.status='needsReview';return d;}
  function addRow(input,patch,options={}){const d=validateDocument(input),sourcePage=patch.sourcePage||d.pages[0];if(!d.pages.includes(sourcePage)||d.rows.length>=LIMITS.rows)throw Error('document.invalidEdit');let id=d.id+':manual:'+d.rows.length;while(d.rows.some(r=>r.id===id))id+='x';const r=makeRow({...patch,id,sourcePage,sourceFile:d.sourceFile});r.original={...r.original,item:'',method:'',resultRaw:'',unit:'',lslRaw:'',uslRaw:'',bbox:null,confidence:null};r.edits=[{field:'manualRow',from:'',to:'added',at:options.at||new Date().toISOString()}];r.issues.push('manualEntry');d.rows.push(validateRow(r));d.verification='unconfirmed';d.status='needsReview';return d;}
  function confirmable(d,r){return !!(d.supplier&&d.lot&&(d.product||d.productCode)&&r.item&&r.resultRaw.trim());}
  function confirmRow(input,rowId,options={}){const d=validateDocument(input),r=d.rows.find(r=>r.id===rowId);if(!r||!confirmable(d,r))throw Error('document.missingIdentity');if(r.issues.length&&!options.acknowledgeIssues)throw Error('document.acknowledgementRequired');r.status='confirmed';return d;}
  function confirmDocument(input,options={}){const d=validateDocument(input),rows=d.rows.filter(r=>r.status!=='rejected');if(!rows.length||rows.some(r=>!confirmable(d,r)))throw Error('document.missingIdentity');if((d.issues.length||rows.some(r=>r.issues.length))&&!options.acknowledgeIssues)throw Error('document.acknowledgementRequired');d.verification='confirmed';rows.forEach(r=>r.status='confirmed');return d;}
  function rejectRow(input,id){const d=validateDocument(input),r=d.rows.find(r=>r.id===id);if(!r)throw Error('document.invalidEdit');r.status='rejected';return d;}
  function rejectDocument(input){const d=validateDocument(input);d.verification='rejected';return d;}
  function splitDocument(input,pageId){const d=validateDocument(input),index=d.pages.indexOf(pageId);if(index<=0)throw Error('document.invalidSplit');const a=clone(d),b=clone(d);a.pages=d.pages.slice(0,index);b.pages=d.pages.slice(index);a.rows=d.rows.filter(r=>a.pages.includes(r.sourcePage));b.rows=d.rows.filter(r=>b.pages.includes(r.sourcePage));b.id=d.id+':split:'+pageId;for(const [doc,suffix] of [[a,'first'],[b,'second']]){doc.pageRange=[];doc.verification='unconfirmed';doc.status='needsReview';doc.issues=[...new Set([...doc.issues,'manualBoundary'])];doc.rows.forEach(r=>r.status=r.status==='rejected'?'rejected':'unconfirmed');changed(doc.edits,'boundary',d.pages.join(', '),doc.pages.join(', '));}return [a,b];}
  function mergeDocuments(inputs,options={}){if(!options.acknowledged)throw Error('document.acknowledgementRequired');const docs=array(inputs,LIMITS.documents).map(validateDocument);if(docs.length<2)throw Error('document.invalidMerge');const d=clone(docs[0]);for(const next of docs.slice(1)){if(META.some(k=>d[k]&&next[k]&&d[k]!==next[k]))throw Error('document.conflictingIdentity');for(const k of META)if(!d[k])d[k]=next[k];d.pages.push(...next.pages);d.rows.push(...next.rows);d.issues.push(...next.issues);d.edits.push(...next.edits);}if(new Set(d.pages).size!==d.pages.length)throw Error('document.duplicatePage');d.pages=[...new Set(d.pages)];d.pageRange=[];d.verification='unconfirmed';d.status='needsReview';d.issues=[...new Set([...d.issues,'manualBoundary'])];d.rows.forEach(r=>r.status=r.status==='rejected'?'rejected':'unconfirmed');changed(d.edits,'boundary',docs.map(x=>x.id).join(', '),d.id);return validateDocument(d);}
  const longHeaders=['Supplier','Product','Product Code','Lot','Certificate Number','Issue Date','Inspection Date','Delivery Date','Inspection Item','Test Method','Result Raw','Result Numeric','Result Qualifier','Unit','LSL','USL','Verification Status','Document Verification','Source File','Source Page','Source Bounding Box','OCR Confidence','Original Result Raw','Corrections','Issues'];
  function exportLong(inputs,options={}){const documents=array(inputs,LIMITS.documents).map(validateDocument),rows=[];for(const d of documents)for(const r of d.rows){if(options.confirmedOnly&&(d.verification!=='confirmed'||r.status!=='confirmed'))continue;rows.push([d.supplier,d.product,d.productCode,d.lot,d.certificate,d.issueDate,d.inspectionDate,d.deliveryDate,r.item,r.method,r.resultRaw,r.resultNumeric,r.qualifier,r.unit,r.lsl,r.usl,r.status,d.verification,r.sourceFile||d.sourceFile,r.sourcePage,JSON.stringify(r.bbox),r.confidence,r.original.resultRaw,JSON.stringify({document:d.edits,row:r.edits}),[...d.issues,...r.issues].join('; ')]);}return {headers:[...longHeaders],rows};}
  const measurementKey=r=>JSON.stringify([r.item,r.method,r.unit,r.lsl,r.usl]);
  function exportWide(inputs,options={}){const documents=array(inputs,LIMITS.documents).map(validateDocument),keys=new Map(),out=[];for(const d of documents){if(options.confirmedOnly&&d.verification!=='confirmed')continue;const row={meta:[d.supplier,d.product,d.productCode,d.lot,d.certificate,d.inspectionDate,d.verification,d.sourceFile],values:new Map()};for(const r of d.rows){if(options.confirmedOnly&&r.status!=='confirmed')continue;const k=measurementKey(r);if(!keys.has(k))keys.set(k,`${r.item} | method=${r.method||'—'} | unit=${r.unit||'—'} | LSL=${r.lsl??'—'} | USL=${r.usl??'—'}`);if(!row.values.has(k))row.values.set(k,[]);row.values.get(k).push(`${r.resultRaw} [${r.status}]`);}out.push(row);}return {headers:['Supplier','Product','Product Code','Lot','Certificate Number','Inspection Date','Document Verification','Source File',...keys.values()],rows:out.map(x=>[...x.meta,...[...keys.keys()].map(k=>(x.values.get(k)||[]).join(' ; '))])};}
  function analysisGroups(inputs){const docs=array(inputs,LIMITS.documents).map(validateDocument),groups=new Map();for(const d of docs){if(d.verification!=='confirmed'||!d.supplier||!d.lot||!(d.product||d.productCode))continue;for(const r of d.rows){if(r.status!=='confirmed'||r.qualifier!=='='||r.resultNumeric===null||!r.item||r.issues.includes('invalidSpecification'))continue;const key=JSON.stringify([d.supplierId,d.supplier,d.product,d.productCode,r.item,r.method,r.unit,r.lsl,r.usl]);if(!groups.has(key))groups.set(key,{key,supplier:d.supplier,supplierId:d.supplierId,product:d.product,productCode:d.productCode,item:r.item,method:r.method,unit:r.unit,lsl:r.lsl,usl:r.usl,rows:[],documentRefs:[],capabilityEligible:false,capabilityReason:'certificateSamplingRequiresReview'});const g=groups.get(key);g.rows.push({documentId:d.id,rowId:r.id,lot:d.lot,date:d.inspectionDate,value:r.resultNumeric,raw:r.resultRaw,sourcePage:r.sourcePage,sourceFile:r.sourceFile||d.sourceFile});if(!g.documentRefs.includes(d.id))g.documentRefs.push(d.id);}}
    const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});return [...groups.values()].map(g=>{g.rows.sort((a,b)=>collator.compare(a.lot,b.lot));g.table={headers:['Lot','Inspection Date','Product','Value'],rows:g.rows.map(r=>[r.lot,r.date,g.product||g.productCode,r.value])};g.mapping={lot:0,date:1,product:2,value:3};return g;});}
  function search(inputs,filters={}){const docs=array(inputs,LIMITS.documents).map(validateDocument);return docs.filter(d=>{if(filters.confirmedOnly!==false&&d.verification!=='confirmed')return false;for(const k of ['supplier','product','productCode','lot','certificate'])if(filters[k]&&!norm(d[k]).includes(norm(filters[k])))return false;for(const k of ['inspectionDate','deliveryDate']){if(filters[k]&&d[k]!==filters[k])return false;if(filters[k+'From']&&(!d[k]||d[k]<filters[k+'From']))return false;if(filters[k+'To']&&(!d[k]||d[k]>filters[k+'To']))return false;}if(filters.item&&!d.rows.some(r=>r.status==='confirmed'&&norm(r.item).includes(norm(filters.item))))return false;return true;});}
  const issueCodes=['missingItem','missingResult','nonNumericResult','lowConfidence','invalidSpecification','outOfSpecification','duplicateItem','ambiguousRow','tableNotFound','noInspectionRows','ambiguousTemplate','unidentifiedSupplier','missingProduct','missingLot','unresolvedContinuation','boundaryNeedsReview','supplierMismatch','unitMismatch','manualEntry','manualBoundary'];
  const api={issueCodes,VERSION,LIMITS,FIELDS,COLUMNS,STATUSES,defaults,date,number,parseResult,validateTemplate,validateTemplates,validatePage,pageRevision,validateDocument,validateDataset,lines,matchTemplate,extract,editDocument,editRow,addRow,confirmDocument,confirmRow,rejectDocument,rejectRow,splitDocument,mergeDocuments,exportLong,exportWide,analysisGroups,search};root.DocumentCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
