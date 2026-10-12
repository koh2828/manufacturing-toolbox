const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dist=path.join(__dirname,'../dist');
test('公開HTMLは外部接続・フォーム送信・インラインスクリプトをCSPで禁止',()=>{const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);assert.match(html,/object-src 'none'/);const policy=html.match(/script-src ([^;]+)/)[1];assert.equal(policy,"'self'");assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html),false);for(const [,src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)){assert.ok(!/^(https?:|\/\/)/.test(src));assert.ok(fs.existsSync(path.join(dist,src)));}});
test('全自作モジュールにアップロードAPI・解析送信・追跡用通信・データログを持たない',()=>{
  const discover=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.name==='vendor'?[]:entry.isDirectory()?discover(path.join(dir,entry.name)):/\.js$/.test(entry.name)?[path.join(dir,entry.name)]:[]);
  const own=discover(dist);assert.ok(own.length>=18);
  for(const file of own){const src=fs.readFileSync(file,'utf8');assert.equal(/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(/.test(src),false,file);assert.equal(/localStorage\.clear\s*\(/.test(src),false,file);assert.equal(/console\.(log|info|warn|error|debug|table|dir|trace)\s*\(/.test(src),false,file);}
});
