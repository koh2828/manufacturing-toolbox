#!/usr/bin/env python3
"""Four synthetic CoAs for the beta owner's manual tests.

Reuses only the existing development fixture renderer, never app extraction or
calculation code. Aster PDFs contain selectable text. Aoba PDFs are image-only.
REVIEW_OUTPUT optionally receives rendered proof pages and validation metadata.
"""
from pathlib import Path
import importlib.util
import io
import json
import os
import subprocess
import shutil
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('DEMO_OUTPUT', ROOT / 'demo-data'))
PROOF = Path(os.environ['REVIEW_OUTPUT']) if os.environ.get('REVIEW_OUTPUT') else None
spec = importlib.util.spec_from_file_location('synthetic_renderer', ROOT / 'scripts/generate-document-fixtures.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
if PROOF:
    PROOF.mkdir(parents=True, exist_ok=True)

truth = {'schemaVersion': 1, 'seed': 20261015, 'synthetic': True, 'documents': [],
         'evaluation': 'Setup files may be used to inspect/reuse supplier templates. Do not tune templates using held-out files before their first evaluation. These synthetic layouts are based on existing development fixtures and are not an independent real-world accuracy benchmark.',
         'safety': 'All extraction starts unconfirmed. Compare every field with the original before confirming. <0.01 and ND must not become numeric 0 or 0.01. No inferred fields.'}
checks = []
for supplier in ['aster', 'aoba']:
    for heldout in [False, True]:
        ja = supplier == 'aoba'
        count = (4 if heldout else 2) if ja else (5 if heldout else 3)
        values = (renderer.ROWS_JA if ja else renderer.ROWS_EN)[:count]
        rows = [dict(zip(['item', 'raw', 'unit', 'lsl', 'usl', 'method'], row)) for row in values]
        rows[0]['raw'] = ('103.2' if heldout else '99.8') if ja else ('102.4' if heldout else '100.2')
        index = 2 if heldout else 1
        prefix = 'AO' if ja else 'AS'
        lot = f'{prefix}-BETA-{index:03}'
        fields = {'productName': '青葉溶液A' if ja else 'Aster Resin R1',
                  'productCode': 'AS1' if ja else 'AR1', 'lot': lot,
                  'certificateNumber': f'{prefix}-BETA-COA-{index:03}',
                  'issueDate': f'2026-09-{10 + index:02}',
                  'inspectionDate': f'2026-09-{9 + index:02}',
                  'deliveryDate': f'2026-09-{11 + index:02}'}
        page = {'supplierId': supplier, 'fields': fields, 'rows': rows,
                'continuation': False, 'documentPage': 1, 'documentPageCount': 1}
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4, pageCompression=1, invariant=1)
        renderer.draw_page(c, page)
        c.save()
        vector = buf.getvalue()
        if ja:
            # Actual raster-only PDF: draw one rendered image, no OCR/text layer.
            image = pdfium.PdfDocument(vector)[0].render(scale=2.5).to_pil().convert('RGB')
            scan = io.BytesIO()
            c = canvas.Canvas(scan, pagesize=A4, pageCompression=1, invariant=1)
            c.drawImage(ImageReader(image), 0, 0, width=A4[0], height=A4[1])
            c.showPage()
            c.save()
            payload = scan.getvalue()
        else:
            payload = vector
        writer = PdfWriter()
        writer.add_page(PdfReader(io.BytesIO(payload)).pages[0])
        writer.add_metadata({'/Title': f'Manufacturing Toolbox synthetic beta {supplier} {"held-out" if heldout else "setup"}',
                             '/Author': 'Manufacturing Toolbox synthetic fixture generator',
                             '/Subject': 'Fictional training data only; no real supplier information'})
        folder = 'B-known-answer' if heldout else 'A-experience'
        file = f'D08{"B" if heldout else "A"}_{supplier}_{"scan" if ja else "text"}.pdf'
        relative = f'{folder}/D08/{file}'
        dest = OUT / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        writer.write(dest)
        reread = PdfReader(dest)
        assert len(reread.pages) == 1
        text = reread.pages[0].extract_text() or ''
        assert (not text.strip()) if ja else (lot in text)
        assert '/Users/' not in str(reread.metadata)
        truth['documents'].append({'path': relative, 'purpose': 'held-out validation' if heldout else 'template setup',
                                   'pageCount': 1, 'textLayer': not ja, 'expectedMethod': 'ocr' if ja else 'text',
                                   'supplier': renderer.SUPPLIERS[supplier]['name'],
                                   'templateId': f'{supplier}-v1', 'fields': fields,
                                   'measurementRowCount': count,
                                   'rows': [{key: row[key] for key in ['item', 'raw', 'unit', 'lsl', 'usl', 'method']} for row in rows],
                                   'initialVerification': 'unconfirmed'})
        checks.append({'file': relative, 'pages': 1, 'textLayer': not ja, 'extractedCharacters': len(text), 'bytes': dest.stat().st_size})
        if PROOF:
            poppler = shutil.which('pdftoppm')
            if not poppler:
                runtime = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin'
                poppler = next((str(p) for p in [runtime / 'fallback/pdftoppm', runtime / 'override/pdftoppm'] if p.exists()), None)
            if not poppler:
                raise RuntimeError('pdftoppm required for final PDF visual proof.')
            subprocess.run([poppler, '-r', '110', '-png', '-singlefile', str(dest), str(PROOF / file.removesuffix('.pdf'))], check=True, capture_output=True)
        print('created', relative)
(OUT / 'expected').mkdir(parents=True, exist_ok=True)
(OUT / 'expected/D08.json').write_text(json.dumps(truth, ensure_ascii=False, indent=2) + '\n')
if PROOF:
    (PROOF / 'pdf-validation.json').write_text(json.dumps(checks, indent=2) + '\n')
