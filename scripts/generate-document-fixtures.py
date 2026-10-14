#!/usr/bin/env python3
"""Generate public, wholly synthetic CoA fixtures. No real company or customer data.

Dependencies: reportlab, pypdfium2, Pillow, pypdf (bundled Codex Python supported).
Japanese font: DOCUMENT_JP_FONT environment variable or Arial Unicode on macOS.
The font is embedded into PDFs, never copied as a redistributable font file.
"""
from __future__ import annotations
import io, json, math, os, random, tempfile
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tests/fixtures/documents'
W,H = A4
SCALE = 150 / 72
random.seed(240101)
FONT = os.environ.get('DOCUMENT_JP_FONT', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
if not Path(FONT).is_file():
    raise SystemExit('Set DOCUMENT_JP_FONT to a TrueType font supporting Japanese.')
pdfmetrics.registerFont(TTFont('JP', FONT))
SUPPLIERS = {
 'aster': {'name':'Aster Materials','title':'CERTIFICATE OF ANALYSIS','templateId':'aster-v1','lang':'en','products':[('Aster Resin R1','AR1'),('Aster Catalyst C2','AC2')]},
 'aoba': {'name':'青葉試薬株式会社','title':'検査成績書','templateId':'aoba-v1','lang':'ja','products':[('青葉溶液A','AS1'),('青葉粉末B','AP2')]},
 'northstar': {'name':'Northstar Polymers','title':'INSPECTION REPORT','templateId':'northstar-v1','lang':'en','products':[('Northstar Polymer N1','NP1'),('Northstar Additive N2','NA2')]},
}
LABELS_EN = {'productName':'Product','productCode':'Product Code','lot':'Lot','certificateNumber':'Certificate','issueDate':'Issue Date','inspectionDate':'Inspection Date','deliveryDate':'Delivery Date'}
LABELS_JA = {'productName':'製品名','productCode':'製品コード','lot':'ロット番号','certificateNumber':'成績書番号','issueDate':'発行日','inspectionDate':'検査日','deliveryDate':'納品日'}
ROWS_EN = [
 ('Viscosity','101.6','mPa.s','95','110','ASTM D2196'),
 ('Volatile Matter','0.01','%','0','0.10','QM-02'),
 ('Propionic Acid','<0.01','%','','0.05','GC-01'),
 ('Potassium','ND','ppm','','5','ICP-01'),
 ('Sodium','N.D.','ppm','','5','ICP-01'),
 ('Density','1,234.5','kg/m3','1200','1250','QM-06'),
 ('Appearance','Pass','','','','VISUAL'),
 ('Impurity','Not Detected','ppm','','1','GC-02'),
]
ROWS_JA = [
 ('粘度','99.8','mPa.s','95','110','JIS K7117'),
 ('揮発分','0.01','%','0','0.10','QM-02'),
 ('プロピオン酸','<0.01','%','','0.05','GC-01'),
 ('カリウム','ND','ppm','','5','ICP-01'),
 ('ナトリウム','N.D.','ppm','','5','ICP-01'),
 ('密度','1,234.5','kg/m3','1200','1250','QM-06'),
 ('外観','Pass','','','','VISUAL'),
 ('不純物','Not Detected','ppm','','1','GC-02'),
]
EXTRA_EN = [
 ('Acid Number','>100','mg/g','90','','QM-09'),
 ('Appearance','Fail','','','','VISUAL'),
 ('Color','N/A','','','','VISUAL'),
 ('Range Result','95–110','mPa.s','','','QM-10'),
 ('Tolerance Result','100 ± 5','mPa.s','','','QM-11'),
]
# Each tuple is one certificate. Same supplier/new lot appears at boundaries 2→3
# and 3→4. Supplier changes and repeated products are deliberately interleaved.
PLAN = [
 ('aster',0,2,8),('aster',0,1,5),('aster',1,1,3),('aoba',0,2,8),
 ('northstar',0,1,5),('aoba',1,1,4),('northstar',1,1,8),('aster',0,1,6),
 ('aoba',0,2,7),('northstar',0,1,4),('aster',1,1,7),('aoba',1,1,5),
 ('northstar',1,2,8),('aster',0,1,4),('aoba',0,1,6),('northstar',0,1,5),
]


def draw_text(c, value, x, top, size=11, color='#202b36', font='JP'):
    value = str(value)
    c.setFillColor(HexColor(color)); c.setFont(font,size)
    c.drawString(x,H-top-size,value)
    return [round(x/W,6),round(top/H,6),round(pdfmetrics.stringWidth(value,font,size)/W,6),round(size*1.2/H,6)]


def draw_page(c, p):
    supplier = SUPPLIERS[p['supplierId']]; sid=p['supplierId']; ja=supplier['lang']=='ja'
    c.setTitle('Synthetic inspection certificates - Manufacturing Toolbox tests')
    c.setAuthor('Manufacturing Toolbox synthetic fixture generator')
    accent={'aster':'#1c4870','aoba':'#315a46','northstar':'#694c35'}[sid]
    if sid=='northstar':
        c.setFillColor(HexColor(accent)); c.rect(0,0,15,H,fill=1,stroke=0)
    draw_text(c,'SYNTHETIC TEST DATA - NOT A REAL CERTIFICATE',36,20,8,'#69717b')
    if sid=='aoba':
        draw_text(c,supplier['title'],220,53,22,accent)
        draw_text(c,supplier['name'],36,93,17,accent)
        draw_text(c,'Aoba Reagents | 架空のテスト帳票',36,120,10,'#606c75')
    elif sid=='northstar':
        draw_text(c,supplier['name'],36,53,22,accent)
        draw_text(c,supplier['title'],36,87,15,accent)
    else:
        draw_text(c,supplier['name'],36,53,22,accent)
        draw_text(c,supplier['title'],36,91,16,accent)
    draw_text(c,('続き' if ja else 'Continued') if p['continuation'] else ('原本' if ja else 'Original'),440,123,11,accent)
    label_map=LABELS_JA if ja else LABELS_EN
    top=156 if sid!='northstar' else 145
    p['fieldBboxes']={}
    if sid=='northstar':
        # Different layout: two-column document metadata and swapped table columns.
        slots=[(36,top),(320,top),(36,top+31),(320,top+31),(36,top+62),(320,top+62),(36,top+93)]
        for (field,label),(x,y) in zip(label_map.items(),slots):
            draw_text(c,label+':',x,y,8,'#65717b')
            value=p['fields'][field]
            p['fieldBboxes'][field]=draw_text(c,value,x,y+11,11)
        table_top=320
        cols=[('item','Inspection Item',36,166),('unit','Unit',202,63),('raw','Result',265,81),('method','Test Method',346,91),('lsl','LSL',437,58),('usl','USL',495,64)]
    else:
        for index,(field,label) in enumerate(label_map.items()):
            y=top+index*23
            draw_text(c,label+':',36,y,10,'#65717b')
            p['fieldBboxes'][field]=draw_text(c,p['fields'][field],162,y,11)
        table_top=350
        if ja:
            cols=[('item','検査項目',36,158),('method','試験方法',194,96),('raw','測定値',290,88),('unit','単位',378,63),('lsl','下限',441,59),('usl','上限',500,59)]
        else:
            cols=[('item','Inspection Item',36,163),('raw','Result',199,92),('unit','Unit',291,61),('lsl','LSL',352,50),('usl','USL',402,50),('method','Test Method',452,107)]
    c.setFillColor(HexColor('#edf2f4')); c.rect(36,H-table_top-32,523,32,fill=1,stroke=0)
    for key,label,x,width in cols: draw_text(c,label,x+5,table_top+8,10,accent)
    p['table']={'bbox':[round(36/W,6),round(table_top/H,6),round(523/W,6),round((32+len(p['rows'])*34)/H,6)],'columns':{key:[round(x/W,6),round((x+width)/W,6)] for key,label,x,width in cols}}
    for i,row in enumerate(p['rows']):
        y=table_top+32+i*34
        c.setStrokeColor(HexColor('#c9d1d8')); c.setLineWidth(.35); c.line(36,H-y-34,559,H-y-34)
        row['bboxes']={}
        for key,label,x,width in cols:
            value=row[key]
            row['bboxes'][key]=draw_text(c,value,x+5,y+10,10)
        row['bbox']=[round(36/W,6),round(y/H,6),round(523/W,6),round(34/H,6)]
    end=table_top+32+len(p['rows'])*34
    draw_text(c,'検査結果終了' if ja else 'END OF RESULTS',36,end+14,10,accent)
    draw_text(c,'Approved by: Synthetic QA / 架空承認者',36,723,9,'#59656e')
    draw_text(c,f"Certificate page {p['documentPage']} / {p['documentPageCount']}",36,754,10)
    draw_text(c,'Training fixture only. Values do not describe a real product.',36,783,8,'#69717b')
    p['widthPoints']=W;p['heightPoints']=H
    c.showPage()


def make_pages():
    pages=[]; documents=[]
    for dindex,(sid,product,pgcount,rowcount) in enumerate(PLAN,1):
        s=SUPPLIERS[sid]; name,code=s['products'][product]
        base=ROWS_JA if sid=='aoba' else ROWS_EN
        rows=[dict(zip(['item','raw','unit','lsl','usl','method'],r)) for r in base[:rowcount]]
        if product==1 and sid!='aoba':
            rows=[dict(zip(['item','raw','unit','lsl','usl','method'],r)) for r in (base[:3]+EXTRA_EN)[:rowcount]]
        # Distinct valid values, including a genuine out-of-specification result.
        if dindex==2: rows[0]['raw']='112.5'
        elif product==0 and dindex>1: rows[0]['raw']=f'{98+dindex*.3:.1f}'
        fields={'productName':name,'productCode':code,'lot':f'{sid[:2].upper()}-26-{dindex:04d}',
         'certificateNumber':f'{sid[:2].upper()}-COA-{dindex:04d}','issueDate':f'2026-10-{dindex:02d}',
         'inspectionDate':f'2026-09-{dindex+10:02d}','deliveryDate':f'2026-10-{dindex+2:02d}'}
        if dindex==14: fields['lot']=''  # Intentional missing mandatory identifier.
        if dindex==15: fields['deliveryDate']='' # Optional field is truly absent.
        if dindex==16: rows[1]['unit']='' # Do not infer a missing unit.
        start=len(pages)+1; docid=f'fixture-doc-{dindex:02d}'
        for pi in range(pgcount):
            split=math.ceil(len(rows)/pgcount)
            pagerows=[dict(r) for r in rows[pi*split:(pi+1)*split]]
            number=len(pages)+1
            degradation={6:'skew +2 degrees',11:'low contrast',16:'partially obscured result',19:'skew -1.5 degrees + mild blur'}.get(number,'none')
            for ri,row in enumerate(pagerows):
                row['id']=f'{docid}-row-{pi*split+ri+1}';row['sourcePage']=number
            pages.append({'pageNumber':number,'documentId':docid,'supplierId':sid,'supplierName':s['name'],
              'templateId':s['templateId'],'title':s['title'],'language':s['lang'],'fields':dict(fields),
              'documentPage':pi+1,'documentPageCount':pgcount,'continuation':pi>0,'rows':pagerows,
              'expectedMethod':'text' if number in [1,13] else 'ocr','degradation':degradation,
              'expectedReviewReasons':['missing_lot'] if not fields['lot'] else []})
        documents.append({'id':docid,'supplierId':sid,'supplierName':s['name'],'fields':fields,
          'sourcePages':list(range(start,len(pages)+1)),'rowCount':len(rows)})
    return pages,documents


def transformed_image(image,p):
    note=p['degradation']
    if note=='skew +2 degrees':
        image=image.rotate(2,resample=Image.Resampling.BICUBIC,fillcolor='white')
    elif note=='low contrast':
        image=ImageEnhance.Contrast(image).enhance(.30)
        image=ImageEnhance.Brightness(image).enhance(1.18)
    elif note=='partially obscured result':
        # Preserve in truth the original generated value. This is deliberately
        # unreadable, and the benchmark must count missed extraction honestly.
        row=p['rows'][1];x,y,w,h=row['bboxes']['raw'];iw,ih=image.size
        dr=ImageDraw.Draw(image)
        dr.rectangle((int(x*iw),int((y+.003)*ih),int((x+w)*iw),int((y+h*.65)*ih)),fill=(244,244,244))
        p['expectedReviewReasons'].append('obscured_cell')
    elif note=='skew -1.5 degrees + mild blur':
        image=image.rotate(-1.5,resample=Image.Resampling.BICUBIC,fillcolor='white').filter(ImageFilter.GaussianBlur(.55))
    return image


def image_pdf(image):
    b=io.BytesIO(); c=canvas.Canvas(b,pagesize=A4,pageCompression=1)
    jpg=io.BytesIO();image.save(jpg,format='JPEG',quality=84,optimize=True)
    c.drawImage(ImageReader(io.BytesIO(jpg.getvalue())),0,0,width=W,height=H)
    c.showPage();c.save();b.seek(0)
    return PdfReader(b)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    pages,docs=make_pages()
    vector=io.BytesIO();c=canvas.Canvas(vector,pagesize=A4,pageCompression=1,invariant=1)
    for p in pages: draw_page(c,p)
    c.save();vectorbytes=vector.getvalue();reader=PdfReader(io.BytesIO(vectorbytes));render=pdfium.PdfDocument(vectorbytes)
    mixed=PdfWriter();scanonly=PdfWriter();imgs={}
    for i,p in enumerate(pages):
        image=render[i].render(scale=SCALE).to_pil().convert('RGB');image=transformed_image(image,p)
        if p['pageNumber'] in [1,3,5,6,8,11,16,19]: imgs[p['pageNumber']]=image
        imagepage=image_pdf(image).pages[0]
        scanonly.add_page(imagepage)
        mixed.add_page(reader.pages[i] if p['expectedMethod']=='text' else imagepage)
    for writer,name in [(mixed,'mixed-certificates-20-pages.pdf'),(scanonly,'scanned-certificates-20-pages.pdf')]:
        writer.add_metadata({'/Title':'Synthetic Document Intelligence benchmark','/Author':'Manufacturing Toolbox synthetic fixtures'})
        with (OUT/name).open('wb') as f:writer.write(f)
    text=PdfWriter();text.add_page(reader.pages[2]);text.write(OUT/'text-certificate-aster.pdf')
    scan=PdfWriter();scan.add_page(scanonly.pages[7]);scan.write(OUT/'scanned-certificate-aoba.pdf')
    imgs[3].save(OUT/'certificate-aster.png',optimize=True)
    imgs[8].save(OUT/'certificate-aoba.jpg',quality=88,optimize=True)
    # Proof images are intermediates outside the published repository.
    proof=Path(tempfile.gettempdir())/'document-fixture-proof';proof.mkdir(exist_ok=True)
    for number,image in imgs.items():image.save(proof/f'page-{number:02d}.png')
    payload={'schemaVersion':1,'synthetic':True,'seed':240101,'generatedFor':'Manufacturing Toolbox Document Intelligence',
      'sourceFile':'mixed-certificates-20-pages.pdf','pageCount':len(pages),'documentCount':len(docs),
      'inspectionRowCount':sum(len(p['rows']) for p in pages),'scanDpi':150,
      'coordinateSystem':'normalized [x,y,width,height], top-left origin; source vector positions before deliberate scan rotation',
      'suppliers':SUPPLIERS,'documents':docs,'pages':pages,
      'individualFiles':{'text-certificate-aster.pdf':{'groundTruthPages':[3],'method':'text'},'scanned-certificate-aoba.pdf':{'groundTruthPages':[8],'method':'ocr'},'certificate-aster.png':{'groundTruthPages':[3],'method':'ocr'},'certificate-aoba.jpg':{'groundTruthPages':[8],'method':'ocr'}},
      'evaluationNotes':['All names and values are synthetic; no real supplier records.',
        'Mixed corpus has18scannedpages and2textpages. Scanned corpus has20scannedpages.',
        'Ground-truth boxes precede rotation and describe approximate source location, not fitted OCR boxes.',
        'Obscured-cell ground truth is retained; it must not be silently excluded from extraction accuracy.',
        'Missing fields are empty strings, never zero. Missing lot requires human review.',
        'Accuracy corpus is used to develop templates, not an independent unseen or real-world validation set.']}
    (OUT/'ground-truth.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pages':len(pages),'documents':len(docs),'inspectionRows':payload['inspectionRowCount'],
       'bytes':sum(f.stat().st_size for f in OUT.iterdir() if f.is_file()),'proof':str(proof)},indent=2))

if __name__=='__main__':main()
