const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.TOOLBOX_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'lot-axis-'));

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1512,height:1050}});
  let checks=0,watch=false;const errors=[],requests=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(watch&&/^https?:/.test(r.url()))requests.push(r.url());});
  p.on('dialog',d=>d.accept());
  const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS',label);};
  const load=async(name,csv)=>{
    await p.locator('#data-file').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(csv)});
    await p.waitForFunction(name=>state.data?.name===name,name);
  };
  const dates=async(start,end)=>{
    for(const [id,value] of [['#qc-start-date',start],['#qc-end-date',end]]){
      await p.locator(id).fill(value);await p.locator(id).dispatchEvent('change');
    }
  };
  const points=async(panel='individuals')=>p.locator(`[data-quality-chart=${panel}] circle[data-point-index]`).evaluateAll(els=>els.map(e=>({index:Number(e.dataset.pointIndex),x:Number(e.getAttribute('cx')),title:e.textContent})));
  const equallySpaced=pts=>pts.length>1&&pts.every((pt,i)=>!i||pt.x>pts[i-1].x)&&pts.slice(2).every((pt,i)=>Math.abs((pt.x-pts[i+1].x)-(pts[1].x-pts[0].x))<1e-6);
  const reload=async()=>{watch=false;await p.reload();await p.waitForFunction(()=>typeof state!=='undefined'&&typeof preferences!=='undefined');watch=true;await p.evaluate(()=>navigate('capability'));};
  const primary='Date,Lot,Value\n2026-10-01,LOT-2,2\n2026-10-01,LOT-10,10\n2026-10-01,LOT-1,1';
  await p.goto(process.env.TOOLBOX_URL||'http://127.0.0.1:8765/#capability');
  await p.evaluate(()=>navigate('capability'));watch=true;
  await p.locator('[data-language=en]').click();

  await load('same-day-lots.csv',primary);
  check(await p.locator('#qc-lot').inputValue()==='1'&&await p.locator('#qc-order').inputValue()==='lot','lot column is detected and takes priority over date order');
  check(await p.evaluate(()=>JSON.stringify(state.result.input.map(x=>x.row[1])))==='["LOT-1","LOT-2","LOT-10"]','LOT-2 precedes LOT-10 in natural lot order');
  check(await p.evaluate(()=>JSON.stringify(state.result.chartRecords.map(x=>x.value)))==='[1,2,10]','Individuals values use lot order before statistical analysis');
  check(await p.evaluate(()=>JSON.stringify(state.result.rangeRecords.map(x=>x.value)))==='[1,8]'&&await p.evaluate(()=>state.result.rangeMean)===4.5,'MR uses adjacent lots rather than original or date order');
  const sameDay=await points();
  check(equallySpaced(sameDay),'same-day lots have distinct equally spaced horizontal coordinates');
  check(sameDay.every((x,i)=>x.title.includes(['LOT-1','LOT-2','LOT-10'][i])&&x.title.includes('2026-10-01')),'tooltips show lot identifiers and dates for each point');
  const labels=await p.locator('[data-quality-chart=individuals] .axis-label').allTextContents();
  check(labels.some(x=>x.includes('LOT-1'))&&labels.some(x=>x.includes('LOT-10'))&&!labels.some(x=>x.includes('2026-10-01')),'horizontal labels use lots rather than same repeated dates');
  check(await p.locator('#qc-start-date').isEnabled(),'date range controls remain available in lot order');
  await p.locator('#qc-date').selectOption('-1');await p.locator('#qc-date').selectOption('0');
  check(await p.locator('#qc-order').inputValue()==='lot','selecting a date column never overrides lot order');
  check(await p.evaluate(()=>JSON.stringify(state.data.rows.map(row=>row[1])))==='["LOT-2","LOT-10","LOT-1"]','sorting does not mutate the original imported rows');

  const report=await p.evaluate(()=>buildReport('capability'));
  const audit=report.sheets.find(s=>s[0]==='Measurement Data')[1];
  check(JSON.stringify(audit.slice(1).map(row=>row[1]))==='[4,2,3]','Excel audit preserves source-row identity after lot sorting');
  check(report.sheets[0][1].some(row=>row.some(cell=>/lot.*order|order.*lot/i.test(String(cell)))),'report records the lot-order calculation condition');
  await p.locator('#print').click();
  check(await p.locator('#report-dialog .axis-label').allTextContents().then(a=>a.some(x=>x.includes('LOT-1'))&&a.some(x=>x.includes('LOT-10'))),'report control charts use lot labels');
  check(await p.locator('#report-dialog circle[data-point-index]').evaluateAll(els=>new Set(els.slice(0,3).map(e=>e.getAttribute('cx'))).size===3),'report keeps same-day points separated');
  await p.locator('#report-close').click();

  await p.locator('#save-mapping').click();
  await p.locator('#preset-save').click();await p.locator('#preset-name').fill('Lot-order regression');await p.locator('#preset-auto').check();await p.locator('#preset-confirm').click();
  check(await p.evaluate(()=>{const saved=ImportCore.read(localStorage);return !saved.error&&saved.data.mappings[0].mapping.lot===1&&saved.data.presets[0].settings.order==='lot';}),'mapping and preset save lot column and lot order');
  await reload();await load('restored-lot-format.csv',primary);
  check(await p.evaluate(()=>state.appliedPreset==='Lot-order regression'&&state.quality.lot===1&&state.quality.order==='lot'&&state.result.rangeMean===4.5),'lot mapping and preset round-trip through browser storage');

  for(const language of ['ja','en']){
    const before=await p.evaluate(()=>JSON.stringify(state.result));
    await p.locator(`[data-language=${language}]`).click();
    check(await p.locator('label[for=qc-lot]').textContent().then(t=>language==='ja'?t.includes('ロット'):/lot/i.test(t)),'lot selector is translated in '+language);
    check(await p.evaluate(()=>JSON.stringify(state.result))===before&&equallySpaced(await points()),'language '+language+' preserves lot order and statistics');
  }

  await load('nonchronological-lots.csv','Date,Lot,Value\n2026-10-01,L4,11\n2026-10-02,L2,8\n2026-10-01,L1,1\n2026-10-01,L3,9');
  const all=await p.evaluate(()=>{window.lotResult=state.result;return JSON.stringify(state.result);});
  await dates('2026-10-01','2026-10-01');
  check(JSON.stringify((await points()).map(x=>x.index))==='[0,2,3]','date range filters nonchronological lot sequence without date sorting');
  check(await p.evaluate(()=>state.result===window.lotResult&&JSON.stringify(state.result))===all,'date filtering does not recalculate limits, indices, MR or signals');
  check(await p.evaluate(()=>JSON.stringify(qualityView(state.result).ranges.map(x=>x.value)))==='[1,2]','filtered MR retains the full-series preceding-lot calculation');
  check(await p.locator('[data-quality-chart=individuals] line[stroke-width="1.8"]').count()===1,'date filtering never draws a line across excluded lots');
  check(await p.evaluate(()=>buildReport('capability').sheets.find(s=>s[0]==='Measurement Data')[1].length)===5,'filtered report retains all analyzed rows in Excel');
  await p.locator('#qc-range-reset').click();

  await load('identifier-values.csv','Date,Batch,Value\n2026-10-01,0002,2\n2026-10-01,0001,1\n2026-10-01,1,3\n2026-10-01,0001,4\n2026-10-01,10,5');
  check(await p.evaluate(()=>JSON.stringify(state.result.input.map(x=>x.row[1])))==='["0001","1","0001","0002","10"]','leading zeros remain text and equal natural lot keys retain source order');
  check((await points()).length===5&&equallySpaced(await points()),'duplicate lot identifiers remain separate equally spaced observations');
  check((await points()).filter(x=>x.title.includes('0001')).length===2,'both repeated zero-padded lot identifiers remain visible');
  await load('long-identifiers.csv','Date,Batch,Value\n2026-10-01,L9007199254740993,3\n2026-10-01,L9007199254740992,2\n2026-10-01,L2,1');
  check(await p.evaluate(()=>JSON.stringify(state.result.input.map(x=>x.row[1])))==='["L2","L9007199254740992","L9007199254740993"]','large numeric lot components sort without numeric precision loss');

  await load('missing-lot.csv','Date,Batch,Value\n2026-10-01,L1,1\n2026-10-01,,2\n2026-10-01,L3,3');
  check(await p.locator('#results [role=alert]').count()===1&&await p.evaluate(()=>state.result===null),'missing lot number gives an explicit recoverable error');
  await p.locator('#qc-order').selectOption('input');
  check(await p.evaluate(()=>state.result.n===3)&&equallySpaced(await points()),'input order recovers missing-lot data without reimporting or dropping it');
  check(await p.locator('#qc-start-date').isEnabled(),'input-order recovery still offers valid date filtering');

  await load('no-lot.csv','Date,Measurement\n2026-10-03,3\n2026-10-01,1\n2026-10-02,2');
  check(await p.evaluate(()=>state.quality.order==='input'&&state.quality.lot===-1&&JSON.stringify(state.result.chartRecords.map(x=>x.value))==='[3,1,2]'),'missing lot column defaults to input order rather than date sorting');
  check(equallySpaced(await points()),'no-lot fallback uses equally spaced measurement positions');
  await load('invalid-date-lots.csv','Date,Batch,Value\n2026-10-03,L3,3\ninvalid,L1,1\n2026-10-02,L2,2');
  check(await p.evaluate(()=>state.quality.order==='lot'&&state.result.n===3)&&await p.locator('#qc-start-date').isDisabled(),'invalid dates do not block lot analysis and use an ordinal range');

  await load('groups.csv','Date,Batch,Value\n2026-10-01,L4,8\n2026-10-01,L2,3\n2026-10-01,L1,1\n2026-10-01,L3,4');
  await p.locator('.analysis-settings').evaluate(el=>el.open=true);await p.locator('#qc-chart').selectOption('xbar');
  await p.locator('.analysis-settings').evaluate(el=>el.open=true);await p.locator('#qc-group').fill('2');await p.locator('#qc-group').dispatchEvent('change');
  check(await p.evaluate(()=>JSON.stringify(state.result.groups.map(g=>g.mean)))==='[2,6]','Xbar subgroups are calculated in lot order');
  check((await points())[0].title.includes('L1')&&(await points())[0].title.includes('L2'),'subgroup tooltip identifies its first and last lots');
  check(await p.locator('[data-quality-chart=individuals] .axis-label').allTextContents().then(a=>a.some(x=>x.includes('L2'))&&a.some(x=>x.includes('L4'))),'Xbar labels identify each subgroup final lot');
  check(equallySpaced(await points())&&equallySpaced(await points('mr')),'Xbar and R have distinct equally spaced subgroup coordinates');

  const legacySettings={lsl:'0',usl:'20',unit:'test',chart:'imr',subgroupSize:2,rules:[1],productValue:'',order:'date'};
  const legacy=(headers,settings,name,mapping={value:2,date:0,product:-1})=>({tool:'capability',headers,mapping,settings,name,auto:true});
  const legacyState={version:1,mappings:[{tool:'capability',headers:['Old Date','Lot','Legacy Value'],mapping:{value:2,date:0,product:-1}}],presets:[
    legacy(['Old Date','Lot','Legacy Value'],legacySettings,'Old date preset'),
    legacy(['Old Date','Lot','Input Value'],{...legacySettings,order:'input'},'Old input preset'),
    legacy(['Date','Legacy Measurement'],legacySettings,'Old no-lot preset',{value:1,date:0,product:-1})
  ]};
  await p.evaluate(data=>localStorage.setItem(ImportCore.KEY,JSON.stringify(data)),legacyState);await reload();
  check(await p.evaluate(()=>!preferenceError&&preferences.presets.length===3&&preferences.mappings.length===1),'legacy storage migrates without discarding existing settings');
  await load('legacy-with-lot.csv','Old Date,Lot,Legacy Value\n2026-10-01,L2,2\n2026-10-01,L10,10\n2026-10-01,L1,1');
  check(await p.evaluate(()=>state.appliedPreset==='Old date preset'&&state.quality.order==='lot'&&state.quality.lot===1&&state.result.rangeMean===4.5&&state.lsl==='0'),'legacy date preset adopts detected lot priority and retains specification settings');
  await load('legacy-input.csv','Old Date,Lot,Input Value\n2026-10-01,L2,2\n2026-10-01,L10,10\n2026-10-01,L1,1');
  check(await p.evaluate(()=>state.appliedPreset==='Old input preset'&&state.quality.order==='input'&&state.result.rangeMean===8.5),'explicit legacy input order remains preserved');
  await load('legacy-no-lot.csv','Date,Legacy Measurement\n2026-10-03,3\n2026-10-01,1\n2026-10-02,2');
  check(await p.evaluate(()=>state.appliedPreset==='Old no-lot preset'&&state.quality.order==='input'&&state.quality.lot===-1),'legacy date preset without a lot column migrates to input order');

  await load('new-explicit-date.csv','Timestamp,Batch,Value\n2026-10-03,L1,1\n2026-10-01,L3,3\n2026-10-02,L2,2');
  await p.locator('#qc-order').selectOption('date');
  await p.locator('#preset-save').click();await p.locator('#preset-name').fill('New explicit date order');await p.locator('#preset-auto').check();await p.locator('#preset-confirm').click();
  await reload();await load('new-explicit-date-restored.csv','Timestamp,Batch,Value\n2026-10-03,L1,1\n2026-10-01,L3,3\n2026-10-02,L2,2');
  check(await p.evaluate(()=>state.appliedPreset==='New explicit date order'&&state.quality.order==='date'&&JSON.stringify(state.result.input.map(x=>x.row[1]))==='["L3","L2","L1"]'),'new explicitly selected date-order preset round-trips unchanged');
  check(equallySpaced(await points()),'explicit date sorting still draws equally spaced points');

  await load('visual-lots.csv','Date,Production Lot,Viscosity\n2026-10-01,LOT-2,2\n2026-10-01,LOT-10,10\n2026-10-01,LOT-1,1');
  check(await p.evaluate(()=>state.result?.n===3&&state.quality.lot===1&&state.quality.product!==state.quality.lot),'Production Lot is not also auto-mapped as the product column');
  await p.locator('[data-language=ja]').click();
  await p.locator('#quality-view-controls').evaluate(el=>el.scrollIntoView({block:'start'}));await p.screenshot({path:path.join(out,'lot-axis-ja.png')});
  await p.setViewportSize({width:390,height:844});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'lot controls and chart retain mobile layout without document overflow');
  await p.setViewportSize({width:1512,height:1050});
  check(errors.length===0,'no browser runtime errors during lot-axis workflows');
  check(requests.length===0,'no HTTP requests during import, analysis, sorting, filtering or reports');
  fs.writeFileSync(path.join(out,'lot-axis-result.json'),JSON.stringify({checks,errors,requests},null,2));
  await browser.close();console.log('COMPLETE',checks,'lot-axis browser checks');
})().catch(e=>{console.error(e);process.exit(1);});
