#!/usr/bin/env python3
"""Reproduce pinned, same-origin Document Intelligence runtime assets (no user data).
Default consumes the manifest-pinned npm packages; --cache uses an existing download cache.
All archive hashes and source URLs are recorded in manifest.json. No npm lifecycle scripts run.
"""
import argparse, hashlib, io, json, pathlib, shutil, tarfile, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist/vendor/document'
PACKAGES = {'pdfjs-dist':'6.4.299','tesseract.js':'7.0.0','tesseract.js-core':'7.0.0','@tesseract.js-data/eng':'1.0.0','@tesseract.js-data/jpn':'1.0.0'}
NOTICE_PACKAGES={'regenerator-runtime':'0.13.11','zlibjs':'0.3.1','wasm-feature-detect':'1.8.0','bmp-js':'0.1.0','is-url':'1.2.4','buffer':'6.0.3','idb-keyval':'6.2.1','base64-js':'1.5.1','ieee754':'1.2.1'}
QUIET = b'/* Manufacturing Toolbox: suppress worker diagnostics that may contain document text. */\nfor (const k of ["log","info","warn","error","debug"]) console[k] = () => {};\n'
def digest(b): return hashlib.sha256(b).hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cache',type=pathlib.Path);args=parser.parse_args()
    entries=[];packages=[]
    def put(data, target, source, upstream_sha=None):
        p=DEST/target;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        entries.append({'path':target,'bytes':len(data),'sha256':digest(data),'source':source,**({'upstreamSha256':upstream_sha,'modification':'prepend worker console suppression'} if upstream_sha else {})})
    for name,version in {**PACKAGES,**NOTICE_PACKAGES}.items():
        if args.cache:
            d=args.cache/name.replace('/','_').replace('@','');meta=json.loads((d/'metadata.json').read_text());base=d/'package'
        else:
            meta=json.load(urllib.request.urlopen(f'https://registry.npmjs.org/{name}/{version}'))
            archive=urllib.request.urlopen(meta['dist']['tarball']).read()
            import base64
            actual='sha512-'+base64.b64encode(hashlib.sha512(archive).digest()).decode()
            if actual != meta['dist']['integrity']: raise ValueError('npm archive integrity mismatch')
            import tempfile
            d=pathlib.Path(tempfile.mkdtemp(prefix='toolbox-ocr-'))
            with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tf:tf.extractall(d,filter='data')
            base=d/'package'
        packages.append({'name':name,'version':version,'license':meta.get('license'),'tarball':meta['dist']['tarball'],'integrity':meta['dist'].get('integrity')})
        selections=[]
        if name in NOTICE_PACKAGES:
            selections=[(p.name,'licenses/'+name+'/'+p.name) for p in base.iterdir() if p.is_file() and p.name.lower().startswith(('license','licence','copying','notice'))]
        elif name=='pdfjs-dist':
            selections=[('build/pdf.min.mjs','pdf/pdf.min.mjs'),('build/pdf.worker.min.mjs','pdf/pdf.worker.min.mjs'),('LICENSE','pdf/LICENSE')]
            for directory in ['cmaps','standard_fonts','iccs','wasm']:
                selections += [(str(p.relative_to(base)),'pdf/'+str(p.relative_to(base))) for p in (base/directory).glob('*') if p.is_file() and not p.name.startswith('quickjs')]
        elif name=='tesseract.js':selections=[('dist/tesseract.min.js','tesseract/tesseract.min.js'),('dist/worker.min.js','tesseract/worker.min.js'),('LICENSE.md','tesseract/LICENSE.md'),('dist/tesseract.min.js.LICENSE.txt','tesseract/tesseract.min.js.LICENSE.txt'),('dist/worker.min.js.LICENSE.txt','tesseract/worker.min.js.LICENSE.txt')]
        elif name=='tesseract.js-core':
            # OEM 1 only: embedded-WASM builds, selected by runtime SIMD capability.
            selections=[(p.name,'tesseract/core/'+p.name) for p in base.glob('*lstm.wasm.js')]+[('LICENSE','tesseract/core/LICENSE')]
        else:
            lang=name.rsplit('/',1)[-1];selections=[(f'4.0.0_best_int/{lang}.traineddata.gz',f'tesseract/lang/{lang}.traineddata.gz')]
        for src,target in selections:
            data=(base/src).read_bytes();original=None
            if target.endswith(('worker.min.js','pdf.worker.min.mjs')):original=digest(data);data=QUIET+data
            put(data,target,f'{name}@{version}/{src}',original)
    licenses=[('tessdata-LICENSE','https://raw.githubusercontent.com/naptha/tessdata/gh-pages/LICENSE'),('tessdata-best-LICENSE','https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/LICENSE')]
    for name,url in licenses:
        data=(args.cache/name).read_bytes() if args.cache else urllib.request.urlopen(url).read()
        put(data,'tesseract/lang/'+name,url)
    manifest={'schemaVersion':1,'checkedOn':'2026-10-14','packages':packages,'notes':['No PDF scripting/sandbox/QuickJS assets are shipped.','Tesseract OEM1 LSTM builds only; 3 CPU variants contain embedded WASM.','Language package metadata says MIT; upstream model repositories specify Apache-2.0. Upstream license texts included.','Worker diagnostic console suppression is the only vendor code modification.'], 'files':sorted(entries,key=lambda e:e['path'])}
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Vendored {len(entries)} files, {sum(e["bytes"] for e in entries):,} bytes')
if __name__=='__main__':main()
