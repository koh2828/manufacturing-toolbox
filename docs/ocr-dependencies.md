# OCR dependencies and selection

Checked 2026-10-14. Exact redistributed files, byte sizes, SHA-256 hashes, upstream paths, npm archive integrity, and license metadata are in [`dist/vendor/document/manifest.json`](../dist/vendor/document/manifest.json). Reproduce with `python3 scripts/vendor-document.py`. The installer downloads public pinned packages and copies files; it never runs npm lifecycle scripts.

| Candidate | Assessment | Decision |
|---|---|---|
| PDF.js / pdfjs-dist 6.4.299 | PDF text positions, per-page rendering, workers, maintained browser implementation; not OCR itself | Adopted for direct text and image rendering |
| Tesseract.js 7.0.0 / core 7.0.0 | English/Japanese LSTM, positioned words, CPU WebAssembly, workers, explicit local paths, small quantized models | Adopted as measured baseline |
| PaddleOCR.js 0.4.2 | Official browser SDK exists, with ONNX Runtime Web and OpenCV.js dependencies and worker integration; offers detection/recognition model selection | Researched, not shipped or benchmarked in this release; additional model/runtime complexity must earn measurable item–value pairing improvement |
| ONNX Runtime Web | Maintained browser inference runtime with WASM/WebGPU options; not a complete OCR pipeline or a trained model | Not shipped alone; possible future local OCR adapter |

The selection does not claim Tesseract is more accurate than PaddleOCR. Only the adopted engine has been measured on this corpus. Missing or inaccurate Japanese labels, degraded scans, and table alignment are explicitly recorded; a larger runtime should be compared on the same ground truth before adoption. WebGPU and cross-origin-isolation-dependent threading are not required by the current CPU baseline, which fits GitHub Pages hosting without special response headers.

## Redistribution

- PDF.js, Tesseract.js, and Tesseract.js-core: Apache-2.0. Their license texts are bundled.
- PDF.js bundled CMaps, standard fonts, ICC data, and image decoders retain their upstream license files (Adobe CMaps, Foxit/Liberation fonts, OpenJPEG/JBIG2/qcms).
- English/Japanese `4.0.0_best_int` language data from `@tesseract.js-data/*` 1.0.0: package metadata declares MIT, while upstream tessdata repositories carry Apache-2.0. Upstream model license texts are included; the manifest records both provenance and the package metadata, rather than silently treating the weights as only MIT.
- Browser-bundled dependencies include regenerator-runtime, zlibjs, wasm-feature-detect, bmp-js, is-url, buffer, idb-keyval, base64-js, and ieee754. License notices are copied from versions in Tesseract's pinned source lockfile (`42eae669e4b3a66429d8516f078912cc747a89df`) and the distributed bundle's license comment files.
- No paid/commercial-service dependency or model with noncommercial-only terms was added.

Three Tesseract LSTM-only CPU builds (portable, SIMD, relaxed SIMD) include embedded WASM; only the supported variant is downloaded at runtime. Legacy OCR/OSD is not included. English model: 2,952,873 bytes compressed; Japanese model: 2,030,256 bytes compressed. Both models total 4,983,129 bytes. Vendor assets total approximately 21.7 MB on disk, including all PDF resources and CPU variants; a single OCR session downloads a subset. Actual cold-download and initialization times depend on hosting/network/cache and are measured separately from any claim about production users.

The only vendor-code modification prepends suppression of worker `console.log/info/warn/error/debug`; original SHA-256 values are retained alongside modified hashes. No OCR result or parser error is forwarded to analytics or external logging.

## Primary references

- [PDF.js official project](https://github.com/mozilla/pdf.js) and [API documentation](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)
- [Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md) and [API documentation](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [Tesseract language data](https://github.com/naptha/tessdata) and [upstream best models](https://github.com/tesseract-ocr/tessdata_best)
- [Official PaddleOCR browser SDK](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
- [ONNX Runtime Web documentation](https://onnxruntime.ai/docs/tutorials/web/)
