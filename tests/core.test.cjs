const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≠ ${b}`);
test('既知の5点で平均・標本分散・MR・能力指数を照合',()=>{const r=C.analyze([1,2,3,4,5],0,6);near(r.mean,3);near(r.sd,Math.sqrt(2.5));near(r.within,1/1.128);near(r.cp,1.128);near(r.cpk,1.128);near(r.pp,1/Math.sqrt(2.5));assert.equal(r.oos.length,0);near(r.ucl,3+3/1.128);});
test('片側規格・規格境界・負のCpk',()=>{const r=C.analyze([1,2,3],null,2);assert.equal(r.cp,null);near(r.cpk,0);assert.deepEqual(r.oos.map(x=>x.index),[2]);assert.ok(C.analyze([5,6,7],0,3).cpk<0);});
test('欠損をまたぐ移動範囲を除外',()=>{const r=C.analyze([1,2,'',100,101,'invalid',null],0,110);assert.equal(r.excluded,3);near(r.mr,1);assert.deepEqual(r.records.map(x=>x.index),[0,1,3,4]);const t=C.table(C.csv('x\n1\n\n100\n101'),true);assert.equal(t.rows.length,4);near(C.analyze(t.rows.map(x=>x[0])).mr,1);});
test('定数列・孤立した値・不正入力',()=>{assert.equal(C.analyze([3,3,3],0,6).cp,null);assert.equal(C.analyze([1,'',2],0,6).cp,null);assert.throws(()=>C.analyze([1]));assert.throws(()=>C.analyze([1,2],2,1));assert.throws(()=>C.analyze([1e308,-1e308],0,2));});
test('CSVの引用符・改行・TSV・BOM・数値を厳密に解釈',()=>{assert.deepEqual(C.csv('\ufeffa,b\n"x,y","a""b"\n"line\nnext",3'),[['a','b'],['x,y','a"b'],['line\nnext','3']]);assert.deepEqual(C.csv('a\tb\n1\t2'),[['a','b'],['1','2']]);assert.throws(()=>C.csv('a\n"bad'));assert.equal(C.numeric(''),null);assert.equal(C.numeric('12mm'),null);assert.equal(C.numeric('１２．３'),12.3);assert.equal(C.numeric('1e3'),1000);});
test('パレートの重複合算・無効行除外・累積比率',()=>{const r=C.pareto([['A',4],['B',3],['A',2],['C',1],['D',-1],['',2],['E','bad']]);assert.equal(r.total,10);assert.equal(r.excluded,3);assert.deepEqual(r.items.map(x=>[x.label,x.value,x.cumulative]),[['A',6,60],['B',3,90],['C',1,100]]);});
test('RCIファイルの形式と保存・復元',()=>{const p={title:'test',when:'',where:'',impact:'事実',immediate:'',whys:[{cause:'仮説',evidence:'',status:'unknown'}],timeline:[],actions:[]};const obj={format:'manufacturing-toolbox-rci',version:1,project:p};assert.deepEqual(C.validateRCI(JSON.parse(JSON.stringify(obj))),p);assert.throws(()=>C.validateRCI({}));assert.throws(()=>C.validateRCI({...obj,project:{...p,whys:[{cause:'x',evidence:'',status:'fake'}]}}));});
test('Excelの読み書きとセル文字列の保持',()=>{const X=require('../dist/vendor/xlsx.full.min.js'),wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['項目','値'],['=1+1',12.5],['粘度',10]]),'検査');const b=X.write(wb,{type:'buffer',bookType:'xlsx'}),read=X.read(b,{type:'buffer'});assert.equal(read.Sheets['検査'].A2.t,'s');assert.equal(read.Sheets['検査'].A2.f,undefined);assert.equal(read.Sheets['検査'].B2.v,12.5);});
test('タイトル・備考・空白行・空白列を避けて見出しを自動判定',()=>{
  const rows=[[],['','9月検査日報'],['','測定者','Aさん'],[],['','測定日','ロット','','粘度','揮発分'],['','2026-09-01','LOT-A','',1000,.3],[],['','2026-09-02','LOT-B','',1020,.4],['','2026-09-03','LOT-C','',1010,.35]];
  const d=C.detectHeader(rows);assert.equal(d.headerRow,5);assert.equal(d.hasHeader,true);assert.equal(d.confidence,'high');
  const mapped=C.table(rows.slice(d.headerRow-1),d.hasHeader);assert.equal(mapped.rows.length,4);assert.deepEqual(C.analyze(mapped.rows.map(r=>r[5])).records.map(r=>r.index),[0,2,3]);
});
test('1列・通常CSV・パレート表の見出しを判定',()=>{
  for(const rows of [[['粘度'],[10],[11],[12]],C.csv('分類,件数\nキズ,10\n異物,5\n変色,2'),[['日付','粘度'],['2026-09-01',10],['2026-09-02',11]]]){
    const d=C.detectHeader(rows);assert.equal(d.headerRow,1);assert.equal(d.hasHeader,true);assert.equal(d.confidence,'high');
  }
});
test('見出しなしの最初の測定値と数値表記ゆれを落とさない',()=>{
  for(const rows of [[[10],[11],[12]],[['LOT-A',10],['LOT-B',11],['LOT-C',12]],[['LOT-A','1,000'],['LOT-B',1100],['LOT-C',1200]],[['ND'],[11],[12]],[['0.5 %'],[.6],[.7]]]){
    const d=C.detectHeader(rows);assert.equal(d.headerRow,1);assert.equal(d.hasHeader,false);assert.equal(C.table(rows.slice(d.headerRow-1),d.hasHeader).rows.length,rows.length);
  }
  const d=C.detectHeader([[],[],[10],[11]]);assert.equal(d.headerRow,3);assert.equal(d.hasHeader,false);
});
test('同程度の候補・数値のない表は要確認にする',()=>{
  assert.equal(C.detectHeader([['粘度','密度'],[10,1],[11,2],[],['粘度','密度'],[12,1],[13,2]]).confidence,'low');
  assert.equal(C.detectHeader([['作業メモ'],['未測定です']]).confidence,'low');assert.throws(()=>C.detectHeader([[],['']]));
});
test('検索範囲は先頭100行に限る',()=>{
  const rows=[['注記'],...Array.from({length:99},()=>[]),['粘度'],[10],[11]];
  const d=C.detectHeader(rows);assert.equal(d.confidence,'low');assert.equal(d.headerRow,1);
});
