const {chromium}=require(process.env.TOOLBOX_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const out=process.env.TOOLBOX_TEST_OUTPUT||'local-test-results/release-startup';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const base=process.env.TOOLBOX_URL||'http://127.0.0.1:8773/manufacturing-toolbox/';let checks=0;
 await p.goto(base);await p.waitForSelector('.release-intro');assert.ok(p.url().includes('/manufacturing-toolbox/Launch.html'));checks++;
 const file=pathToFileURL(path.resolve(__dirname,'../Launch.html')).href;await p.goto(file+'#home');await p.waitForSelector('.release-intro');checks++;
 for(const tool of ['capability','cycle','pareto','rci','clean','recurring','batch','feedback']){await p.evaluate(tool=>navigate(tool),tool);assert.ok(await p.locator('#page-title').innerText());checks++;}
 await p.evaluate(()=>{navigate('capability');sample();});assert.ok(await p.evaluate(()=>state.result.n>0));checks++;
 await p.evaluate(()=>navigate('documents'));assert.ok((await p.locator('#workspace').innerText()).includes('HTTP'));checks++;
 assert.deepEqual(errors,[]);const result={checks,browser:b.version(),fileLaunch:'core UI and calculation pass; OCR requires HTTP',baseRedirect:'pass',errors};fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await b.close();})().catch(e=>{console.error(e);process.exit(1);});
