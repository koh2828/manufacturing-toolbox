(function(root){
  'use strict';
  // Owner-reviewed configuration only. Never construct this URL from imported data or browser state.
  const config=Object.freeze({
    version:'v0.8.1-beta.1',
    FEEDBACK_FORM_URL_JA:'',
    FEEDBACK_FORM_URL_EN:'',
    approvedFeedbackHosts:Object.freeze(['tally.so']),
    scope:Object.freeze({capability:'PUBLIC_BETA',cycle:'PUBLIC_BETA',rci:'PUBLIC_BETA',pareto:'PUBLIC_BETA',clean:'PUBLIC_BETA',recurring:'PUBLIC_BETA',batch:'PUBLIC_BETA',documents:'EXPERIMENTAL'})
  });
  function feedbackURL(language,settings=config){
    const raw=settings[language==='en'?'FEEDBACK_FORM_URL_EN':'FEEDBACK_FORM_URL_JA'];
    if(!raw)return '';
    try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!settings.approvedFeedbackHosts.includes(url.hostname))return '';return url.href;}catch{return '';}
  }
  const api={...config,feedbackURL};root.ReleaseConfig=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
