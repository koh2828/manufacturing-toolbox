/* Local document reader. Only fixed, same-origin runtime/model assets may be requested. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DocumentEngine = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const scriptURL = typeof document === 'object' ? document.currentScript?.src : '';
  const LIMITS = Object.freeze({ fileBytes: 50 * 1024 * 1024, pages: 100, canvasPixels: 16000000, words: 30000 });
  const VERSION = 'pdfjs-6.4.299+tesseract-7.0.0';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, Number(x) || 0));
  const now = () => root.performance?.now?.() || Date.now();
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const ERROR_CODES = new Set(['FILE_SIZE','FILE_TYPE','PAGE_LIMIT','PAGE_RANGE','PAGE_TOO_COMPLEX','IMAGE_TOO_LARGE','IMAGE_UNREADABLE','DOCUMENT_UNREADABLE','PAGE_UNREADABLE','PDF_PASSWORD_REQUIRED','PDF_RUNTIME_UNAVAILABLE','OCR_RUNTIME_UNAVAILABLE','HOSTED_ASSETS_REQUIRED','ASSET_ORIGIN','ENGINE_DISPOSED','ENGINE_BUSY','CANCELLED','PREVIEW_UNAVAILABLE','PREVIEW_CANCELLED']);
  function fail(code) { const safe=ERROR_CODES.has(code)?code:'DOCUMENT_UNREADABLE';const e = new Error(safe); e.code = safe; return e; }
  function options(input = {}) {
    return { language: ['eng', 'jpn', 'eng+jpn', 'jpn+eng'].includes(input.language) ? input.language : 'eng+jpn',
      forceOCR: input.forceOCR === true, layout: input.layout === 'auto' ? 'auto' : 'block', preprocess: ['original', 'grayscale', 'contrast', 'binary'].includes(input.preprocess) ? input.preprocess : 'original',
      rotation: [0, 90, 180, 270].includes(Number(input.rotation)) ? Number(input.rotation) : 0,
      deskew: clamp(input.deskew, -10, 10), scale: clamp(input.scale ?? 2, 1, 3), denoise: input.denoise === true,
      pageNumbers: Array.isArray(input.pageNumbers) ? [...new Set(input.pageNumbers.filter(n => Number.isInteger(n) && n > 0))] : null,
      onPage: typeof input.onPage === 'function' ? input.onPage : null };
  }
  function normalizeBox(b, width, height) {
    const x = clamp(b[0] / width, 0, 1), y = clamp(b[1] / height, 0, 1);
    return [x, y, clamp(b[2] / width, 0, 1 - x), clamp(b[3] / height, 0, 1 - y)];
  }
  function textSufficient(words) {
    const text = words.map(w => w.text).join(' '), useful = text.replace(/\s/g, '');
    return words.length >= 8 && useful.length >= 60 && (useful.match(/[\uFFFD\u0000-\u0008]/g)?.length || 0) / useful.length < 0.08;
  }
  function textWords(content, viewport, util) {
    const words = [];
    for (const item of content.items || []) {
      if (!item.str?.trim() || !item.transform) continue;
      const transform = util.transform(viewport.transform, item.transform), style = content.styles?.[item.fontName] || {};
      const height = Math.hypot(transform[2], transform[3]), width = Math.abs(item.width * viewport.scale);
      const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.85;
      const x = transform[4], y = transform[5] - height * ascent;
      for (const match of item.str.matchAll(/\S+/g)) {
        const left = x + width * match.index / item.str.length, span = width * match[0].length / item.str.length;
        words.push({ text: match[0], bbox: normalizeBox([left, y, span, height], viewport.width, viewport.height), confidence: null });
        if (words.length > LIMITS.words) throw fail('PAGE_TOO_COMPLEX');
      }
    }
    return words;
  }
  function ocrWords(data, width, height, inverse, layoutSize) {
    const words = [];
    for (const block of data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) for (const word of line.words || []) {
      if (!word.text?.trim() || !word.bbox) continue;
      const { x0, y0, x1, y1 } = word.bbox;
      const corners = [[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(p => inverse ? inverse(p) : p);
      const xs = corners.map(p=>p[0]), ys = corners.map(p=>p[1]);
      const l = Math.min(...xs), t = Math.min(...ys), r = Math.max(...xs), b = Math.max(...ys);
      words.push({ text: word.text.trim(), bbox: normalizeBox([l,t,r-l,b-t], width,height), ...(layoutSize?{layoutBBox:normalizeBox([x0,y0,x1-x0,y1-y0],layoutSize[0],layoutSize[1])}:{}), confidence: Number.isFinite(word.confidence) ? clamp(word.confidence,0,100) : null });
      if (words.length > LIMITS.words) throw fail('PAGE_TOO_COMPLEX');
    }
    return words;
  }
  function assetBase() {
    if (typeof location !== 'object' || !['http:', 'https:'].includes(location.protocol)) throw fail('HOSTED_ASSETS_REQUIRED');
    const fromScript = scriptURL ? new URL('vendor/document/', scriptURL) : new URL(/\/Launch\.html$/i.test(location.pathname) ? 'dist/vendor/document/' : 'vendor/document/', location.href);
    if (fromScript.origin !== location.origin) throw fail('ASSET_ORIGIN');
    return fromScript.href;
  }
  let pdfLibrary = null, tesseractLibrary = null;
  async function loadPDF() {
    if (!pdfLibrary) pdfLibrary = import(assetBase() + 'pdf/pdf.min.mjs').catch(() => { pdfLibrary = null; throw fail('PDF_RUNTIME_UNAVAILABLE'); });
    const lib = await pdfLibrary; lib.GlobalWorkerOptions.workerSrc = assetBase() + 'pdf/pdf.worker.min.mjs'; return lib;
  }
  async function loadTesseract() {
    if (root.Tesseract) return root.Tesseract;
    if (!tesseractLibrary) tesseractLibrary = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = assetBase() + 'tesseract/tesseract.min.js';
      script.onload = () => root.Tesseract ? resolve(root.Tesseract) : reject(fail('OCR_RUNTIME_UNAVAILABLE'));
      script.onerror = () => { script.remove(); reject(fail('OCR_RUNTIME_UNAVAILABLE')); }; document.head.append(script);
    }).catch(e => { tesseractLibrary = null; throw e; });
    return tesseractLibrary;
  }
  function canvas(width, height) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height)); return c; }
  function release(c) { if (c) { c.width = 1; c.height = 1; } }
  async function preprocess(source, o, check) {
    const angle = (o.rotation + o.deskew) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const width = Math.ceil(Math.abs(source.width*c) + Math.abs(source.height*s)), height = Math.ceil(Math.abs(source.width*s) + Math.abs(source.height*c));
    if (width*height > LIMITS.canvasPixels * 1.4) throw fail('IMAGE_TOO_LARGE');
    const out = canvas(width, height), context = out.getContext('2d', { willReadFrequently: o.preprocess !== 'original' || o.denoise });
    context.fillStyle = '#fff'; context.fillRect(0,0,width,height);
    context.translate(width/2,height/2); context.rotate(angle); context.drawImage(source,-source.width/2,-source.height/2); context.resetTransform();
    const inverse = ([x,y]) => [(x-width/2)*c+(y-height/2)*s+source.width/2, -(x-width/2)*s+(y-height/2)*c+source.height/2];
    if (o.preprocess !== 'original' || o.denoise) {
      // Image-dependent contrast/threshold: fixed thresholds can erase faint scans.
      let low=0,high=255,threshold=170;
      if(o.preprocess==='contrast'||o.preprocess==='binary') {
        const histogram=new Uint32Array(256);let total=0;
        for(let y=0;y<height;y+=128){check();const b=context.getImageData(0,y,width,Math.min(128,height-y)).data;for(let i=0;i<b.length;i+=4){histogram[Math.round(.299*b[i]+.587*b[i+1]+.114*b[i+2])]++;total++;}await pause();}
        let cumulative=0;for(let i=0;i<256;i++){cumulative+=histogram[i];if(cumulative>=total*.002){low=i;break;}}
        cumulative=0;for(let i=0;i<256;i++){cumulative+=histogram[i];if(cumulative>=total*.995){high=i;break;}}
        let sum=0;for(let i=0;i<256;i++)sum+=i*histogram[i];let weight=0,partial=0,best=-1;
        for(let i=0;i<256;i++){weight+=histogram[i];if(!weight)continue;const other=total-weight;if(!other)break;partial+=i*histogram[i];const variance=weight*other*(partial/weight-(sum-partial)/other)**2;if(variance>best){best=variance;threshold=i;}}
      }
      // Process bounded strips and yield between them; never mutate the source canvas.
      for (let y=0;y<height;y+=128) {
        check(); const h=Math.min(128,height-y), image=context.getImageData(0,y,width,h), bytes=image.data;
        for(let i=0;i<bytes.length;i+=4) {
          let value=0.299*bytes[i]+0.587*bytes[i+1]+0.114*bytes[i+2];
          if(o.preprocess==='contrast') value=high>low?clamp((value-low)*255/(high-low),0,255):value;
          if(o.preprocess==='binary') value=value>threshold?255:0;
          bytes[i]=bytes[i+1]=bytes[i+2]=value;bytes[i+3]=255;
        }
        if(o.denoise) { const copy=new Uint8ClampedArray(bytes); for(let yy=1;yy<h-1;yy++) for(let x=1;x<width-1;x++) {const i=(yy*width+x)*4;const v=[copy[i],copy[i-4],copy[i+4],copy[i-width*4],copy[i+width*4]].sort((a,b)=>a-b)[2];bytes[i]=bytes[i+1]=bytes[i+2]=v;} }
        context.putImageData(image,0,y); await pause();
      }
    }
    return { canvas: out, inverse };
  }
  async function imageCanvas(file, scale=1) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch (_) { throw fail('IMAGE_UNREADABLE'); }
    try {
      const factor=Math.min(scale,Math.sqrt(LIMITS.canvasPixels/(bitmap.width*bitmap.height)));
      if(!Number.isFinite(factor)||factor<=0) throw fail('IMAGE_UNREADABLE');
      const c=canvas(bitmap.width*factor,bitmap.height*factor), ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);return c;
    } finally { bitmap.close(); }
  }
  function create(config = {}) {
    let worker = null, workerLanguage = '', workerLoading = null, activeRender = null, activePDF = null, previewPDF = null, previewFile = null;
    let cancelled = false, disposed = false, busy = false, generation = 0;
    const cancellations = new Set();
    let progressPage = 0, totalPages = 0, modelLoadMs = 0, previewRequest = 0, previewQueue = Promise.resolve();
    const emit = (stage, progress=0, extra={}) => { if(!cancelled) config.onProgress?.({stage,progress:clamp(progress,0,1),pageNumber:progressPage,totalPages,...extra}); };
    const check = () => { if(disposed) throw fail('ENGINE_DISPOSED'); if(cancelled||config.signal?.aborted) throw fail('CANCELLED'); };
    const guarded = promise => { let rejectJob; const cancelledJob=new Promise((_,reject)=>{rejectJob=()=>reject(fail('CANCELLED'));cancellations.add(rejectJob);});return Promise.race([promise,cancelledJob]).finally(()=>cancellations.delete(rejectJob)); };
    async function stopWorker() { const current=worker;worker=null;workerLanguage='';if(current) await current.terminate(); }
    async function cancel() { generation++;cancelled=true;for(const reject of cancellations)reject();cancellations.clear();activeRender?.cancel();await stopWorker();if(activePDF) {const p=activePDF;activePDF=null;await p.loadingTask.destroy().catch(()=>{});} }
    config.signal?.addEventListener('abort',cancel,{once:true});
    async function getWorker(language) {
      check(); if(worker&&workerLanguage===language)return worker;
      await stopWorker(); const token=generation,start=now(), T=await loadTesseract();check();T.setLogging(false);const base=assetBase();emit('model-loading',0);
      workerLoading=T.createWorker(language,1,{workerPath:base+'tesseract/worker.min.js',corePath:base+'tesseract/core',langPath:base+'tesseract/lang',workerBlobURL:false,cachePath:'manufacturing-toolbox-ocr-v7',cacheMethod:'write',gzip:true,logging:false,errorHandler:()=>{},logger:m=>{
        const stage=m.status==='recognizing text'?'ocr':'model-loading';emit(stage,Number(m.progress)||0);
      }});
      workerLoading.then(w=>{if(cancelled||disposed||token!==generation)w.terminate();}).catch(()=>{});
      const loaded=await guarded(workerLoading);check();worker=loaded;workerLanguage=language;modelLoadMs+=now()-start;
      await guarded(worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'150'}));return worker;
    }
    async function openPDF(file, suppliedBytes) {
      const lib=await loadPDF();check();const base=assetBase();const data=new Uint8Array(suppliedBytes||await file.arrayBuffer());check();
      const task=lib.getDocument({data,verbosity:0,isEvalSupported:false,enableXfa:false,useSystemFonts:false,stopAtErrors:false,
        cMapUrl:base+'pdf/cmaps/',cMapPacked:true,standardFontDataUrl:base+'pdf/standard_fonts/',iccUrl:base+'pdf/iccs/',wasmUrl:base+'pdf/wasm/',
        useWorkerFetch:true,isOffscreenCanvasSupported:true,maxImageSize:LIMITS.canvasPixels,canvasMaxAreaInBytes:LIMITS.canvasPixels*4});
      let passwordRequired=false;task.onPassword=()=>{passwordRequired=true;task.destroy();};
      try { return await guarded(task.promise); } catch(e) {await task.destroy().catch(()=>{});if(passwordRequired)throw fail('PDF_PASSWORD_REQUIRED');throw e;} }
    async function drawPDF(pdf,pageNumber,destination,scale) {
      const page=await pdf.getPage(pageNumber), base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(scale,Math.sqrt(LIMITS.canvasPixels/(base.width*base.height)))});
      destination.width=Math.ceil(viewport.width);destination.height=Math.ceil(viewport.height);
      const task=page.render({canvasContext:destination.getContext('2d'),viewport,annotationMode:0,background:'#ffffff'});activeRender=task;
      try { await guarded(task.promise);return {page,viewport}; } finally {if(activeRender===task)activeRender=null;}
    }
    async function renderNow(file,pageNumber,destination,input={}) {
      if(!busy&&!disposed&&!config.signal?.aborted)cancelled=false;check();try {
        if(/\.pdf$/i.test(file.name)||file.type==='application/pdf') {
          if(previewFile!==file){if(previewPDF)await previewPDF.loadingTask.destroy();previewPDF=await openPDF(file);previewFile=file;}
          const {page}=await drawPDF(previewPDF,pageNumber,destination,clamp(input.scale??1.4,0.25,3));page.cleanup();
        } else {const img=await imageCanvas(file,clamp(input.scale??1,0.25,3));destination.width=img.width;destination.height=img.height;destination.getContext('2d').drawImage(img,0,0);release(img);}
        return {width:destination.width,height:destination.height};
      } catch(e){if(e.code)throw e;throw fail('PREVIEW_UNAVAILABLE');}
    }
    function render(file,pageNumber,destination,input={}) {
      const token=++previewRequest;
      const job=previewQueue.catch(()=>{}).then(()=>{if(token!==previewRequest)throw fail('PREVIEW_CANCELLED');return renderNow(file,pageNumber,destination,input);});
      previewQueue=job.catch(()=>{});return job;
    }
    async function processFile(file,input={}) {
      if(busy)throw fail('ENGINE_BUSY');if(disposed)throw fail('ENGINE_DISPOSED');if(config.signal?.aborted)throw fail('CANCELLED');
      cancelled=false;busy=true;modelLoadMs=0;const begin=now(), o=options(input);let pdf=null;
      const pages=[];let fileId='';
      try {
        if(!(file instanceof Blob)||file.size>LIMITS.fileBytes||!file.size)throw fail('FILE_SIZE');
        const isPDF=/\.pdf$/i.test(file.name)||file.type==='application/pdf';
        if(!isPDF&&!/^image\/(png|jpeg)$/.test(file.type)&&!(/\.(png|jpe?g)$/i.test(file.name)))throw fail('FILE_TYPE');
        emit('pdf-loading',0);const bytes=await file.arrayBuffer();check();
        const digest=await crypto.subtle.digest('SHA-256',bytes);fileId=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
        if(previewPDF){await previewPDF.loadingTask.destroy().catch(()=>{});previewPDF=null;previewFile=null;}
        if(isPDF){pdf=await openPDF(file,bytes);activePDF=pdf;totalPages=pdf.numPages;}else totalPages=1;
        if(totalPages>LIMITS.pages)throw fail('PAGE_LIMIT');
        const selected=o.pageNumbers||Array.from({length:totalPages},(_,i)=>i+1);
        if(selected.some(n=>n>totalPages))throw fail('PAGE_RANGE');
        for(const pageNumber of selected) {
          check();await pause();progressPage=pageNumber;const started=now();let source=null,processed=null,pdfPage=null;
          const result={id:fileId+'-p'+pageNumber,fileId,fileName:file.name||'document',pageNumber,width:0,height:0,words:[],text:'',method:'text',status:'completed',renderOptions:{scale:1.4},options:{...o,onPage:undefined,pageNumbers:undefined},timings:{}};
          try {
            if(pdf) {
              emit('text-extraction',0);const lib=await loadPDF();pdfPage=await pdf.getPage(pageNumber);const viewport=pdfPage.getViewport({scale:1});
              result.width=viewport.width;result.height=viewport.height;
              const content=await guarded(pdfPage.getTextContent({disableNormalization:false,includeMarkedContent:false}));
              result.words=textWords(content,viewport,lib.Util);result.timings.textMs=now()-started;
              result.text=result.words.map(w=>w.text).join(' ');
              if(!o.forceOCR&&textSufficient(result.words)){result.method='text';}
              else {emit('page-rendering',0);const rstart=now();source=canvas(1,1);await drawPDF(pdf,pageNumber,source,o.scale);result.timings.renderMs=now()-rstart;}
            } else {emit('page-rendering',0);source=await imageCanvas(file,Math.min(o.scale,1.5));result.width=source.width;result.height=source.height;}
            if(source) {
              check();emit('preprocessing',0);const pstart=now();processed=await preprocess(source,o,check);result.timings.preprocessMs=now()-pstart;
              const current=await getWorker(o.language);check();emit('ocr',0);const ostart=now();
              const {data}=await guarded(current.recognize(processed.canvas,{tessedit_pageseg_mode:o.layout==='block'?'6':'3'}, {text:true,blocks:true,hocr:false,tsv:false}));
              result.timings.ocrMs=now()-ostart;result.method='ocr';result.words=ocrWords(data,source.width,source.height,processed.inverse,[processed.canvas.width,processed.canvas.height]);result.text=data.text||'';
              result.confidence=Number.isFinite(data.confidence)?clamp(data.confidence,0,100):null;
            }
            check();result.timings.totalMs=now()-started;pages.push(result);emit('page-completed',1,{method:result.method});o.onPage?.(result);
          } catch(e) {
            if(cancelled||e.code==='CANCELLED')throw fail('CANCELLED');
            result.status='failed';result.errorCode=e.code||'PAGE_UNREADABLE';result.words=[];result.text='';result.timings.totalMs=now()-started;pages.push(result);emit('page-failed',1,{errorCode:result.errorCode});o.onPage?.(result);
          } finally {release(source);release(processed?.canvas);pdfPage?.cleanup();}
        }
        emit('completed',1);return {fileId,fileName:file.name,pages,totalPages,timings:{totalMs:now()-begin,modelLoadMs},engine:VERSION};
      } catch(e) { if(cancelled||e.code==='CANCELLED')throw fail('CANCELLED');throw fail(e.code||'DOCUMENT_UNREADABLE'); }
      finally {busy=false;if(pdf){if(activePDF===pdf)activePDF=null;await pdf.loadingTask.destroy().catch(()=>{});}}
    }
    async function dispose(){disposed=true;await cancel();if(previewPDF)await previewPDF.loadingTask.destroy().catch(()=>{});previewPDF=null;previewFile=null;config.signal?.removeEventListener('abort',cancel);}
    return Object.freeze({processFile,render,cancel,dispose,get status(){return {busy,cancelled,workerReady:!!worker,language:workerLanguage};}});
  }
  return Object.freeze({create,options,textSufficient,textWords,ocrWords,normalizeBox,LIMITS,VERSION});
});
