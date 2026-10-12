const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Q=require('../dist/recurring-core.js'),S=require('../dist/spc-core.js'),I18n=require('../dist/i18n.js');
function harness(n=12){
 const source={id:'s',name:'synthetic.xlsx',sheet:'Data',isDemo:true,table:{headers:['Date','Lot','Product','Item','Measurement'],rows:Array.from({length:n},(_,i)=>['2026-10-01',`L${i+1}`,'<unsafe>','Viscosity',100+(i%7)/10])},mapping:{format:'long',date:0,lot:1,product:2,item:3,value:4}};
 const normalized=Q.normalize([source]),settings={...Q.defaults,reportCharts:4,reportTitle:'',attentionOnly:false},result=Q.analyze(normalized.records,settings);result.normalized=normalized;
 const w={sources:[source],settings,result},state={view:'recurring',workflows:{recurring:w},imports:{}};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context={console,state,SPCCore:S,ImportCore:require('../dist/import-core.js'),I18n,esc:escape,fmt:(v,n=3)=>v===null||!Number.isFinite(v)?'—':v.toLocaleString(I18n.numberLocale,{maximumFractionDigits:n}),wt:(k,p=[])=>I18n.t(k.includes('.')?k:'workflow.'+k,p),viewText:(k,p=[])=>I18n.t('chartview.'+k,p),qualityStamp:ms=>Number.isFinite(ms)?new Date(ms).toISOString().slice(0,19):'',wfState:()=>w,chartBase:(w,h,html,label)=>`<svg viewBox="0 0 ${w} ${h}" aria-label="${escape(label)}">${html}</svg>`,resetQualityRange:()=>{},navigate:view=>state.view=view};
 vm.createContext(context);for(const file of ['quality-ui.js','reports.js','recurring-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context,{filename:file});return {context,w,state};
}
test('定例品質UI: escaped labels, native keyboard detail button, no mutation on render',()=>{
 I18n.setLanguage('en');const h=harness(),before=JSON.stringify(h.w.result),html=h.context.renderRecurringResults(h.w);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/<unsafe>/);assert.match(html,/<button[^>]*data-quality-detail="0"/);assert.match(html,/Quality Review Dashboard/);assert.equal((html.match(/<table class="recurring-dashboard"><thead>(.*?)<\/thead>/)[1].match(/<th>/g)||[]).length,6);assert.equal(JSON.stringify(h.w.result),before);
});
test('定例品質UI: reports retain complete audits and originals, cap only displayed tables',()=>{
 I18n.setLanguage('en');const h=harness(620),before=JSON.stringify(h.w.result),report=h.context.buildRecurringReport();assert.equal(report.sheets.find(([name])=>name.startsWith('Normalized Data'))[1].length,621);assert.equal(report.sheets.find(([name])=>name.startsWith('Exclusions and data'))[1].length,621);assert.equal(report.sheets.at(-1)[1].length,621);assert.match(report.html,/500/);assert.doesNotMatch(report.html,/L620<\/td>/);assert.equal(report.sheets.find(([name])=>name.startsWith('Control Chart'))[1].filter(row=>row[4]==='MR').length,619);assert.equal(JSON.stringify(h.w.result),before);
});
test('定例品質UI: chart receives lot order, retains date tooltip and missing-value break',()=>{
 I18n.setLanguage('en');const h=harness(6),r=h.w.result.normalized.records;r[2].value=null;r[2].rawValue='';h.w.result=Q.analyze(r,{...Q.defaults,minSamples:2});const html=h.context.recurringChart(h.w.result.groups[0]);assert.match(html,/L1/);assert.match(html,/2026-10-01/);assert.equal((html.match(/data-series-line/g)||[]).length,3);assert.doesNotMatch(html,/NaN|Infinity/);
});
test('定例品質UI: drilldown preserves raw cells, source provenance, gating and date kind',()=>{
 const h=harness(3);h.w.result.groups[0].selectedRecords[0].timeKind='instant';h.context.recurringOpenDetail(0);assert.equal(h.state.view,'capability');assert.equal(h.state.data.workflowContext.minSamples,5);assert.equal(h.state.data.provenance[0].file,'synthetic.xlsx');assert.equal(h.state.data.provenance[0].row,2);assert.match(h.state.data.rows[0][0],/Z$/);assert.doesNotMatch(h.state.data.rows[1][0],/Z$/);assert.equal(h.state.col,4);assert.equal(h.state.quality.order,'lot');assert.equal(h.state.data.rows[0][4],100);assert.equal(h.state.data.rows[0][6],2);
});
test('定例品質UI: language switches only labels and does not change analysis or data',()=>{
 const h=harness(),before=JSON.stringify(h.w);I18n.setLanguage('ja');const ja=h.context.renderRecurringResults(h.w);I18n.setLanguage('en');const en=h.context.renderRecurringResults(h.w);assert.notEqual(ja,en);assert.equal(JSON.stringify(h.w),before);assert.match(en,/Standard Deviation/);
});
test('定例品質UI: comparison bars support negative/zero means with descriptive deltas',()=>{
 const h=harness();const c={current:{mean:-2},previous:{mean:0},deltas:{mean:{absolute:-2,relative:null}}};const html=h.context.recurringComparisonBar(c,'A');assert.match(html,/<rect/);assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/-2/);assert.equal(h.context.recurringComparisonBar(null,'A'),'—');
});
