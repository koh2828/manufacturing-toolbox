const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/release-config.js');
test('feedback is unconfigured until owner sets an approved HTTPS URL',()=>{
 assert.equal(R.feedbackURL('ja'),'');assert.equal(R.feedbackURL('en'),'');
 const configured={FEEDBACK_FORM_URL_JA:'https://tally.so/r/DEMO',FEEDBACK_FORM_URL_EN:'https://tally.so/r/EN',approvedFeedbackHosts:['tally.so']};
 assert.equal(R.feedbackURL('ja',configured),'https://tally.so/r/DEMO');assert.equal(R.feedbackURL('en',configured),'https://tally.so/r/EN');
 for(const bad of ['http://tally.so/r/DEMO','https://tally.so.evil.example/r/X','https://evil.example/','https://u:p@tally.so/r/X','https://tally.so:8000/r/X','https://tally.so/r/X?email=private','https://tally.so/r/X#state','javascript:alert(1)','//tally.so/r/X'])assert.equal(R.feedbackURL('ja',{...configured,FEEDBACK_FORM_URL_JA:bad}),'');
});
test('release labels and guidance available in both languages',()=>{
 const ja=require('../dist/locales/ja.js'),en=require('../dist/locales/en.js');
 for(const key of Object.keys(ja).filter(k=>k.startsWith('release.')||k.startsWith('recurring.mixed')||k.startsWith('recurring.incomparable')))assert.ok(en[key]&&ja[key],key);
 assert.equal(R.scope.documents,'EXPERIMENTAL');assert.equal(Object.values(R.scope).filter(v=>v==='PUBLIC_BETA').length,7);
});
