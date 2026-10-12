# Local-first and dependency review — 2026-10-13

## Data boundary

The app is a static browser application. Imported manufacturing rows, workbook contents, analysis results and RCI text are held in browser memory. The reviewed source has no upload API, analytics, error tracking, external AI API or application-initiated network client. Content Security Policy blocks connections (`connect-src 'none'`) and form submissions. The language and validated, explicitly saved mappings/presets use dedicated localStorage keys. A preset may contain a user-selected product filter, specification limits and column names; these are settings, not a copy of the imported rows. Browser extensions, device software and the hosting provider are outside this code review.

GitHub Pages sends the application to the browser. That delivery is distinct from processing a manufacturing file. GitHub documents that it logs visitor IP addresses for security: [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

## Parser diagnostics

SheetJS can print workbook metadata to the developer console when it encounters unsupported formats. A synthetic flat ODS file renamed `.xlsx`, with a sentinel in a number-format condition, reproduced this behavior. The shared `FileReaderCore` now suppresses vendor console diagnostics only during synchronous operations and restores the original console descriptors in `finally`. Parser/write exceptions become a generic localized error with no original exception attached. This does not disable unrelated application error handling. The importer continues using the existing CSV parser, header detection, table preparation and Excel-to-row conversion.

`tests/file-reader.test.cjs` covers that reproduction, restoration after exceptions, existing XLS/XLSX date/identifier behavior, CSV/TSV and Shift-JIS handling, file/table limits and generic errors. `tests/privacy.test.cjs` discovers all application JavaScript modules, rather than relying on a stale fixed list. Runtime network checks remain necessary: static inspection alone cannot prove every browser workflow is free of transmissions.

## Bundled library review

The only third-party browser bundle is SheetJS CE 0.20.3, stored locally with its Apache-2.0 license. There is no npm application dependency tree to audit. The reviewed bundle is 951,904 bytes, SHA-256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`.

The [official CDN](https://cdn.sheetjs.com/) recommends version 0.20.3 as of the review date. The vendor advisories list:

- [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533): affected through 0.19.2; fixed in 0.19.3.
- [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363): affected through 0.20.1; fixed in 0.20.2.

The corresponding GitHub advisories are [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) and [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). Their npm packaging notes should not be mistaken for evidence that the vendored 0.20.3 artifact is affected by these two advisories. No library replacement was warranted on that basis.

The [2026 Open WebUI Excel preview advisory](https://github.com/open-webui/open-webui/security/advisories/GHSA-jwf8-pv5p-vhmc) concerns inserting `sheet_to_html` output without sanitization. This app does not call that API; cell values pass through the app's escaped text rendering. Cleaned Excel output writes formula-like strings as text. CSV intentionally preserves the user's original values and displays a formula-interpretation warning, because changing them automatically would change data semantics.

This review is not a guarantee against unknown vulnerabilities. Check the vendor's [advisory index](https://cdn.sheetjs.com/advisories/) when updating the library.

## Resource limits and remaining scope

Existing limits are 10 MiB per file, 50,000 data rows and 300 columns. Excel row/column limits are checked after synchronous workbook parsing; compressed content and multiple sheets can consume resources before that check. This release should not be described as having a complete decompression-bomb defense. A dedicated parser worker with cancellation and decompressed-size limits is a future hardening option if measurements justify it.

Baseline single-run Node measurements on synthetic 50,000-row, five-column data were approximately 21 ms for CSV parsing/header detection/table conversion, 3 ms for column inference, 109 ms for SPC with all eight Nelson rules, 689 ms for Excel parsing/row conversion, and 90 ms for legacy Cycle analysis. These are engineering observations on the development machine, not guaranteed browser performance or measured user time savings. Browser integration and large-file workflows must be measured separately.
