'use strict';
/** Compare real DocumentEngine output against generated ground truth.
 * No OCR text is synthesized by this runner. Unit tests use deliberate scorer
 * fixtures and are explicitly not included in reported OCR accuracy.
 * Usage: node tests/document-accuracy.cjs /path/to/engine-result.json [output.json]
 */
const fs=require('node:fs'),path=require('node:path');
const D=require('../dist/document-core.js');
const TRUTH=path.join(__dirname,'fixtures/documents/ground-truth.json');
const text=value=>String(value??'').trim().replace(/\s+/g,' ');
const exact=(a,b)=>text(a)===text(b);
const noWhitespace=(a,b)=>String(a??'').replace(/\s/g,'')===String(b??'').replace(/\s/g,'');
const ratio=(correct,total)=>({correct,total,percent:total?Math.round(correct/total*10000)/100:null});
const center=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)?b[1]+b[3]/2:null;
const fieldMap={productName:'product',productCode:'productCode',lot:'lot',certificateNumber:'certificate',issueDate:'issueDate',inspectionDate:'inspectionDate',deliveryDate:'deliveryDate'};
const rowMap={item:'item',raw:'resultRaw',unit:'unit',lsl:'lslRaw',usl:'uslRaw',method:'method'};

function readPages(input){
 if(Array.isArray(input))return input.flatMap(x=>x.pages||[x]);
 if(Array.isArray(input.pages))return input.pages;
 for(const key of ['result','engine','baseline'])if(input[key]?.pages)return input[key].pages;
 if(Array.isArray(input.results))return input.results.flatMap(x=>x.pages||[]);
 throw Error('Actual engine output must include a pages array.');
}
function matchRows(expected,actual){
 // Association is based only on source-page row order and geometry, never the
 // item's text or measurement. Wrong item/value pairing remains an error.
 const e=expected.map((r,i)=>({r,i,y:center(r.bbox)}));
 const a=actual.map((r,i)=>({r,i,y:center(r.bbox)}));
 if(e.some(x=>x.y===null)||a.some(x=>x.y===null))return {pairs:e.map((x,i)=>[x.i,a[i]?.i??null]),extra:a.slice(e.length).map(x=>x.i),method:'ordinal (missing box)'};
 const gap=.028,dp=Array.from({length:e.length+1},()=>Array(a.length+1).fill(Infinity));
 const step=Array.from({length:e.length+1},()=>Array(a.length+1).fill(null));dp[0][0]=0;
 for(let i=0;i<=e.length;i++)for(let j=0;j<=a.length;j++){
   const cost=dp[i][j];
   if(i<e.length&&cost+gap<dp[i+1][j]){dp[i+1][j]=cost+gap;step[i+1][j]='expected';}
   if(j<a.length&&cost+gap<dp[i][j+1]){dp[i][j+1]=cost+gap;step[i][j+1]='actual';}
   if(i<e.length&&j<a.length){const delta=Math.abs(e[i].y-a[j].y);if(delta<.045&&cost+delta<dp[i+1][j+1]){dp[i+1][j+1]=cost+delta;step[i+1][j+1]='pair';}}
 }
 const pairs=[],extra=[];let i=e.length,j=a.length;
 while(i||j){const s=step[i][j];if(s==='pair'){pairs.push([--i,--j]);}else if(s==='expected'){pairs.push([--i,null]);}else if(s==='actual'){extra.push(--j);}else throw Error('Invalid row alignment');}
 return {pairs:pairs.reverse(),extra:extra.reverse(),method:'source-page vertical geometry / monotonic alignment'};
}
function evaluate(truth,pages,documents,meta={}){
 const pageMap=new Map(pages.map(p=>[p.id,p.pageNumber]));
 const actualPageDocs=new Map();
 for(const doc of documents)for(const id of doc.pages||[]){const number=pageMap.get(id);if(number!==undefined){if(!actualPageDocs.has(number))actualPageDocs.set(number,[]);actualPageDocs.get(number).push(doc);}}
 const expectedStarts=new Set(truth.documents.slice(1).map(d=>d.sourcePages[0]));
 const actualStarts=new Set(documents.flatMap(d=>{const n=(d.pages||[]).map(id=>pageMap.get(id)).filter(Number.isFinite);return n.length&&Math.min(...n)>1?[Math.min(...n)]:[];}));
 let tp=0,fp=0,fn=0,boundaryCorrect=0;
 for(let n=2;n<=truth.pageCount;n++){const e=expectedStarts.has(n),a=actualStarts.has(n);if(e===a)boundaryCorrect++;if(e&&a)tp++;else if(a)fp++;else if(e)fn++;}
 const totals={supplier:0,product:0,lot:0,item:0,value:0,pairing:0,whitespacePairing:0,rowCells:0,metadataCells:0};
 let lotTotal=0,rowsMissing=0,extraRows=0,reviewPages=0,unidentifiedPages=0,ambiguousPageMembership=0,unflaggedMismatchedRows=0;
 const details=[],metadataMismatches=[];
 for(const expectedDoc of truth.documents){
   const doc=actualPageDocs.get(expectedDoc.sourcePages[0])?.[0];
   if(!exact(expectedDoc.supplierName,doc?.supplier)){metadataMismatches.push({documentId:expectedDoc.id,field:'supplier',expected:expectedDoc.supplierName,actual:doc?.supplier??''});totals.metadataCells++;}
   for(const [key,target] of Object.entries(fieldMap))if(!exact(expectedDoc.fields[key],doc?.[target])){metadataMismatches.push({documentId:expectedDoc.id,field:key,expected:expectedDoc.fields[key],actual:doc?.[target]??''});totals.metadataCells++;}
 }
 for(const p of truth.pages){
   const candidates=actualPageDocs.get(p.pageNumber)||[],doc=candidates[0];
   if(candidates.length>1)ambiguousPageMembership++;
   const supplierCorrect=doc?.supplierId===p.supplierId;
   const productCorrect=exact(p.fields.productName,doc?.product);
   const lotPresent=!!p.fields.lot,lotCorrect=lotPresent&&exact(p.fields.lot,doc?.lot);
   if(supplierCorrect)totals.supplier++;if(productCorrect)totals.product++;if(lotPresent){lotTotal++;if(lotCorrect)totals.lot++;}
   if(!doc||doc.status==='unidentified'||!doc.supplierId)unidentifiedPages++;
   if(doc?.status==='needsReview'||doc?.issues?.length||doc?.rows?.some(r=>r.issues?.length))reviewPages++;
   const actual=documents.flatMap(d=>d.rows||[]).filter(r=>pageMap.get(r.sourcePage)===p.pageNumber).sort((a,b)=>(center(a.bbox)??0)-(center(b.bbox)??0));
   const aligned=matchRows(p.rows,actual),rowResults=[];extraRows+=aligned.extra.length;
   for(const [ei,ai] of aligned.pairs){
     const e=p.rows[ei],a=ai===null?null:actual[ai];if(!a)rowsMissing++;
     const itemCorrect=!!a&&exact(e.item,a.item),valueCorrect=!!a&&exact(e.raw,a.resultRaw);
     if(a&&noWhitespace(e.item,a.item)&&noWhitespace(e.raw,a.resultRaw))totals.whitespacePairing++;
     if(itemCorrect)totals.item++;if(valueCorrect)totals.value++;if(itemCorrect&&valueCorrect)totals.pairing++;if(a&&(!itemCorrect||!valueCorrect)&&!(a.issues||[]).length)unflaggedMismatchedRows++;
     const cells=[];
     for(const [key,target] of Object.entries(rowMap))if(!exact(e[key],a?.[target])){cells.push({field:key,expected:e[key],actual:a?.[target]??''});totals.rowCells++;}
     rowResults.push({expectedId:e.id,matchedRowId:a?.id??null,itemCorrect,valueCorrect,pairingCorrect:itemCorrect&&valueCorrect,cells});
   }
   details.push({page:p.pageNumber,status:doc?.status||'missing',verification:doc?.verification||'missing',documentIssues:doc?.issues||[],rowsWithIssues:actual.filter(r=>(r.issues||[]).length).length,mismatchedRowCells:rowResults.reduce((n,r)=>n+r.cells.length,0),method:pages.find(x=>x.pageNumber===p.pageNumber)?.method??'missing',degradation:p.degradation,supplierCorrect,productCorrect,lotCorrect:lotPresent?lotCorrect:null,alignment:aligned.method,extraRows:aligned.extra.length,rows:rowResults});
 }
 const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;
 return {schemaVersion:1,generatedAt:new Date().toISOString(),synthetic:true,sourceFile:meta.sourceFile||truth.sourceFile,
   evaluatedPageCount:truth.pageCount,actualPageCount:pages.length,expectedDocuments:truth.documentCount,actualDocuments:documents.length,
   expectedRows:truth.inspectionRowCount,actualRows:documents.reduce((n,d)=>n+d.rows.length,0),
   method:'Exact text after outer trimming and whitespace folding only. No case folding, numeric conversion, aliasing, or Unicode correction. Row association uses source-page geometry, not recognized text.',
   validationScope:'Development corpus, not unseen real-world or independent supplier validation.',
   boundary:{adjacentDecisions:ratio(boundaryCorrect,truth.pageCount-1),truePositive:tp,falsePositive:fp,falseNegative:fn,precision:Math.round(precision*10000)/100,recall:Math.round(recall*10000)/100,f1:Math.round((precision+recall?2*precision*recall/(precision+recall):0)*10000)/100},
   secondaryAccuracy:{whitespaceInsensitiveItemValuePair:ratio(totals.whitespacePairing,truth.inspectionRowCount),definition:'Remove whitespace only from expected and extracted item names and raw values, after the same geometry-only row association. No Unicode, case, punctuation, digit, fuzzy, or alias correction. Production values remain unchanged.'},
   accuracy:{supplier:ratio(totals.supplier,truth.pageCount),product:ratio(totals.product,truth.pageCount),lot:ratio(totals.lot,lotTotal),item:ratio(totals.item,truth.inspectionRowCount),value:ratio(totals.value,truth.inspectionRowCount),itemValuePair:ratio(totals.pairing,truth.inspectionRowCount)},
   review:{unidentifiedPages,needsReviewPages:reviewPages,documentsByStatus:Object.fromEntries(['identified','needsReview','unidentified'].map(s=>[s,documents.filter(d=>d.status===s).length])),rowsWithIssues:documents.flatMap(d=>d.rows||[]).filter(r=>(r.issues||[]).length).length,unflaggedMismatchedRows,unconfirmedDocuments:documents.filter(d=>d.verification!=='confirmed').length,missingRows:rowsMissing,extraRows,ambiguousPageMembership,
     mismatchedMetadataCells:totals.metadataCells,mismatchedRowCells:totals.rowCells,minimumCorrectionCells:totals.metadataCells+totals.rowCells,
     correctionDefinition:'Mismatched target cells across one metadata set per expected certificate and six cells per expected row; counts absent expected values, does not count extra rows or boundary-review operations. This is not measured user correction effort.'},
   metadata:meta,metadataMismatches,pages:details};
}
function main(){
 const inputFile=process.argv[2];if(!inputFile)throw Error('Provide a real engine-result JSON path.');
 const input=JSON.parse(fs.readFileSync(inputFile,'utf8')),truth=JSON.parse(fs.readFileSync(TRUTH,'utf8')),pages=readPages(input);
 if(pages.length!==truth.pageCount||new Set(pages.map(p=>p.pageNumber)).size!==truth.pageCount)throw Error('Accuracy report requires all20distinct pages, including failed pages.');
 const documents=D.extract(pages,D.defaults());
 const metadata={sourceFile:input.result?.fileName||input.fileName||input.metrics?.fixture||truth.sourceFile,engineInput:path.basename(inputFile),engineTimings:input.timings||input.result?.timings||null,environment:input.environment||input.metrics?.userAgent||null,options:input.options||pages[0]?.options||null,performance:input.performance||input.metrics||null};
 const report=evaluate(truth,pages,documents,metadata);
 const out=process.argv[3]||path.join(path.dirname(inputFile),'document-accuracy-result.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({output:out,...Object.fromEntries(Object.entries(report).filter(([k])=>!['pages','metadataMismatches'].includes(k)))},null,2));
}
module.exports={evaluate,matchRows,readPages};if(require.main===module)main();
