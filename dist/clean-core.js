(function(root){
  'use strict';
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  const I=typeof module!=='undefined'?require('./import-core.js'):root.ImportCore;
  // A single policy seam for future entitlements. No account or billing dependency.
  const capabilities={cleanExport:true};
  const canUse=(feature,policy=capabilities)=>policy[feature]===true;
  function filename(name,format){return (String(name||'data').replace(/\.[^.]+$/,'')||'data')+'_cleaned.'+format;}
  function iso(value,date1904){const d=I.date(value,date1904);if(!d)return null;const text=new Date(d.ms).toISOString().replace(/\.000Z$/,'Z');return d.kind==='instant'?text:text.replace(/Z$/,'');}
  function prepare(data,edits=[],{format='xlsx',sourceSheet=null,X=null}={}){
    const headers=data.headers.map((h,i)=>edits[i]?.name??h),rows=data.rows.map(row=>data.headers.map((_,i)=>row[i]??''));
    const issues=[],formats={},changes={renamed:0,converted:0,csvDates:0,formulaValues:0,errorCells:0};
    const start=(data.sourceHeaderRow||1)-(data.sourceHasHeader===false?1:0),seen=new Set();
    // A formula without a cached result can live beyond C.table's trimmed rows.
    // Inspect source metadata too, so it is never silently omitted on export.
    if(sourceSheet&&X)for(const [address,cell] of Object.entries(sourceSheet)){if(address[0]==='!'||!cell.f||cell.v!==undefined&&cell.v!==null)continue;const pos=X.utils.decode_cell(address);if(pos.r>=start-1&&pos.c<headers.length)issues.push({code:'formulaMissing',row:pos.r-start,column:pos.c});}
    headers.forEach((h,i)=>{if(h!==data.headers[i])changes.renamed++;if(!String(h).trim())issues.push({code:'emptyHeader',row:null,column:i});const norm=I.normalized(h);if(seen.has(norm))issues.push({code:'duplicateHeader',row:null,column:i});seen.add(norm);});
    for(let r=0;r<rows.length;r++)for(let c=0;c<headers.length;c++){
      const address=X?.utils.encode_cell({r:r+start,c}),cell=sourceSheet?.[address],type=edits[c]?.type||'preserve';let value=rows[r][c];
      if(cell?.f){changes.formulaValues++;if(cell.v===undefined||cell.v===null){continue;}}
      if(cell?.t==='e'){value=cell.w||X?.utils.format_cell(cell)||'#ERROR!';rows[r][c]=value;changes.errorCells++;}
      if(cell?.z)formats[r+','+c]=cell.z;
      if(value===null||value===undefined||value==='')continue;
      let next=value,error=null;
      if(!['preserve','text','number','date'].includes(type))error='invalidType';
      else if(type==='text')next=String(value);
      else if(type==='number'){
        const s=String(value).normalize('NFKC').trim(),digits=s.replace(/[eE].*$/,'').replace(/[^0-9]/g,'').replace(/^0+/,'').length;
        next=C.numeric(value);if(next===null)error='invalidNumber';else if(next===0&&/[1-9]/.test(s.split(/[eE]/)[0]))error='precision';else if(typeof value==='string'&&(digits>15||Number.isInteger(next)&&!Number.isSafeInteger(next)))error='precision';
      }else if(type==='date'){next=iso(value,!!data.date1904);if(next===null)error='invalidDate';}
      else if(format==='csv'&&cell?.t==='n'&&X?.SSF.is_date(cell.z||'')){
        next=iso(cell.v,!!data.date1904);if(next===null)error='invalidDate';else changes.csvDates++;
      }
      if(error){issues.push({code:error,row:r,column:c});continue;}
      if(type!=='preserve'){delete formats[r+','+c];if(next!==value)changes.converted++;}
      rows[r][c]=next;
    }
    const formulaLike=[headers,...rows].reduce((n,row)=>n+row.filter(v=>typeof v==='string'&&/^[\s\u0000-\u001f]*[=+@-]/.test(v)).length,0);
    return {headers,rows,issues,formats,changes,formulaLike,date1904:!!data.date1904,sourceStart:start};
  }
  function csv(prepared){const field=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\uFEFF'+[prepared.headers,...prepared.rows].map(row=>row.map(field).join(',')).join('\r\n')+'\r\n';}
  function workbook(X,prepared){const wb=X.utils.book_new(),sheet=X.utils.aoa_to_sheet([prepared.headers,...prepared.rows]);wb.Workbook={WBProps:{date1904:prepared.date1904}};
    for(const [key,z] of Object.entries(prepared.formats)){const [r,c]=key.split(',').map(Number),cell=sheet[X.utils.encode_cell({r:r+1,c})];if(cell)cell.z=z;}
    sheet['!cols']=prepared.headers.map(()=>({wch:24}));X.utils.book_append_sheet(wb,sheet,'Cleaned');return wb;
  }
  const api={canUse,capabilities,filename,prepare,csv,workbook};root.CleanCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
