/* Browser regression tests for transactional imports; synthetic fixtures only. */
const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const X=require('../dist/vendor/xlsx.full.min.js');
const url=process.env.TOOLBOX_URL||'http://127.0.0.1:8765/';
const out=process.env.TOOLBOX_TEST_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'toolbox-safety-'));
fs.mkdirSync(out,{recursive:true});
const headers=['Date','Product','Lot','Equipment','Inspection Item','Measurement','Unit','LSL','USL'];
const wb=X.utils.book_new();
X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([headers,...Array.from({length:5},(_,i)=>['2026-10-01','SYN-A','L'+i,'E1','Viscosity',10+i,'cP',5,20])]),'Good');
X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([]),'Empty');
X.utils.book_append_sheet(wb,{'!ref':'A1:A50002',A1:{t:'s',v:'Value'},A50002:{t:'n',v:1}},'Oversize');
const workbook={name:'synthetic-sheet-safety.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{bookType:'xlsx',type:'buffer',compression:true}))};
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),p=await context.newPage();
  const errors=[],requests=[],checks=[];let observe=false;
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(observe&&/^https?:/.test(r.url()))requests.push({url:r.url(),method:r.method()});});
  const check=(condition,message)=>{assert.ok(condition,message);checks.push(message);};
  const reveal=selector=>p.locator(selector).evaluate(el=>{for(let node=el.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;});
  const snapshot=()=>p.evaluate(()=>{const w=wfState('recurring'),s=w.sources[0];return JSON.stringify({sheet:s.sheet,headerRow:s.headerRow,hasHeader:s.hasHeader,raw:s.raw,table:s.table,mapping:s.mapping,result:w.result});});
  try{
    await p.goto(url+'#recurring');await p.waitForFunction(()=>typeof wfState==='function');observe=true;
    await p.locator('#wf-files').setInputFiles(workbook);await p.waitForFunction(()=>!wfState().busy&&wfState().sources.length===1);
    await p.locator('#wf-analyze').click();await p.waitForFunction(()=>!wfState().busy&&wfState().result?.valid);
    check(await p.evaluate(()=>wfState().result.groups[0].stats.mean===12),'valid sheet analyzes known mean');
    const baseline=await snapshot();
    for(const sheet of ['Empty','Oversize']){
      await reveal('#wf-sheet');await p.locator('#wf-sheet').selectOption(sheet);
      check(await snapshot()===baseline,'failed '+sheet+' switch preserves table, raw rows, mapping, provenance and result');
      check(await p.locator('#wf-sheet').inputValue()==='Good','failed '+sheet+' switch restores visible selection');
      check(await p.locator('#wf-report').isEnabled(),'failed '+sheet+' switch leaves unchanged result report available');
    }
    for(const value of ['0','99']){
      await reveal('#wf-header');await p.locator('#wf-header').fill(value);await p.locator('#wf-remap').click();
      check(await snapshot()===baseline,'invalid header '+value+' preserves all analysis data and provenance');
      check(await p.locator('#wf-header').inputValue()==='1','invalid header '+value+' restores visible value');
    }
    check(await p.evaluate(()=>{const r=buildRecurringReport();return r.sheets.some(([name,rows])=>rows.some(row=>row.includes('Good')))&&r.sheets.some(([name,rows])=>rows.some(row=>row.includes(12)));}),'report retains correct sheet identity and known mean after failed remaps');
    await p.locator('#wf-project-file').setInputFiles({name:'invalid-project.mtb',mimeType:'application/json',buffer:Buffer.from('{invalid')});
    await p.waitForFunction(()=>!wfState().busy);
    check(await snapshot()===baseline,'invalid project JSON preserves existing table and analysis');
    check(await p.locator('#wf-sample').isEnabled(),'invalid project import releases interaction lock');

    const project=await p.evaluate(()=>WF.project('recurring',wfState().sources,wfState().settings));
    project.sources[0].name='synthetic-replacement.csv';project.sources[0].table.rows.forEach(row=>row[5]=999);
    const projectFile={name:'synthetic-delayed.mtb',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))};
    // Delay file IO deterministically instead of relying on wall-clock sleeps.
    await p.evaluate(()=>{window.__safetyText=File.prototype.text;File.prototype.text=function(){const file=this;return new Promise((resolve,reject)=>{window.__safetyRelease=()=>window.__safetyText.call(file).then(resolve,reject);});};});
    await p.locator('#wf-project-file').setInputFiles(projectFile);await p.waitForFunction(()=>wfState().busy&&typeof window.__safetyRelease==='function');
    check(await p.locator('#wf-sample').isDisabled()&&await p.locator('#wf-upload').isDisabled(),'pending project import locks sample and file mutations');
    await p.locator('[data-nav="home"]').click();await p.waitForFunction(()=>state.view==='home');
    await p.locator('[data-wf-nav="recurring"]').click();await p.waitForFunction(()=>state.view==='recurring');
    await p.evaluate(()=>window.__safetyRelease());await p.waitForFunction(()=>!wfState().busy);
    check(await snapshot()===baseline,'navigation away and back cancels pending old project without overwriting newer workflow state');
    check(await p.locator('#wf-sample').isEnabled(),'cancelled project releases interaction lock');
    await p.evaluate(()=>{File.prototype.text=window.__safetyText;delete window.__safetyText;delete window.__safetyRelease;});
    await p.locator('#wf-project-file').setInputFiles(projectFile);await p.waitForFunction(()=>!wfState().busy&&wfState().sources[0].name==='synthetic-replacement.csv');
    check(await p.evaluate(()=>wfState().result===null),'successful new project invalidates previous analysis');
    await p.locator('#wf-analyze').click();await p.waitForFunction(()=>!wfState().busy&&wfState().result?.valid);
    check(await p.evaluate(()=>wfState().result.groups[0].stats.mean===999),'successful project imports original values and analyzes replacement data');
    check(errors.length===0,'no uncaught browser exceptions');check(requests.length===0,'no network requests during file import, remap, report and project operations');
    fs.writeFileSync(path.join(out,'workflow-safety-result.json'),JSON.stringify({checks:checks.length,passed:checks,errors,requests},null,2));
    console.log(JSON.stringify({checks:checks.length,errors,requests,output:out}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
