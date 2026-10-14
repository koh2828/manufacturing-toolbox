# Synthetic inspection certificate corpus

All suppliers, products, lot numbers, and measurements in this directory are fictional. The files contain no customer or company records. They are public development fixtures, not an independent validation of OCR on unseen industrial documents.

| File | Contents |
|---|---|
| `mixed-certificates-20-pages.pdf` | 20 pages: 18 raster scans and 2 directly extractable text pages; 16 certificates; 93 result rows |
| `scanned-certificates-20-pages.pdf` | Same 20 source pages, all rasterized without hidden OCR text |
| `text-certificate-aster.pdf` | Complete one-page English certificate; mixed-corpus page 3 |
| `scanned-certificate-aoba.pdf` | Complete one-page Japanese scanned certificate; mixed-corpus page 8 |
| `certificate-aster.png` | PNG of mixed-corpus page 3 |
| `certificate-aoba.jpg` | JPEG of mixed-corpus page 8 |
| `ground-truth.json` | Every page, certificate boundary, identity field, result, table column, and approximate source bounding box |
| `supplier-templates.json` | Importable version 1 templates for the three synthetic layouts |

Three suppliers each have two products. Aster Materials uses English labels in a single metadata column. 青葉試薬株式会社 uses Japanese labels and places the test method before the result. Northstar Polymers uses two-column metadata with values below labels and a different table column order. The number of inspection rows varies without changing a supplier's layout.

The sequence includes four two-page certificates, consecutive new certificates from the same supplier, interleaved suppliers, a missing lot, an absent optional delivery date, a missing unit, a genuine out-of-specification value, and literal values `0.01`, `1,234.5`, `<0.01`, `>100`, `ND`, `N.D.`, `Not Detected`, `Pass`, `Fail`, `N/A`, `95–110`, and `100 ± 5`.

Deliberate scan degradation:

- Page 6: rotation +2 degrees counterclockwise in the generated image (Pillow convention).
- Page 11: very low contrast.
- Page 16: a partially obscured measurement cell. The original value remains in ground truth and counts as an error if it is not recovered.
- Page 19: rotation1.5degrees clockwise and mild blur.

Images are generated at 150 dpi. Bounding boxes use normalized `[x, y, width, height]` coordinates from the top-left before deliberate image rotation; they locate the original field, not an OCR-fitted glyph boundary. No ground-truth text is embedded into scanned PDF pages.

To regenerate, run `python3 scripts/generate-document-fixtures.py` with reportlab, pypdfium2, Pillow, and pypdf installed. Set `DOCUMENT_JP_FONT` to a Japanese-capable TrueType font if the default macOS font is unavailable. The source generator does not read private input files. Templates are exported from `DocumentCore.defaults()` with `schemaVersion: 1` after template changes.

Run the actual browser engine benchmark first, then pass its JSON result to `node tests/document-accuracy.cjs /path/to/engine-result.json /path/to/accuracy.json`. The scorer uses the real extraction module, matches rows by source-page geometry rather than recognized values, and retains hard or missing cases in the denominator. `tests/document-accuracy.test.cjs` tests only the scorer and fixture integrity; its synthetic perfect-score test is not an OCR measurement.

Measured browser OCR output and scorer results are retained under `benchmark/`. These files contain only the synthetic corpus. The primary final run is `engine-mixed.json`; `engine-auto.json` is the earlier automatic-layout baseline. See `docs/ocr-accuracy-report.md` for definitions, measured errors, and limitations.
