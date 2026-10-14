# Document Intelligence — OCR architecture

## Boundaries and local execution

`document-engine.js` is the replaceable document/OCR adapter. It receives browser `File` objects, never upload URLs. PDF parsing uses a PDF.js module worker. OCR uses one Tesseract LSTM Web Worker reused across sequential pages. The extraction/template layer consumes the same normalized page contract for direct text and OCR. No AI service, server processing, account, or paid dependency is used.

`DocumentEngine.create({ onProgress, signal })` returns `processFile(file, options)`, `render(file, pageNumber, canvas, options)`, `cancel()`, and `dispose()`. Errors contain fixed codes only, never parser errors containing document contents. Reprocessing explicitly replaces page results in the caller; original files are never modified.

A future engine can implement this adapter without changing supplier templates or review/export. A cloud implementation would require a distinct, explicit user action and privacy design; there is no cloud endpoint, API key, or automatic cloud fallback in this release.

## Page pipeline

1. Validate PDF/PNG/JPEG, maximum 50 MiB per file and 100 PDF pages.
2. Compute the SHA-256 content identity locally. Page identity is `<file hash>-p<number>`, so the same original can be reattached after reopening a saved dataset.
3. For each PDF page, request positioned text. At least 8 nonempty words and 60 non-whitespace characters, with fewer than 8% replacement/control characters, qualify for direct text extraction. This is a transparent heuristic, not a guarantee of a complete PDF text layer. The user can force OCR when the embedded layer is incomplete or incorrect.
4. Otherwise rasterize the page, normally at scale 2 (approximately 144 dpi for PDF points), bounded by 16 million pixels. Process only one page at a time.
5. Optional, explicit preprocessing: grayscale; percentile contrast stretch; Otsu binarization; 90-degree rotation; manual deskew ±10 degrees; optional 5-neighbor median noise suppression; resolution scale 1–3. No preprocessing is forced onto every image. The source is retained, and reprocessing is compared through the review UI.
6. Run Tesseract with English, Japanese, or both. Uniform-block/table-oriented segmentation (PSM 6) is the measured default for this certificate corpus; auto page segmentation (PSM 3) remains selectable. Both language orders are available for mixed English/Japanese pages. The OCR output retains every word and confidence score; confidence is not a calibrated probability.
7. Inverse-transform word coordinates into the original page orientation. The review preview always displays the original page; its boxes remain usable after deskew/rotation. Bounding boxes are normalized `[x, y, width, height]`, clipped to `[0,1]`. Each OCR word also carries `layoutBBox` in upright processed coordinates: extraction uses that box for row/column grouping while source highlights use `bbox`. This separation prevents deskew being accidentally undone by inverse-transforming the source highlight coordinates. Positive manual deskew angles rotate the processing image clockwise. PDF text chunk splitting is proportional and therefore less precise than actual glyph boxes.
8. Emit a completed page immediately to the caller, release temporary canvases and page resources, then continue. A failed page remains explicitly failed. A cancellation preserves completed pages in the caller through `onPage`, terminates the OCR worker, and supports a later retry. A loading worker that finishes after cancellation is terminated by a generation guard.
9. Dispose closes PDF loading tasks, previews, canvases, and OCR worker resources. The original source and structured results are retained only by the caller as needed for review/persistence.

The main thread handles canvas drawing and bounded preprocessing strips, yielding between strips. PDF parsing and OCR computation run in workers. Large decoded images still consume memory; these limits are practical safeguards, not a guarantee against every hostile compressed file or low-memory browser.

## Result contract

```js
{
  fileId, fileName, totalPages, engine,
  pages: [{
    id, fileId, fileName, pageNumber, width, height,
    words: [{ text, bbox: [x, y, width, height], layoutBBox: [x, y, width, height], confidence: null /* direct text */ }],
    text, method: 'text' /* or 'ocr' */, status: 'completed' /* or 'failed' */,
    errorCode, options, renderOptions, timings
  }],
  timings: { totalMs, modelLoadMs }
}
```

OCR word confidence is 0–100 when available. Failed pages have empty words/text and a sanitized error code. Timing records contain numbers and engine status only. These records are in memory and in explicit exported benchmark/project artifacts, never telemetry.

## Static assets, CSP, and deployment

All runtime dependencies are under `dist/vendor/document/`. `dist/index.html` resolves them relative to the engine script; root `Launch.html` resolves `dist/vendor/document/` relative to the existing Pages base path. No CDN fallback is provided. Libraries are lazy-loaded when documents are processed; existing Excel/statistics tools do not download OCR models.

The host requires `script-src 'self' 'wasm-unsafe-eval'` plus its existing inline script hashes, `worker-src 'self'`, `connect-src 'self'`, and local/blob font support. `wasm-unsafe-eval` enables WebAssembly only, not JavaScript `eval`. The public deployment cannot set fine-grained worker response headers, so application path restrictions and actual network auditing supplement the host CSP.

PDF scripting, XFA execution, annotation actions, and external document links are not rendered. PDF.js receives bytes directly, `isEvalSupported: false`, `enableXfa: false`, and `annotationMode: 0`. QuickJS and sandbox assets are deliberately absent. Vendor worker diagnostics are silenced to avoid accidentally logging document-derived text. Original vendor hashes and the exact patch are recorded in the manifest.

Tesseract IndexedDB caching stores only fixed English/Japanese model assets. It does not store document pixels, text, or results. HTTP caching applies to static assets. Explicit dataset persistence is a separate UI/storage concern, with the user's choice of extracted data only or original files included.

`file://` single-file distribution continues to support the existing tools. Browser worker/module security means OCR requires the hosted application or an HTTP-served copy of the complete repository assets. Downloading `Launch.html` alone does not include OCR runtime/models. The engine reports `HOSTED_ASSETS_REQUIRED` instead of silently contacting a CDN.

## Tests and measured limitations

`tests/document-engine.test.cjs` verifies normalization, data-safety boundaries, the direct-text heuristic, and every vendored asset hash. `tests/document-engine-browser.cjs` runs actual PDF.js/Tesseract on the synthetic corpus, verifies PDF text versus OCR, rendering, cancellation/retry, and audits requests. `tests/document-engine-experiments.cjs` compares language, resolution, segmentation, and preprocessing on identical synthetic pages.

Performance results separately report total processing, page timing, model initialization, main-thread timer delay, sampled main-thread JS heap, and sampled Chrome process-tree RSS. The RSS sum includes browser baseline/shared pages and is an approximate process footprint; it is not exact exclusive application memory. JS heap excludes worker/WASM allocations. See the accuracy report for measurements and OCR limitations; no human transcription time saving has yet been established.
