(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore;
  const L=typeof module!=='undefined'?require('./i18n.js'):root.I18n;
  const MAX_BYTES=10*1024*1024,MAX_ROWS=50001;
  const MAX_EXPANDED_BYTES=100*1024*1024,MAX_ENTRY_BYTES=32*1024*1024,MAX_ZIP_ENTRIES=4096;
  const failure=()=>new Error(L.t('app.518b35606d'));
  function message(error){
    if(error?.code==='FORMULA_MISSING'&&Number.isInteger(error.count)&&error.count>0&&/^[A-Z]{1,4}[1-9]\d{0,6}$/.test(error.cell||''))return L.t('import.formulaMissing',[error.count,error.cell]);
    for(const key of ['app.f60e978937','app.f0e46dff25','app.8c058427ec','app.6b5f159324','app.518b35606d','import-core.b6ddc84d1c','import.archiveLimit'])if(error?.message===L.t(key))return L.t(key);
    return null;
  }

  // Check archive metadata before the synchronous vendor parser allocates inflated
  // XML. This bounds declared sizes; it is not a complete malicious ZIP defense.
  function checkArchive(data){
    const bytes=data instanceof ArrayBuffer?new Uint8Array(data):ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):null;
    if(!bytes||bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)return;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
    if(end<0)throw failure();
    const count=v.getUint16(end+10,true),length=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
    if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count!==v.getUint16(end+8,true)||count===65535||length===0xffffffff||offset===0xffffffff)throw failure();
    if(count>MAX_ZIP_ENTRIES)throw Error(L.t('import.archiveLimit'));
    if(offset+length>end)throw failure();let cursor=offset,total=0;
    for(let i=0;i<count;i++){
      if(cursor+46>offset+length||v.getUint32(cursor,true)!==0x02014b50)throw failure();
      const compressed=v.getUint32(cursor+20,true),expanded=v.getUint32(cursor+24,true),local=v.getUint32(cursor+42,true);
      if(compressed===0xffffffff||expanded===0xffffffff||local===0xffffffff||v.getUint16(cursor+34,true))throw failure();
      if(expanded>MAX_ENTRY_BYTES||(total+=expanded)>MAX_EXPANDED_BYTES)throw Error(L.t('import.archiveLimit'));
      if(local+30>offset||v.getUint32(local,true)!==0x04034b50)throw failure();
      if(local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true)+compressed>offset)throw failure();
      cursor+=46+v.getUint16(cursor+28,true)+v.getUint16(cursor+30,true)+v.getUint16(cursor+32,true);
      if(cursor>offset+length)throw failure();
    }
    if(cursor!==offset+length)throw failure();
  }

  // SheetJS has diagnostic branches containing workbook text. Suppress them only
  // during a synchronous vendor operation; always restore the original console.
  function quietVendor(action){
    const logger=root.console,restore=[];
    try{
      if(logger)for(const key of ['log','info','warn','error','debug','assert','dir','table','trace']){
        if(typeof logger[key]!=='function')continue;
        const descriptor=Object.getOwnPropertyDescriptor(logger,key);
        Object.defineProperty(logger,key,{configurable:true,writable:true,enumerable:descriptor?.enumerable??true,value:()=>{}});
        restore.push([key,descriptor]);
      }
      return action();
    }finally{
      for(const [key,descriptor] of restore.reverse()){
        if(descriptor)Object.defineProperty(logger,key,descriptor);else delete logger[key];
      }
    }
  }
  function safeRead(X,data,options){
    if(!X)throw Error(L.t('app.6b5f159324'));
    checkArchive(data);
    try{return quietVendor(()=>X.read(data,options));}catch{throw failure();}
  }
  function safeWrite(X,workbook,options){
    if(!X)throw Error(L.t('app.81fc5f9a1d'));
    try{return quietVendor(()=>X.write(workbook,options));}catch{throw failure();}
  }
  async function read(file,X){
    if(file.size>MAX_BYTES)throw Error(L.t('app.f60e978937'));
    const name=String(file.name||''),extension=name.split('.').pop().toLowerCase();
    if(!['xlsx','xls','csv','tsv'].includes(extension))throw Error(L.t('app.8c058427ec'));
    if(['xlsx','xls'].includes(extension)&&!X)throw Error(L.t('app.6b5f159324'));
    let buffer;
    try{buffer=await file.arrayBuffer();}catch{throw failure();}
    let raw,workbook=null,sheet='';
    if(['xlsx','xls'].includes(extension)){
      workbook=safeRead(X,buffer,{type:'array',cellDates:false,cellNF:true});
      sheet=workbook.SheetNames[0];
      try{raw=quietVendor(()=>I.sheetRows(X,workbook.Sheets[sheet]));}
      catch(error){
        // Keep the existing size-limit guidance, without returning parser text.
        if(error?.message===L.t('import-core.b6ddc84d1c')||error?.code==='FORMULA_MISSING')throw error;
        throw failure();
      }
    }else{
      let text=new TextDecoder('utf-8').decode(buffer);
      if(text.includes('\uFFFD'))text=new TextDecoder('shift-jis').decode(buffer);
      raw=C.csv(text,extension==='tsv'?'\t':',');
    }
    if(raw.length>MAX_ROWS)throw Error(L.t('app.f0e46dff25'));
    const headerDetection=C.detectHeader(raw),headerRow=headerDetection.headerRow,hasHeader=headerDetection.hasHeader;
    const table=C.table(raw.slice(headerRow-1),hasHeader),date1904=Boolean(workbook?.Workbook?.WBProps?.date1904);
    Object.assign(table,{date1904,sourceHeaderRow:headerRow,sourceHasHeader:hasHeader,sheet});
    return {workbook,raw,table,headerRow,hasHeader,headerDetection,sheet,name,date1904};
  }
  const api={read,safeRead,safeWrite,quietVendor,checkArchive,message,MAX_BYTES,MAX_ROWS,MAX_EXPANDED_BYTES,MAX_ENTRY_BYTES,MAX_ZIP_ENTRIES};
  root.FileReaderCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
