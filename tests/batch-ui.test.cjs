const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const B=require('../dist/batch-core.js'),W=require('../dist/workflow-config.js'),I18n=require('../dist/i18n.js');
function harness(){
 const table={headers:['Batch','Product','Equipment','Step','Start','End','Target'],rows:[]};
 for(const month of ['09','10'])for(let n=1;n<=6;n++)for(const [step,start,end] of [['Heat','08:00','10:00'],['Cool','11:00',n===6?'15:00':'12:00']])table.rows.push([`${month}-B${n}`,'Product','R1',step,`2026-${month}-${String(n).padStart(2,'0')} ${start}`,`2026-${month}-${String(n).padStart(2,'0')} ${end}`,60]);
 const source={id:'b',name:'synthetic.xlsx',sheet:'Steps',table,mapping:{batch:0,product:1,equipment:2,step:3,start:4,end:5,target:6}},normalized=B.normalize([source]),settings=W.settings('batch',{from:'2026-10-01',to:'2026-10-31',previousFrom:'2026-09-01',previousTo:'2026-09-30',displayUnit:'hour'}),result=B.analyze(normalized.records,settings);result.normalized=normalized;
 const w={sources:[source],settings,result},state={view:'batch',workflows:{batch:w},imports:{}};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context={state,I18n,BatchCore:B,esc:escape,fmt:(v,n=3)=>v===null||!Number.isFinite(v)?'—':v.toLocaleString(I18n.numberLocale,{maximumFractionDigits:n}),wt:(k,p=[])=>I18n.t(k.includes('.')?k:'workflow.'+k,p),wfState:()=>w,chartBase:(w,h,html,label)=>`<svg viewBox="0 0 ${w} ${h}" aria-label="${escape(label)}">${html}</svg>`,paretoChart:r=>`<svg data-pareto-total="${r.total}"></svg>`};
 vm.createContext(context);for(const file of ['reports.js','recurring-ui.js','batch-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context,{filename:file});return {context,w,state};
}
test('バッチUI: compact seven-column all-data summary includes pooled batch percentiles',()=>{
 I18n.setLanguage('en');const h=harness(),html=h.context.renderBatchResults(h.w);assert.match(html,/Batch elapsed-time distributions/);assert.match(html,/IQR candidates/);assert.match(html,/P95/);assert.equal(h.context.batchCompactStats(h.w.result.batchGroups)[0].length,7);assert.equal(h.context.batchCompactStats(h.w.result.batchGroups)[1][1],6);assert.equal(h.context.batchCompactStats(h.w.result.batchGroups)[1][2],4.5);
});
test('バッチUI: count remains integer while time metrics, Pareto and deltas use display hours',()=>{
 const h=harness(),c=h.context;assert.equal(c.batchValue(120,'mean'),2);assert.equal(c.batchValue(12,'n'),12);const p=c.batchParetoResult({total:120,items:[{value:120,percent:100,cumulative:100}]},h.w.settings);assert.equal(p.total,2);assert.equal(p.items[0].value,2);assert.equal(p.items[0].percent,100);assert.match(c.batchComparisonSection(h.w.result,h.w.settings),/4\.5/);assert.match(c.batchComparisonSection(h.w.result,h.w.settings),/<rect/);
});
test('バッチUI: unknown batch bounds show only observed valid intervals without epoch/NaN',()=>{
 const h=harness(),b=h.w.result.batches[0],partial={...b,start:null,end:null,complete:false};const html=h.context.batchTimeline([partial]);assert.match(html,/Only valid recorded intervals/);assert.match(html,/2026-10-01/);assert.doesNotMatch(html,/1970|NaN|Infinity/);assert.match(html,/<svg/);
 const unknown=h.context.batchTimeline([{...partial,clock:null}]);assert.match(unknown,/No comparable valid timestamps/);assert.doesNotMatch(unknown,/<svg/);
});
test('バッチUI: timelines distinguish global unrecorded gaps and clip long labels safely',()=>{
 const h=harness(),b=h.w.result.batches[0];b.records[0].step='<script>Long Heating Title</script>';const html=h.context.batchTimeline([b]);assert.match(html,/<clipPath/);assert.match(html,/clip-path="url/);assert.match(html,/Unrecorded Gaps/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/tabindex="0"/);
});
test('バッチUI: duplicated normalization+analysis issues appear once and retain raw time provenance',()=>{
 const h=harness(),r=h.w.result.normalized.records[0],issue={code:'invalidStart',recordId:r.id,file:r.file,sheet:r.sheet,row:r.row};h.w.result.normalized.issues=[issue];h.w.result.issues=[{...issue}];assert.equal(h.context.batchIssues(h.w).length,1);const rows=h.context.batchIssueTable(h.context.batchIssues(h.w),[r]);assert.equal(rows[1][1],2);assert.match(rows[1][3],/2026-09-01 08:00/);
});
test('バッチUI: Excel includes full batch distributions/all-data/IQR and source/audit tables',()=>{
 const h=harness(),before=JSON.stringify(h.w),report=h.context.buildBatchReport(),sheets=report.sheets;assert.ok(sheets.filter(([n])=>n.startsWith('Batch elapsed-time')).length>=3);assert.equal(sheets.find(([n])=>n.startsWith('Exclusions and data'))[1].length,25);assert.equal(sheets.at(-1)[1].length,25);assert.ok(sheets.some(([n,rows])=>n.startsWith('File   Sheet')&&rows.some(r=>r.includes('synthetic.xlsx'))));assert.equal(JSON.stringify(h.w),before);assert.match(report.html,/Recorded Interval Union/);
});
test('バッチUI: all-data labels do not describe IQR candidates as removed records',()=>{
 const h=harness(),all=h.context.batchStatsTable(h.w.result.groups,false),filtered=h.context.batchStatsTable(h.w.result.groups,true);assert.equal(all[0].at(-1),'IQR candidates');assert.equal(filtered[0].at(-1),'Excluded Count');assert.ok(h.w.result.excludedRows.length>0);
});
test('バッチUI: Japanese/English rendering leaves batch numbers and raw rows unchanged',()=>{
 const h=harness(),before=JSON.stringify(h.w);I18n.setLanguage('ja');const ja=h.context.renderBatchResults(h.w);I18n.setLanguage('en');const en=h.context.renderBatchResults(h.w);assert.notEqual(ja,en);assert.equal(JSON.stringify(h.w),before);assert.doesNotMatch(ja,/NaN|Infinity/);
});
test('バッチUI: zero-total Pareto keeps quantities but suppresses undefined percentages and chart',()=>{
 I18n.setLanguage('en');const h=harness();h.w.result.pareto.result={total:0,excluded:0,items:[{label:'Heat',value:0,percent:0,cumulative:0}]};h.w.result.pareto.rows=[['Heat',0]];
 const before=JSON.stringify(h.w),html=h.context.renderBatchResults(h.w),report=h.context.buildBatchReport();
 assert.match(html,/percentages are undefined/);assert.doesNotMatch(html,/data-pareto-total="0"/);assert.match(html,/id="batch-pareto" disabled/);
 const table=report.sheets[9][1];assert.equal(table[1][1],0);assert.equal(table[1][2],null);assert.equal(table[1][3],null);assert.match(report.html,/percentages are undefined/);assert.doesNotMatch(report.html,/data-pareto-total="0"/);
 assert.equal(JSON.stringify(h.w),before);
});
