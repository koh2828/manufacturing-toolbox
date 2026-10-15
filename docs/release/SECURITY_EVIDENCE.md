# Data handling and security evidence — v0.8.1-beta.1 candidate

Reviewed 2026-10-15. This records the inspected code paths and synthetic browser tests. It is not an assurance of all file formats, browsers, devices, browser extensions, hosting logs, or unknown dependency vulnerabilities. Production was not changed for this review.

## Corrections made for this candidate

- **CSV formula interpretation (P0):** Cleaner previously quoted formula-like text without neutralizing it. `CleanCore.csv` now prefixes such strings with an apostrophe, including formulas following whitespace/control characters. The same implementation serves Document Intelligence exports. Genuine negative numbers and plain numeric strings remain unchanged. The Cleaner CSV preview shows the exact prefixed result; source arrays remain untouched. `.xlsx` preserves the original text as a string cell, without a formula. CSV has no cell types, so Excel's leading-zero/date inference still requires explicit text import or use of `.xlsx`.
- **Missing formula caches (P1):** Shared `ImportCore.sheetRows` now rejects a sheet with formulas lacking cached results, including formulas outside the apparent table. The localized message provides the count and first cell coordinate, with instructions to recalculate/save the workbook in Excel. No formula text or business values appear in this error. Cached values are read without recalculation; stale cached values cannot be detected automatically.
- **Failed sheet selection (P1):** A failed selection now leaves the previous sheet, raw data and analysis table intact. The selector returns to the valid sheet and shows the formula cell coordinate.
- **Archive expansion bounds (P1):** Before the SheetJS ZIP parser, the reader validates central directory structure and declared expansion limits: 32 MiB per entry, 100 MiB total, 4,096 entries. Multi-disk/ZIP64 inputs are rejected. The existing 10 MiB file, 50,000 data-row and 300-column bounds remain. These checks bound declared sizes; they do not establish complete protection against every malicious compressed input or a low-memory device.

The reader continues to reuse SheetJS, existing CSV/TSV parsing, header detection, mapping, date handling and table preparation. Macro code, formulas and hyperlink targets are not executed. Cleaned exports copy values, not formula expressions or external hyperlink relationships. The original workbook bytes are not rewritten.

## Communication inventory

| Path / operation | Destination and purpose | User data in request |
|---|---|---|
| Page open / ordinary assets | The selected host serves HTML, JS, CSS, icons | No file content; ordinary hosting access metadata remains outside the app |
| Excel/CSV parsing, statistics, Cleaner, RCI, workflow analysis | Browser memory; no request API | None observed or present in reviewed own-code paths |
| PDF engine | Same-origin `vendor/document/pdf/` module, worker, fonts/CMaps/decoders | Static GET URLs; PDF is supplied as local bytes |
| OCR engine | Same-origin `vendor/document/tesseract/` worker, WASM and fixed eng/jpn model paths | Static GET URLs; local canvas pixels enter the worker through browser messaging |
| Built-in document sample, only when selected | Same-origin fixed `samples/document-sample.pdf` | Static sample GET; no filename or current state appended |
| Export / print | Browser Blob download and print dialog | No application upload endpoint |
| Feedback | Separately configured external HTTPS link, only after user click | Only text the user chooses to enter on that external service; no analysis context appended by this app |

Own-code review includes fetch, XHR, sendBeacon, WebSocket/EventSource, dynamic script and worker paths, DOM URL attributes, console calls, storage and model/asset configuration. No application Analytics, Error Tracking, upload endpoint or Service Worker registration was found. The browser assistant tool registration is disabled for this candidate; its existing function remains in source. The sole application `fetch` before feedback work is the fixed sample GET; runtime vendor fetches are fixed to the same origin. PDF rendering uses `isEvalSupported:false`, `enableXfa:false` and no annotation/scripting viewer.

`connect-src 'self'` permits same-origin traffic; CSP alone therefore does **not** prove that manufacturing data cannot be sent. HTML escaping, fixed asset paths, restricted PDF options and runtime monitoring are also necessary. The candidate's local HTTP test exercises its meta CSP; production deployment and response headers are a separate release check. Feedback reception is outside this audit.

## Synthetic browser evidence

Command (from repository root, Node and Playwright available):

```sh
TOOLBOX_URL=http://127.0.0.1:8772/dist/ TOOLBOX_TEST_OUTPUT=local-test-results/release-security node tests/release-security-browser.cjs
```

The test uses real file inputs, parsers, calculators, Excel/CSV downloads, PDF.js, Tesseract and IndexedDB. It imports a searchable sentinel as filenames, product/category/RCI text, CSV values, and image pixels. It also imports a literal HTML image string and verifies that it remains text.

Candidate run after shared UI integration: **23 assertions passed**, Chromium channel Chrome **155.0.8059.40**. After initial static page load, **10 HTTP requests**, all same-origin GETs with empty bodies, were recorded. They fetched only PDF/OCR runtime assets, two language models and a local font. No sentinel appeared in observed request URLs, headers, bodies, page API attempts, WebSocket frames, console output or uncaught exceptions. Two PDF workers and one OCR worker were observed; no Service Worker was registered in the clean test context.

The observation uses BrowserContext request events, which include worker HTTP requests, plus page API interception and WebSocket events. Page fetch/XHR/beacon instrumentation does not instrument JavaScript inside vendor workers; their requests are monitored separately at the browser-context level. This test does not cover a user's pre-existing Service Workers, browser extensions, managed endpoint agents, browser telemetry or server access logs. The assertions are a regression test, not a complete non-transmission guarantee.

The focused Node suite (`node --test tests/release-security.test.cjs tests/file-reader.test.cjs tests/clean-i18n.test.cjs tests/privacy.test.cjs`) passed **32 tests**, including 7 new release-security checks. `git diff --check` passed. All 11 generated demo XLSX archives also passed the new archive preflight.

Machine-readable summary: [`evidence/security-browser-summary.json`](evidence/security-browser-summary.json). Full synthetic audit output and downloaded files are in the ignored `local-test-results/release-security/` directory. User-completed results and real data must never be added to Git.

## Storage, backup and failure behavior

| Storage | Content / timing | Recovery and deletion |
|---|---|---|
| Browser memory | Imported rows, calculations, current RCI and workflow projects while page remains open | Explicit `.rci`, `.mtb`, CSV/XLSX report exports as applicable; reload loses unsaved source data |
| localStorage `manufacturing-toolbox.language.v1` | Language when changed | Language UI reports a failed write |
| localStorage `manufacturing-toolbox.preferences.v1` | Explicitly saved column mappings and presets; may include selected product filter, limits, column names | App-owned-key deletion only; validation retains old on-disk value on failed write |
| IndexedDB `manufacturing-toolbox.documents.v1` | Explicitly saved confirmed documents, OCR text/word positions, edit history and templates; original PDF/image only when explicitly selected | `.mtbd` backup/restore, selected document deletion and unreferenced-page/source cleanup |
| OCR model IndexedDB cache | Fixed language model assets | Runtime cache; not imported images or extracted results |

Document save/restore validates version, schema, row confirmation, parsed values, references, sizes, source hashes and duplicates. Updates use a single read/write transaction; invalid restore cannot partially replace the library. Browser tests verified a rejected unconfirmed backup leaves prior records unchanged, a valid backup restores them, and an unrelated app's storage key survives. Existing document-store and UI safety suites additionally exercise failure/cancellation/race conditions. Storage errors are localized; quota restrictions and private/managed-browser policies can still prevent saving.

Browser storage and exported backups are not app-encrypted. IndexedDB is separated by origin, not URL path: another page on the same `koh2828.github.io` origin may access this storage. Back up important work to a location approved by the user's organization; browser storage is not the sole long-term archive. Clearing a site or browser profile can remove it. Document confirmation is a user review flag, not an electronic signature or certified quality approval.

## Dependencies and official advisory review

No major upgrades were performed. The deployed files, provenance, hashes and redistributed licenses remain in [`dist/vendor/document/manifest.json`](../../dist/vendor/document/manifest.json) and [`docs/ocr-dependencies.md`](../ocr-dependencies.md).

| Library | Pinned version / license | Known advisory assessment on 2026-10-15 |
|---|---|---|
| SheetJS CE | 0.20.3 / Apache-2.0 | Official CVE-2023-30533 affects through 0.19.2, fixed 0.19.3; CVE-2024-22363 affects through 0.20.1, fixed 0.20.2. Vendored version is beyond both fixes. |
| PDF.js | 6.4.299 / Apache-2.0 | CVE-2024-4367 fixed 4.2.67; CVE-2026-16633 fixed 6.2.108. Vendored version is beyond both fixes; the app also disables eval and does not use the scripting viewer. |
| Tesseract.js / core | 7.0.0 / 7.0.0, Apache-2.0 | Their official Security pages had no published advisories when checked. This does not establish absence of flaws in native image decoders. |
| eng / jpn models | 1.0.0 package / MIT metadata; upstream model Apache-2.0 notices retained | Fixed local model assets; arbitrary model URL selection is disabled. |

Pinned bundled supporting libraries: regenerator-runtime 0.13.11 (MIT), zlibjs 0.3.1 (MIT), wasm-feature-detect 1.8.0 (Apache-2.0), bmp-js 0.1.0 (MIT), is-url 1.2.4 (MIT), buffer 6.0.3 (MIT), idb-keyval 6.2.1 (Apache-2.0), base64-js 1.5.1 (MIT), ieee754 1.2.1 (BSD-3-Clause). License notices were retained. No complete transitive native-code vulnerability scan or fuzzing was performed. The source audit limits OCR inputs to the supported local file types and canvas processing; it does not expose arbitrary remote URL loading.

Official references checked: [SheetJS advisory index](https://cdn.sheetjs.com/advisories/), [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533), [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363), [PDF.js 2024 advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq), [PDF.js 2026 advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j), [Tesseract.js Security](https://github.com/naptha/tesseract.js/security), [Tesseract core Security](https://github.com/naptha/tesseract.js-core/security).

## Remaining limits

- Cached Excel formulas are trusted saved values, not recalculated or checked for freshness. Ambiguous dates remain unparsed until the user resolves them.
- A CSV's leading zeros/cell types cannot be guaranteed when another application auto-detects types; `.xlsx` is the preservation format. Safety prefixes are explicit reversible representation changes, not numeric corrections.
- Input bounds reduce resource exposure; adversarial archives/images, malformed native decoding and very low-memory devices are not exhaustively tested. OCR remains limited experimental functionality subject to original-document review.
- This audit does not approve enterprise use or override an organization's data-handling rules. Feedback configuration and actual receipt confirmation remain separate release conditions.
