(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore;
  const L=typeof module!=='undefined'?require('./i18n.js'):root.I18n;
  const MAX_BYTES=10*1024*1024,MAX_ROWS=50001;
  const failure=()=>new Error(L.t('app.518b35606d'));

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
        if(error?.message===L.t('import-core.b6ddc84d1c'))throw Error(L.t('import-core.b6ddc84d1c'));
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
  const api={read,safeRead,safeWrite,quietVendor,MAX_BYTES,MAX_ROWS};
  root.FileReaderCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
