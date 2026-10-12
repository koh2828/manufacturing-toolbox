/* End-to-end coverage uses generated, nonconfidential fixtures only. */
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const X=require('../dist/vendor/xlsx.full.min.js');
const out=process.env.TOOLBOX_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'toolbox-workflow-'));
const url=process.env.TOOLBOX_URL||'http://127.0.0.1:8765/';fs.mkdirSync(out,{recursive:true});
const csv=(name,rows)=>({name,mimeType:'text/csv',buffer:Buffer.from(rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'))});
const excel=(name,rows)=>{const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'Inspection');return {name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{bookType:'xlsx',type:'buffer',compression:true}))};};
const wideHeaders=['Date','Product','Lot','Equipment','Viscosity','Volatile'];
const jpHeaders=['日付','製品','ロット','設備','粘度','揮発分'];
const qualityRows=month=>Array.from({length:10},(_,i)=>[`2026-${month}-${String(i+1).padStart(2,'0')}`,'PRODUCT-PRIVATE-A',`RAW-PRIVATE-LOT-${month}-${i+1}`,'EQUIPMENT-PRIVATE-R1',i+1+(month==='10'?1:0),.8+i*.01]);
const first=excel('PRIVATE-SEPT.xlsx',[['Synthetic monthly report'],[],wideHeaders,...qualityRows('09')]);
const second=excel('PRIVATE-OCT.xlsx',[jpHeaders,...qualityRows('10')]);
const longHeaders=['Date','Product','Lot','Equipment','Inspection Item','Measurement','Unit','LSL','USL'];
const long=csv('PRIVATE-LONG.csv',[longHeaders,...['09','10'].flatMap(month=>qualityRows(month).slice(0,5).map(r=>[...r.slice(0,4),'Viscosity',101.234567+(month==='10'?1:0),'cP',90,110]))]);
const diagnosticFixture={name:'synthetic-parser-diagnostic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:automatic-styles><number:number-style style:name="N1"><number:number number:decimal-places="0"/><style:map style:condition="PRIVATE-AUDIT-SENTINEL" style:apply-style-name="N2"/></number:number-style><style:style style:name="ce1" style:family="table-cell" style:data-style-name="N1"/></office:automatic-styles><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row><table:table-cell office:value-type="string"><text:p>Value</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="float" office:value="3" table:style-name="ce1"><text:p>3</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document>`)};


async function runBatch({p,fresh,check,analyze,load,reveal,change,select,download,report,workbookRows,out,performanceResults}){
  const headers=['Batch ID','Product','Equipment','Process Step','Start Time','End Time','Delay Category','Delay Reason','Target Time (min)','Loss Type'];
  const reference=require('./reference/batch-reference.json');
  await fresh('batch');await p.locator('[data-language="en"]').click();check(await p.locator('#page-title').innerText()==='Batch Process Analysis','batch route and English navigation');
  await p.locator('#wf-sample').click();await analyze();
  check(await p.evaluate(()=>wfState().result.groups.length===6&&wfState().result.batches.length===24&&wfState().result.audit.length===144),'batch sample analyzes six steps and twenty-four complete batches');
  check(await p.locator('.wf-batch-timeline').count()>0,'parallel process timeline is rendered');
  await p.locator('[data-period="month"]').click();await analyze();
  check(await p.evaluate(()=>wfState().settings.from==='2026-10-01'&&wfState().settings.previousFrom==='2026-09-01'&&wfState().result.batches.length===12&&wfState().result.comparisons.length>0),'batch latest month creates current and prior cohorts');
  const sample=await report('batch','batch-sample');
  check(sample.sheets.some(s=>s.name.startsWith('Exclusions')&&s.rows.length===145),'batch sample Excel exports all current and previous audit rows');

  await fresh('batch');await load(path.join(__dirname,'fixtures/batch-workflow.csv'),1);await analyze();
  check(await p.evaluate(()=>{const r=wfState().result;return r.audit.length===98&&r.invalidRecords.length===5&&r.counts.completeBatches===13&&r.batches.length===17;}),'98-row fixture preserves invalid dates, missing/reversed times and exact duplicate audit');
  const actual=await p.evaluate(()=>wfState().result.batches.map(b=>({batch:b.batch,elapsed:b.elapsed,stepTotal:b.stepTotal,active:b.active,gap:b.gap,overlap:b.overlap})));
  for(const expected of reference.fixture.completeReferenceBatches){const b=actual.find(x=>x.batch===expected.batch);assert.ok(b);for(const [k,v] of Object.entries({elapsed:expected.elapsed,stepTotal:expected.sumStep,active:expected.active,gap:expected.gap,overlap:expected.overlap}))assert.ok(Math.abs(b[k]-v)<1e-8,k+' '+expected.batch);}
  check(true,'all ten parallel batch durations match independent Python and interval references');
  check(await p.evaluate(()=>{const r=wfState().result,g=r.groups.find(g=>g.product==='SYN-RESIN-B');return g&&g.all.n===3&&g.all.p95===null&&r.batches.filter(b=>b.product==='SYN-RESIN-B').every(b=>b.complete&&b.elapsed>=120);}), 'rare cross-midnight product retains durations but suppresses insufficient-N percentiles');
  const allReport=await report('batch','batch-fixture');
  check(allReport.sheets.some(s=>s.name.startsWith('Exclusions')&&s.rows.length===99),'batch Excel exports all98 valid, invalid and duplicate source rows');
  for(const [k,v] of Object.entries({from:'2026-10-01',to:'2026-10-05',previousFrom:'2026-09-01',previousTo:'2026-09-05'}))await change('#wf-'+k,v);
  await analyze();
  check(await p.evaluate(expected=>{const r=wfState().result,c=r.comparisons.find(x=>x.kind==='step'&&x.step===expected.step&&x.product===expected.product&&x.equipment===expected.equipment);return r.batches.length===5&&r.previousBatches.length===5&&c.current.mean===expected.after.mean&&c.previous.mean===expected.before.mean&&c.deltas.mean.absolute===-34&&Math.abs(c.deltas.p95.absolute+37.6)<1e-8;},reference.beforeAfter),'before/after heating mean and P95 differences match independent reference');
  await change('#wf-step','Heating');await analyze();
  check(await p.evaluate(()=>{const r=wfState().result;return r.groups.length===1&&r.groups[0].all.n===5&&r.batches.every(b=>b.partial&&b.records.length===9)&&r.batches[0].elapsed===530;}),'step filter retains full observed batch elapsed and marks partial selection');
  await change('#wf-step','');await select('#wf-displayUnit','minute');await analyze();const base=await p.evaluate(()=>JSON.stringify(wfState().result.groups.map(g=>g.stats)));
  await select('#wf-displayUnit','hour');await analyze();check(await p.evaluate(()=>JSON.stringify(wfState().result.groups.map(g=>g.stats)))===base,'hour display preserves internal minute precision');
  await p.locator('[data-language="ja"]').click();check(await p.locator('#page-title').innerText()==='バッチ工程分析','Japanese batch title');await p.locator('[data-language="en"]').click();check(await p.evaluate(()=>JSON.stringify(wfState().result.groups.map(g=>g.stats)))===base,'batch language switching preserves numerical results');
  const compared=await report('batch','batch-before-after');check(compared.sheets.some(s=>s.rows.some(r=>r.includes(106/60)&&r.includes(140/60))),'before/after workbook contains hour-converted means at full precision');
  const pareto=await p.evaluate(()=>wfState().result.pareto.rows.map(([label,value])=>[label,value/60]));await p.locator('#batch-pareto').click();check(await p.evaluate(expected=>state.view==='pareto'&&JSON.stringify(state.paretoData.rows)===JSON.stringify(expected),pareto),'batch excess durations hand off to existing Pareto without changing quantities');
  await p.locator('[data-nav="cycle"]').click();await p.locator('[data-wf-nav="batch"]').click();check(await p.evaluate(()=>state.view==='batch'&&wfState().result.batches.length===5),'existing Cycle Time navigation returns to retained batch analysis');
  const project=await download('#wf-project-save','batch-project.mtb');await p.locator('#save-mapping').click();await p.locator('#preset-save').click();await p.locator('#preset-name').fill('Synthetic batch preset');await p.locator('#preset-auto').check();await p.locator('#preset-confirm').click();
  check(await p.evaluate(()=>{const stored=JSON.stringify({...localStorage});return !/SYN-RESIN|SYN-09-|SYN-10-|SYN-KETTLE|SYN-FILTER/.test(stored);}), 'batch saved settings exclude source products, batch IDs and equipment');
  await fresh('batch');await load(path.join(__dirname,'fixtures/batch-workflow.csv'),1);check(await p.evaluate(()=>state.appliedPreset==='Synthetic batch preset'&&wfState().settings.from==='2026-10-01'&&wfState().sources[0].mapping.target===8),'batch preset restores exact layout and period settings');await analyze();
  await fresh('batch');await p.locator('#wf-project-file').setInputFiles(project);await p.waitForFunction(()=>wfState().sources.length===1);await analyze();check(await p.evaluate(()=>wfState().result.audit.length===98&&wfState().result.batches.length===5&&wfState().result.groups.find(g=>g.step==='Heating').all.mean===106),'batch project roundtrip restores source data and known results');
  await select('#wf-col-end',4);await p.locator('#wf-analyze').click();await p.waitForFunction(()=>!wfState().busy);check(await p.evaluate(()=>wfState().result===null),'reused start/end mapping safely blocks batch analysis');await select('#wf-col-end',5);await analyze();
  await p.setViewportSize({width:390,height:844});check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'batch mobile page has no horizontal overflow');await p.screenshot({path:path.join(out,'batch-mobile.png')});await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:path.join(out,'batch-desktop.png')});

  await fresh('batch');
  const at=m=>new Date(Date.UTC(2026,9,1,8)+m*60000).toISOString().slice(0,19).replace('T',' ');
  const durations=[10,11,12,13,14,100],iqrRows=durations.map((duration,i)=>['RAW-PRIVATE-BATCH-'+i,'PRODUCT-PRIVATE-B','EQUIPMENT-PRIVATE-B','Heating',at(i*1440),at(i*1440+duration),'Recorded stop','RAW-PRIVATE-REASON',10,'downtime']);
  await load(csv('PRIVATE-IQR.csv',[headers,...iqrRows]),1);for(const k of ['from','to','previousFrom','previousTo'])await change('#wf-'+k,'');await select('#wf-outlier','all');await select('#wf-displayUnit','minute');await analyze();
  check(await p.evaluate(()=>{const r=wfState().result;return r.groups[0].all.n===6&&r.groups[0].all.p50===12.5&&r.timeLoss.downtime===160&&r.timeLoss.excess===100;}),'all-data batch P50 and separately recorded losses match hand calculation');
  await select('#wf-outlier','iqr');await analyze();
  check(await p.evaluate(()=>{const r=wfState().result,g=r.groups[0];return g.stats.n===5&&g.stats.p50===12&&g.stats.p95===13.8&&g.all.n===6&&r.excludedRows.length===1&&r.excludedRows[0].duration===100&&r.batches.some(b=>b.elapsed===100)&&r.timeLoss.downtime===160&&r.timeLoss.excess===100;}),'IQR comparison excludes one statistical observation while preserving timeline and losses');
  await select('#wf-reference','p50');await analyze();check(await p.evaluate(()=>Math.abs(wfState().result.timeLoss.excess-89.5)<1e-8&&wfState().result.conditions.referencePopulation==='allValidStepRecords'),'historical P50 reference uses all valid observations independently of IQR');
  const iqrReport=await report('batch','batch-iqr');check(iqrReport.sheets.some(s=>s.name.startsWith('Exclusions')&&s.rows.length===7)&&iqrReport.sheets.some(s=>s.rows.some(r=>r.includes('RAW-PRIVATE-BATCH-5'))),'IQR report retains excluded batch in audit and source data');
  await fresh('batch');await load(excel('batch-japanese.xlsx',[['バッチ番号','製品','設備','工程','開始','終了','原因区分','理由','目標時間','ロス種別'],...iqrRows]),1);await analyze();check(await p.evaluate(()=>wfState().sources[0].mapping.lossType===9&&wfState().result.counts.currentValid===6),'Japanese batch Excel uses shared auto mapping and preserves all records');
  check(await p.evaluate(()=>!JSON.stringify({...localStorage}).includes('RAW-PRIVATE-BATCH')),'batch raw rows and free-text reasons never enter automatic storage');

  if(!process.env.TOOLBOX_SKIP_BENCHMARK)for(const count of [10000,50000]){
    await fresh('batch');const rows=Array.from({length:count},(_,i)=>{const base=Date.UTC(2026,0,1)+i*3600000;return ['PERF-'+Math.floor(i/10),'PERF-P','PERF-E','Step '+i%2,new Date(base).toISOString(),new Date(base+1800000).toISOString(),30];});
    const input=count===10000?excel('batch-benchmark.xlsx',[headers.slice(0,6).concat(headers[8]),...rows]):csv('batch-benchmark.csv',[headers.slice(0,6).concat(headers[8]),...rows]);
    const t0=Date.now();await load(input,1);const t1=Date.now();await analyze();const t2=Date.now();check(await p.evaluate(n=>wfState().result.counts.currentValid===n&&wfState().result.batches.length===n/10,count),'batch benchmark retains all '+count+' steps and full batch groups');
    await p.locator('#wf-report').click();const destination=await download('#report-excel','batch-benchmark-'+count+'.xlsx');const t3=Date.now();await p.locator('#report-close').click();
    const exported=workbookRows(destination);check(exported.sheets.some(s=>s.name.startsWith('Exclusions')&&s.rows.length===count+1),'batch large export retains all '+count+' audit rows');
    performanceResults.push({tool:'batch',rows:count,inputBytes:input.buffer.length,importMs:t1-t0,analyzeRenderMs:t2-t1,reportExportMs:t3-t2,exportBytes:fs.statSync(destination).size});
  }
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true}),p=await ctx.newPage();
  p.setDefaultTimeout(15000);let checks=0,watch=false;const errors=[],network=[],consoleMessages=[],performanceResults=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(watch&&/^https?:/.test(r.url()))network.push({method:r.method(),url:r.url()});});
  p.on('console',m=>{if(watch)consoleMessages.push({type:m.type(),text:m.text()});});p.on('dialog',d=>d.accept());
  const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS',label);};
  const fresh=async(tool='recurring')=>{watch=false;await p.goto('about:blank');await p.goto(url.replace(/#.*$/,'')+'#'+tool);await p.waitForFunction(()=>typeof WorkflowCore!=='undefined'&&typeof wfState==='function'&&typeof renderRecurringResults==='function');await p.waitForSelector('#wf-files',{state:'attached'});watch=true;};
  const analyze=async()=>{await p.locator('#wf-analyze').click();await p.waitForFunction(()=>!wfState().busy);check(await p.evaluate(()=>!!wfState().result?.valid),'analysis completed: '+await p.evaluate(()=>state.view));};
  const load=async(files,count)=>{await p.locator('#wf-files').setInputFiles(files);await p.waitForFunction(count=>!wfState().busy&&wfState().sources.length===count,count);};
  const reveal=async selector=>p.locator(selector).evaluate(e=>{for(let n=e.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
  const change=async(selector,value)=>{await reveal(selector);await p.locator(selector).fill(String(value));await p.locator(selector).dispatchEvent('change');};
  const select=async(selector,value)=>{await reveal(selector);await p.locator(selector).selectOption(String(value));};
  const download=async(selector,name)=>{const waiting=p.waitForEvent('download');await p.locator(selector).click();const d=await waiting;const file=path.join(out,name);await d.saveAs(file);check(!await d.failure(),'download completed: '+name);return file;};
  const workbookRows=file=>{const wb=X.read(fs.readFileSync(file),{type:'buffer'});return {wb,sheets:wb.SheetNames.map(name=>({name,rows:X.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null})}))};};
  const report=async(tool,name,{pdf=true}={})=>{
    await p.locator('#wf-report').click();check(await p.locator('#report-dialog').isVisible(),'shared '+tool+' report preview');
    const downloaded=await download('#report-excel',name+'.xlsx'),parsed=workbookRows(downloaded);check(parsed.wb.SheetNames.length>=6,'report contains conditions, summaries and audit: '+tool);
    if(pdf){await p.evaluate(()=>window.print=()=>{});await p.locator('#report-pdf').click();check(await p.locator('#generated-print').count()===1,'print document prepared: '+tool);await p.pdf({path:path.join(out,name+'.pdf'),format:'A4',printBackground:true});check(fs.statSync(path.join(out,name+'.pdf')).size>1000,'PDF generated: '+tool);await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));}else await p.locator('#report-close').click();
    return parsed;
  };
  const scope=process.env.TOOLBOX_WORKFLOW_SCOPE||'all';
  try{
    if(scope!=='batch'){
    await fresh();await p.locator('[data-language="en"]').click();
    check(await p.locator('#page-title').innerText()==='Recurring Quality Analysis','recurring route and English navigation');
    await p.locator('#wf-sample').click();await analyze();check(await p.evaluate(()=>wfState().result.groups.length===4&&wfState().result.counts.currentValid===256),'synthetic sample analyzes two products and two items');
    await p.locator('[data-period="month"]').click();await analyze();check(await p.evaluate(()=>wfState().settings.from==='2026-10-01'&&wfState().settings.previousFrom==='2026-09-01'&&wfState().result.comparisons.length===4),'latest month comparison applies separate current/previous periods');
    const sampleReport=await report('recurring','recurring-sample');check(sampleReport.sheets.some(s=>s.rows.some(r=>r.includes('DEMO-A'))),'sample report exports product data');
    const group=await p.evaluate(()=>{const g=wfState().result.groups[0];return {n:g.stats.n,mean:g.stats.mean,item:g.item};});
    await p.locator('[data-quality-detail="0"]').click();check(await p.evaluate(g=>state.view==='capability'&&state.result.n===g.n&&Math.abs(state.result.mean-g.mean)<1e-10&&state.data.workflowContext.source==='recurring',group),'dashboard opens existing control chart with matching statistics');
    check(await p.locator('#quality-plots svg').count()===3,'detail reuses Individuals, MR and histogram');

    await fresh();check(await p.evaluate(()=>wfState().sources.length===0),'raw workflow data does not survive reload');
    await load(first,1);check(await p.evaluate(()=>wfState().sources[0].headerRow===3&&wfState().sources[0].mapping.format==='wide'),'single XLSX reuses automatic header and wide mapping');
    await analyze();check(await p.evaluate(()=>wfState().result.groups.length===2&&wfState().result.counts.currentValid===20),'single Excel batch analyzes both numeric inspection columns');
    await load([second,long],3);check(await p.evaluate(()=>wfState().sources[1].mapping.format==='wide'&&wfState().sources[2].mapping.format==='long'),'multiple Excel/CSV with Japanese wide and English long mappings');
    for(const index of [0,1]){await select('#wf-source',index);for(const [item,name,unit,lsl,usl] of [[0,'Viscosity','mPa·s',0,11],[1,'Volatile','%',null,2]]){for(const [key,value] of Object.entries({name,unit,lsl:lsl??'',usl}))await change(`[data-item-index="${item}"][data-item-key="${key}"]`,value);}}
    await p.locator('[data-period="month"]').click();await analyze();
    check(await p.evaluate(()=>wfState().result.groups.length===3&&wfState().result.counts.current===25&&wfState().result.comparisons.length===3),'mixed layouts merge compatible groups and compare months');
    check(await p.evaluate(()=>wfState().result.groups.filter(g=>g.item==='Viscosity').length===2&&wfState().result.issues.some(i=>i.code==='separateUnits')),'different units remain separate with a warning');
    check(await p.evaluate(()=>{const g=wfState().result.groups.find(g=>g.item==='Viscosity'&&g.unit==='mPa·s');return g.stats.n===10&&g.stats.mean===6.5&&g.comparison.previous.mean===5.5&&g.comparison.deltas.mean.absolute===1;}),'known monthly means and difference match hand calculation');
    const beforeLanguage=await p.evaluate(()=>JSON.stringify(wfState().result.groups.map(g=>g.stats)));await p.locator('[data-language="ja"]').click();check(await p.locator('#page-title').innerText()==='定例品質分析','Japanese recurring title');await p.locator('[data-language="en"]').click();check(await p.evaluate(()=>JSON.stringify(wfState().result.groups.map(g=>g.stats)))===beforeLanguage,'language switching leaves numerical results unchanged');
    const exported=await report('recurring','recurring-mixed');check(exported.sheets.some(s=>s.name.startsWith('Normalized')&&s.rows.length===51),'report exports all50 normalized records');check(exported.sheets.some(s=>s.name.includes('Comparison')&&s.rows.some(r=>r.includes(6.5)&&r.includes(5.5))),'Excel contains current and previous known means');
    const projectFile=await download('#wf-project-save','recurring-project.mtb'),projectData=JSON.parse(fs.readFileSync(projectFile,'utf8'));check(projectData.version===1&&projectData.sources.length===3&&projectData.sources[0].table.rows[0][2].startsWith('RAW-PRIVATE'),'explicit project export includes versioned original data');
    await p.locator('#save-mapping').click();await p.locator('#preset-save').click();await p.locator('#preset-name').fill('Synthetic monthly preset');await p.locator('#preset-auto').check();await p.locator('#preset-confirm').click();
    const stored=await p.evaluate(()=>JSON.stringify({...localStorage}));check(!/RAW-PRIVATE|101\.234567|PRIVATE-SEPT|PRIVATE-OCT|PRIVATE-LONG|EQUIPMENT-PRIVATE-R1|PRODUCT-PRIVATE-A/.test(stored),'settings storage excludes imported rows, products, equipment and filenames');
    check(await p.evaluate(()=>preferences.presets.find(p=>p.name==='Synthetic monthly preset').layouts.length===3),'one preset stores all three exact layouts');
    await fresh();await load([first,second,long],3);check(await p.evaluate(()=>state.appliedPreset==='Synthetic monthly preset'&&wfState().sources[1].mapping.measurements[0].name==='Viscosity'&&wfState().settings.from==='2026-10-01'),'new data with matching layouts restores preset mappings, limits and periods');await analyze();
    await fresh();const changed=csv('changed.csv',[['Date','Product','Lot','Equipment','Renamed measurement'],...qualityRows('10').map(r=>r.slice(0,5))]);await load(changed,1);check(await p.evaluate(()=>!state.appliedPreset&&wfState().message==='workflow.schemaChanged'),'changed headers warn and do not automatically apply saved settings');
    await p.locator('#preset-select').selectOption('0');await p.locator('#preset-apply').click();check(await p.evaluate(()=>!state.appliedPreset&&wfState().sources[0].table.headers[4]==='Renamed measurement'),'manual preset application also rejects schema mismatch');
    await p.locator('#wf-project-file').setInputFiles(projectFile);await p.waitForFunction(()=>wfState().sources.length===3&&wfState().sources[0].name==='PRIVATE-SEPT.xlsx');await analyze();check(await p.evaluate(()=>wfState().result.groups.length===3&&wfState().result.counts.current===25),'project roundtrip restores data, mappings, periods and calculations');
    await select('#wf-source',0);await select('#wf-col-product',0);await p.locator('#wf-analyze').click();await p.waitForFunction(()=>!wfState().busy);check(await p.evaluate(()=>wfState().result===null),'duplicate column mapping blocks analysis safely');await select('#wf-col-product',1);await analyze();
    await p.setViewportSize({width:390,height:844});check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'recurring mobile page has no horizontal overflow');await p.screenshot({path:path.join(out,'recurring-mobile.png')});await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:path.join(out,'recurring-desktop.png')});
    await fresh();await load(diagnosticFixture,1);check(await p.evaluate(()=>wfState().sources[0].table.rows[0][0]===3),'vendor diagnostic fixture is read locally without losing its value');
    check(!consoleMessages.some(m=>m.text.includes('PRIVATE-AUDIT-SENTINEL')),'real browser suppresses vendor diagnostics containing file metadata');

    // Browser timings include the actual file-input import, result rendering and download.
    // They are measurements, not promised speedups or device-independent thresholds.
    if(!process.env.TOOLBOX_SKIP_BENCHMARK)for(const count of [10000,50000]){
      await fresh();const rows=Array.from({length:count},(_,i)=>['2026-10-01','PERF-SYNTHETIC','PERF-'+String(i).padStart(6,'0'),'PERF-E1',100+Math.sin(i)*2]);
      const input=count===10000?excel('benchmark.xlsx',[wideHeaders.slice(0,5),...rows]):csv('benchmark.csv',[wideHeaders.slice(0,5),...rows]);
      const t0=Date.now();await load(input,1);const t1=Date.now();await analyze();const t2=Date.now();check(await p.evaluate(n=>wfState().result.counts.currentValid===n,count),'benchmark retains all '+count+' measurements');
      await p.locator('#wf-report').click();const destination=await download('#report-excel','benchmark-'+count+'.xlsx');const t3=Date.now();await p.locator('#report-close').click();
      const result=workbookRows(destination);check(result.sheets.some(s=>s.name.startsWith('Normalized')&&s.rows.length===count+1),'large export retains all '+count+' normalized records');
      performanceResults.push({tool:'recurring',rows:count,inputBytes:input.buffer.length,importMs:t1-t0,analyzeRenderMs:t2-t1,reportExportMs:t3-t2,exportBytes:fs.statSync(destination).size});
    }

    // Batch workflow checks are appended when its UI is available; A-only development
    // runs explicitly identify their scope in the saved result.
    }
    if(scope!=='recurring'){
      if(typeof runBatch!=='function')throw Error('Batch workflow E2E is not implemented yet; use TOOLBOX_WORKFLOW_SCOPE=recurring only for partial development verification.');
      await runBatch({p,fresh,check,analyze,load,reveal,change,select,download,report,workbookRows,out,performanceResults});
    }
    check(!consoleMessages.some(m=>/RAW-PRIVATE|101\.234567|PRIVATE-SEPT|PRIVATE-OCT|PRIVATE-LONG|PRIVATE-AUDIT-SENTINEL/.test(m.text)),'no manufacturing sentinel data in browser console');check(network.length===0,'zero HTTP requests during workflows');check(errors.length===0,'no browser runtime errors');
    fs.writeFileSync(path.join(out,'workflow-result.json'),JSON.stringify({scope,benchmarks:!process.env.TOOLBOX_SKIP_BENCHMARK,checks,errors,network,consoleMessages,performanceResults},null,2));console.log('COMPLETE',checks,'workflow browser checks');console.log('PERFORMANCE',JSON.stringify(performanceResults));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
