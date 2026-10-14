'use strict';
/** Re-score actual OCR preprocessing experiments without replacing the baseline.
 * Each variant uses only the pages actually reprocessed. All other pages retain
 * the baseline engine output. This is an explicit comparison, not auto-selection.
 * Usage: node tests/document-accuracy-compare.cjs baseline.json experiments.json output.json
 */
const fs=require('node:fs'),path=require('node:path'),D=require('../dist/document-core.js'),A=require('./document-accuracy.cjs');
const [baselineFile,experimentFile,outputFile]=process.argv.slice(2);
if(!baselineFile||!experimentFile||!outputFile)throw Error('Provide baseline, actual experiment JSON, and output paths.');
const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8')),pages=A.readPages(baseline),experiments=JSON.parse(fs.readFileSync(experimentFile,'utf8'));
const truth=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/documents/ground-truth.json'),'utf8'));
if(pages.length!==20||!Array.isArray(experiments))throw Error('Expected a complete20page baseline and experiment array.');
const reports=experiments.map((input,index)=>{
 const result=input.result||input,reprocessed=A.readPages(result),replacement=new Map(reprocessed.map(p=>[p.pageNumber,p]));
 const merged=pages.map(p=>replacement.has(p.pageNumber)?{...replacement.get(p.pageNumber),id:p.id,fileId:p.fileId,fileName:p.fileName}:p);
 const report=A.evaluate(truth,merged,D.extract(merged,D.defaults()),{options:input.options||reprocessed[0]?.options||null,reprocessedPages:[...replacement.keys()],timings:result.timings||null});
 return {index,...report};
});
fs.writeFileSync(outputFile,JSON.stringify({schemaVersion:1,baseline:path.basename(baselineFile),experiments:path.basename(experimentFile),note:'Each experiment replaces only its explicitly reprocessed pages; this is not a benchmark of an automatic production policy.',reports},null,2)+'\n');
console.log(JSON.stringify(reports.map(r=>({index:r.index,options:r.metadata.options,pages:r.metadata.reprocessedPages,itemValuePair:r.accuracy.itemValuePair,value:r.accuracy.value,minimumCorrectionCells:r.review.minimumCorrectionCells})),null,2));
