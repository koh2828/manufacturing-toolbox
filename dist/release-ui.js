'use strict';
const rt=(key,args=[])=>I18n.t('release.'+key,args);
const sampleBackups=new Map();
const sampleKeys={
  capability:['data','col','lsl','usl','unit','quality','qualityView','result'],
  cycle:['cycleData','cycleColumns','cycleSettings','cycleResult'],
  pareto:['paretoData','paretoCategory','paretoValue'],
  clean:['cleanData','cleanEdits','cleanFormat','cleanReviewed'],
  rci:['rciData','rciColumns'],rciProject:['rci']
};
const importKeys=['workbook','raw','headerRow','hasHeader','headerDetection','sheet','appliedPreset','restoreNote'];
function currentRealWork(tool){return tool==='recurring'||tool==='batch'?wfState(tool).sources.some(s=>!s.isDemo):tool==='rciProject'?state.rci&&!state.rci.isDemo:activeData()&&!activeData().isDemo;}
function rememberSample(tool=state.view){
  if(sampleBackups.has(tool)){
    if(!currentRealWork(tool))return true;
    if(!confirm(rt('replaceBackup')))return false;
    sampleBackups.delete(tool);
  }
  if(tool==='recurring'||tool==='batch'){
    const w=wfState(tool);if(w.sources.some(s=>!s.isDemo))sampleBackups.set(tool,{workflow:structuredClone(w),appliedPreset:state.appliedPreset,restoreNote:state.restoreNote});
  }else{
    const data=tool==='rciProject'?state.rci:activeData();if(!data||data.isDemo)return true;
    const keys=[...sampleKeys[tool],...(tool==='rciProject'?[]:importKeys)],saved={};
    // Workbooks/data remain in memory; settings are cloned because controls mutate them in place.
    const immutable=new Set(['workbook','raw','data','cycleData','paretoData','cleanData','rciData']);
    for(const key of keys)saved[key]=immutable.has(key)?state[key]:structuredClone(state[key]);
    sampleBackups.set(tool,{saved,dirty:tool==='rciProject'?dirty:undefined});
  }
  return true;
}
function restoreSample(tool=state.view){
  const backup=sampleBackups.get(tool);if(!backup)return;
  if(currentRealWork(tool)&&!confirm(rt('restoreOverNewWork')))return;
  if(backup.workflow){state.workflows[tool]=backup.workflow;state.appliedPreset=backup.appliedPreset;state.restoreNote=backup.restoreNote;}else Object.assign(state,backup.saved);
  if(tool==='rciProject')dirty=backup.dirty;
  sampleBackups.delete(tool);render();
}
function sampleReturnButton(tool=state.view){return sampleBackups.has(tool)?`<button data-restore-sample="${esc(tool)}">${esc(rt('restoreSample'))}</button>`:'';}
function bindSampleReturn(){for(const b of $$('[data-restore-sample]'))b.onclick=()=>restoreSample(b.dataset.restoreSample);}
function releaseHome(){return `<section class="panel release-intro"><span class="tag demo">${esc(rt('beta'))} · ${ReleaseConfig.version}</span><h2>${esc(rt('purpose'))}</h2><p>${esc(rt('privacy'))}</p><p class="section-note">${esc(rt('limits'))}</p><div class="load-actions"><button id="release-quality-sample">${esc(rt('sampleQuality'))}</button><button id="release-cycle-sample">${esc(rt('sampleCycle'))}</button><button id="release-feedback">${esc(rt('feedback'))}</button></div></section>`;}
function bindReleaseHome(){for(const [id,tool] of [['release-quality-sample','capability'],['release-cycle-sample','cycle']])$('#'+id).onclick=()=>{navigate(tool);sample();};$('#release-feedback').onclick=()=>navigate('feedback');}
function renderFeedback(){
  $('.content').classList.remove('capability-wide');$('#eyebrow').textContent='MANUFACTURING TOOLBOX';$('#page-title').textContent=rt('feedback');$('#page-description').textContent=rt('feedbackIntro');
  $$('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav==='feedback');b.setAttribute('aria-current',b.dataset.nav==='feedback'?'page':'false');});
  const url=ReleaseConfig.feedbackURL(I18n.language);
  $('#workspace').innerHTML=`<section class="panel"><h2>${esc(rt('beforeContact'))}</h2><p>${esc(rt('privacy'))}</p><p>${esc(rt('contactWarning'))}</p><p>${esc(rt('contactFields'))}</p>${url?`<a class="feedback-link" id="feedback-external" href="${esc(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(rt('openForm'))} ↗</a>`:`<div class="notice neutral" id="feedback-unconfigured" role="status">${esc(rt('unconfigured'))}</div>`}<p class="section-note">${esc(rt('noTransfer'))}</p><button id="feedback-home">${esc(rt('home'))}</button></section>`;
  $('#feedback-home').onclick=()=>navigate('home');
}
function hasMemoryWork(){return sampleBackups.size>0||['data','cycleData','paretoData','cleanData','rciData'].some(k=>state[k]&&!state[k].isDemo)||Object.values(state.workflows||{}).some(w=>w.sources.some(s=>!s.isDemo))||typeof di!=='undefined'&&(di.busy||di.documents.length>0);}
window.addEventListener('beforeunload',e=>{if(hasMemoryWork()){e.preventDefault();e.returnValue='';}});
