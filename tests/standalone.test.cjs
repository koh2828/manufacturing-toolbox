const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'Launch.html'),'utf8');
test('Launch bundles exactly the source scripts with valid CSP hashes',()=>{
  const source=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
  const files=[...source.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(m=>m[1]);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.equal(scripts.length,files.length);
  files.forEach((file,i)=>{
    const expected='\n'+fs.readFileSync(path.join(root,'dist',file),'utf8').replace(/\r\n?/g,'\n').replace(/<\/script/gi,'<\\/script')+'\n';
    assert.equal(scripts[i],expected,file);
    const hash=crypto.createHash('sha256').update(scripts[i]).digest('base64');
    assert.ok(html.includes("'sha256-"+hash+"'"),file);
  });
  assert.equal(/<script[^>]+src=/.test(html),false);
  assert.equal(/<link[^>]+rel="stylesheet"/.test(html),false);
  assert.ok(html.includes("connect-src 'none'"));
});
test('Launch carries the bundled license and root entry points to it',()=>{
  const license=fs.readFileSync(path.join(root,'dist/vendor/LICENSE.sheetjs.txt'),'utf8').replace(/--/g,'—');
  assert.ok(html.includes('<!-- Bundled SheetJS CE license\n'+license+'\n-->'));
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/url=Launch\.html/);
  assert.match(fs.readFileSync(path.join(root,'README.md'),'utf8'),/https:\/\/koh2828\.github\.io\/manufacturing-toolbox\/Launch\.html/);
});
