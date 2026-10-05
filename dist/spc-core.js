(function(root){
  'use strict';
  const I18n=root.I18n||(typeof require==='function'?require('./i18n.js'):null);
  const C=typeof module!=='undefined'?require('./core.js'):root.ToolboxCore;
  // d2/d3, normal ranges (Minitab). A2/D3/D4 are derived, not rounded again.
  const rangeConstants={2:[1.128,.8525],3:[1.693,.8884],4:[2.059,.8798],5:[2.326,.8641],6:[2.534,.8480],7:[2.704,.8332],8:[2.847,.8198],9:[2.970,.8078],10:[3.078,.7971]};
  function constants(n){if(!rangeConstants[n])throw Error((I18n.t("spc-core.0275f46dc0")));const [d2,d3]=rangeConstants[n];return {d2,d3,A2:3/(d2*Math.sqrt(n)),D3:Math.max(0,1-3*d3/d2),D4:1+3*d3/d2};}
  const rules=I18n.labels(()=> ({1:(I18n.t("spc-core.44b28438fc")),2:(I18n.t("spc-core.9506b3e8ab")),3:(I18n.t("spc-core.882f66bc64")),4:(I18n.t("spc-core.d934886adc")),5:(I18n.t("spc-core.7570e1709a")),6:(I18n.t("spc-core.6ba6e77052")),7:(I18n.t("spc-core.1a9eaad02e")),8:(I18n.t("spc-core.660872bfed"))}));
  function nelson(records,center,sigma,enabled=[1]){
    if(!Array.isArray(enabled)||enabled.some(x=>!Number.isInteger(x)||!rules[x]))throw Error((I18n.t("spc-core.2bbb1f9f92")));
    if(!(sigma>0)||!Number.isFinite(sigma))return [];
    const hits=[],run=[];
    const same=(a,t)=>a.filter(v=>v>t).length;
    for(const record of records){
      if(!Number.isFinite(record.value)){run.length=0;continue;}
      if(run.length&&record.index!==run.at(-1).index+1)run.length=0;
      run.push({...record,z:(record.value-center)/sigma});if(run.length>15)run.shift();
      for(const rule of enabled){const size={1:1,2:9,3:6,4:14,5:3,6:5,7:15,8:8}[rule];if(run.length<size)continue;
        const window=run.slice(-size),z=window.map(x=>x.z),diff=window.slice(1).map((x,i)=>x.value-window[i].value);let match=false;
        if(rule===1)match=Math.abs(z[0])>3;
        if(rule===2)match=z.every(v=>v>0)||z.every(v=>v<0);
        if(rule===3)match=diff.every(v=>v>0)||diff.every(v=>v<0);
        if(rule===4)match=diff.every((v,i)=>v!==0&&(!i||Math.sign(v)!==Math.sign(diff[i-1])));
        if(rule===5)match=same(z,2)>=2||same(z.map(v=>-v),2)>=2;
        if(rule===6)match=same(z,1)>=4||same(z.map(v=>-v),1)>=4;
        if(rule===7)match=z.every(v=>Math.abs(v)<=1);
        if(rule===8)match=z.every(v=>Math.abs(v)>1);
        if(match)hits.push({rule,index:record.index,startIndex:window[0].index,value:record.value});
      }
    }return hits;
  }
  function analyze(raw,{lsl=null,usl=null,chart='imr',subgroupSize=5,rules:enabled=[1]}={}){
    if(!['imr','xbar'].includes(chart))throw Error((I18n.t("spc-core.2f45379966")));
    let r,chartRecords,rangeRecords,rangeMean,limits,chartSigma,groups=[],excludedGroups=[];
    if(chart==='imr'){
      r=C.analyze(raw,lsl,usl);chartRecords=r.records;rangeRecords=[];
      r.records.forEach((x,i)=>{const prev=r.records[i-1];if(prev&&x.index===prev.index+1)rangeRecords.push({index:x.index,value:Math.abs(x.value-prev.value)});});
      rangeMean=r.mr;limits=constants(2);chartSigma=r.within;
    }else{
      if(!Number.isInteger(subgroupSize))throw Error((I18n.t("spc-core.db06f263e4")));limits=constants(subgroupSize);
      const retained=Array(raw.length).fill(null);
      for(let i=0;i<raw.length;i+=subgroupSize){const cells=raw.slice(i,i+subgroupSize).map(C.numeric),index=i/subgroupSize;
        if(cells.length!==subgroupSize||cells.some(x=>x===null)){excludedGroups.push({index,start:i,end:Math.min(raw.length-1,i+subgroupSize-1),reason:cells.length!==subgroupSize?(I18n.t("spc-core.b6423572d2")):(I18n.t("spc-core.958cd27918"))});continue;}
        const mean=cells.reduce((m,v,k)=>m+(v-m)/(k+1),0),range=Math.max(...cells)-Math.min(...cells);
        groups.push({index,start:i,end:i+subgroupSize-1,mean,range});cells.forEach((v,j)=>retained[i+j]=v);
      }
      if(groups.length<2)throw Error((I18n.t("spc-core.466fe46fa5")));
      r=C.analyze(retained,lsl,usl);rangeMean=groups.reduce((s,g)=>s+g.range,0)/groups.length;
      r.within=rangeMean/limits.d2;r.mr=null;chartSigma=r.within/Math.sqrt(subgroupSize);
      r.cp=r.within>0&&lsl!==null&&usl!==null?(usl-lsl)/(6*r.within):null;
      r.cpk=r.within>0&&(lsl!==null||usl!==null)?Math.min(lsl===null?Infinity:(r.mean-lsl)/(3*r.within),usl===null?Infinity:(usl-r.mean)/(3*r.within)):null;
      chartRecords=groups.map(g=>({index:g.index,value:g.mean}));rangeRecords=groups.map(g=>({index:g.index,value:g.range}));
      r.lcl=r.mean-3*chartSigma;r.ucl=r.mean+3*chartSigma;
    }
    const rangeLcl=rangeMean===null?null:limits.D3*rangeMean,rangeUcl=rangeMean===null?null:limits.D4*rangeMean;
    r.signals=chartSigma>0?chartRecords.filter(x=>x.value<r.lcl||x.value>r.ucl):[];
    const alarms=nelson(chartRecords,r.mean,chartSigma,enabled);
    for(const v of [r.mean,r.sd,r.within,r.cp,r.cpk,r.pp,r.ppk,r.lcl,r.ucl,rangeMean,rangeUcl])if(v!==null&&!Number.isFinite(v))throw Error((I18n.t("spc-core.acd3f977ef")));
    return {...r,chart,subgroupSize:chart==='imr'?1:subgroupSize,chartRecords,rangeRecords,rangeMean,rangeLcl,rangeUcl,chartSigma,groups,excludedGroups,constants:limits,rules:[...enabled],alarms,rangeSignals:rangeUcl===null?[]:rangeRecords.filter(x=>x.value>rangeUcl||x.value<rangeLcl)};
  }
  const api={constants,rangeConstants,rules,nelson,analyze};root.SPCCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
