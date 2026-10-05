(function(root){
  'use strict';
  const catalogs=typeof module!=='undefined'?{ja:require('./locales/ja.js'),en:require('./locales/en.js')}:root.ToolboxLocales;
  const KEY='manufacturing-toolbox.language.v1';let language='ja';
  try{const saved=root.localStorage?.getItem(KEY);if(saved==='en'||saved==='ja')language=saved;}catch{}
  function t(key,params=[]){const value=catalogs[language]?.[key]??catalogs.ja[key];if(value===undefined)throw Error('Unknown UI message: '+key);return value.replace(/\{(\d+)\}/g,(match,n)=>String(params[n]??match));}
  function applyShell(){if(!root.document)return;document.documentElement.lang=language;document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-i18n-attrs]').forEach(el=>el.dataset.i18nAttrs.split(';').forEach(pair=>{const [attr,key]=pair.split(':');el.setAttribute(attr,t(key));}));document.querySelectorAll('[data-language]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.language===language));});}
  function setLanguage(value){if(!['ja','en'].includes(value))return false;language=value;let saved=true;try{root.localStorage?.setItem(KEY,value);}catch{saved=false;}applyShell();return saved;}
  // Static label maps are resolved at use time, so a language switch needs no data rewrite.
  function labels(factory){return new Proxy({}, {get:(_,key)=>factory()[key],ownKeys:()=>Reflect.ownKeys(factory()),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});}
  const api={KEY,t,labels,setLanguage,applyShell,get language(){return language;},get numberLocale(){return language==='en'?'en-US':'ja-JP';}};
  root.I18n=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
