# Extraction Data Schema — Document Intelligence

Schema version: **1**. `dist/document-core.js` owns pure extraction, review and export transformations. OCR/PDF rendering and browser persistence are separate modules. Functions return new values; they do not upload data, write browser storage or modify source files.

## Source page contract

```js
{
  id, fileId, fileName, pageNumber, width, height,
  words: [{ text, bbox: [x, y, width, height], layoutBBox: [x, y, width, height], confidence: null }],
  text, method: 'text' /* or 'ocr' */, status, options, revisions: []
}
```

Bounding boxes use normalized page coordinates from 0 to 1. `bbox` always refers to the original source page for highlights. OCR may additionally provide `layoutBBox` in the corrected, upright image; extraction uses it for row/column grouping after rotation/deskew. It does not replace source provenance. `confidence` is null for direct PDF text or an OCR engine score between 0 and 100. It is **not a calibrated probability of correctness**. Source IDs connect review highlights to the actual page; filenames are not interpreted as inspection/delivery dates. `options` retains only validated language, layout, preprocessing, rotation/deskew, scale, denoise and force-OCR settings. `revisions` retains at most five previous page snapshots: `{at,text,textLength,textTruncated,wordCount,method,status,confidence,options}`. Each snapshot has at most 200,000 text characters; `textLength`/`textTruncated` disclose truncation. `pageRevision(page)` constructs a safe snapshot; it does not itself mutate or save history.

## Document and inspection rows

```js
{
  schemaVersion: 1, id, templateId, supplierId, supplier,
  product, productCode, lot, certificate,
  issueDate, inspectionDate, deliveryDate,
  pages: [pageId], sourceFile, fileId, pageRange: [firstPage, lastPage],
  status: 'identified' /* or 'needsReview', 'unidentified' */,
  verification: 'unconfirmed' /* or 'confirmed', 'rejected' */,
  issues: [], original: {}, edits: [], fieldSources: {},
  rows: [{
    id, item, method, resultRaw, resultNumeric, qualifier,
    unit, lslRaw, uslRaw, lsl, usl,
    sourcePage, sourceFile, bbox, confidence,
    status: 'unconfirmed', issues: [],
    original: { item, method, resultRaw, unit, lslRaw, uslRaw,
                sourcePage, sourceFile, bbox, confidence },
    edits: [{ field, from, to, at }]
  }]
}
```

Metadata dates are validated real calendar dates and normalized to `YYYY-MM-DD`. Supported unambiguous input formats are year-first `YYYY-MM-DD`, `YYYY/MM/DD` and `YYYY年M月D日`. Invalid/ambiguous OCR dates remain blank in the normalized field, with the original in `fieldSources[field].raw` and a review issue. Missing values remain blank/null.

Source page range is empty after manual split/merge because page IDs remain the authoritative provenance. Each row retains its original source filename, even if a user explicitly merges documents from multiple files. No official approval identity or regulated e-signature is implied by local review status.

## Result interpretation

`parseResult(raw)` returns `{ raw, numeric, qualifier, lower, upper, nominal, tolerance }`.

| Source example | Qualifier | Numeric | Other interpretation |
|---|---|---:|---|
| `0.01`, `1,234.5` | `=` | 0.01 / 1234.5 | Exact numeric candidate |
| `<0.01`, `≤0.01` | `<`, `<=` | null | Upper bound 0.01 |
| `>100`, `≥100` | `>`, `>=` | null | Lower bound 100 |
| `ND`, `N.D.`, `Not Detected` | `ND` | null | Not detected |
| `Pass`, `Fail`, `N/A` | same | null | Categorical result |
| `95–110` | `range` | null | Lower 95, upper 110 |
| `100 ± 5` | `tolerance` | null | Nominal 100, tolerance 5 |
| blank | `missing` | null | No zero substitution |
| other text | `text` | null | Human review required |

Thousands separators must form complete groups. Malformed commas, implicit unit suffixes, hex strings, nonfinite numbers, unsafe integers, and nonzero values that underflow to zero are not accepted as numeric measurements. Raw strings always remain available. Normal JavaScript floating-point limits apply to exported numeric cells; the raw string is authoritative when precision matters. No unit conversion, decimal repair, interpolation, imputation or estimation is performed.

`lsl`/`usl` accept only exact numeric strings. Raw limits are retained. A reversed/equal range is flagged. An out-of-specification value is flagged for attention, **not** labelled an OCR error or automatically corrected. In-specification values receive no implied correctness guarantee.

## Review and provenance

All extracted documents and rows start unconfirmed. `editDocument`, `editRow` and `addRow` are immutable operations retaining original values and timestamped edits. Metadata changes reset every nonrejected row; row edits reset that row and document confirmation. Manual added rows have blank OCR originals and a `manualRow` audit event.

`confirmDocument(doc, {acknowledgeIssues: true})` confirms nonrejected rows only after explicit user action. Supplier, product or product code, lot, item and result must be present. Issues such as a legitimate OOS result can be acknowledged; missing identity cannot. `confirmRow` alone does not confirm its containing document. Reject retains provenance and removes that observation from analysis eligibility.

An imported dataset is `{ schemaVersion: 1, documents: [...] }`. The core validates IDs, limits, page references, coordinates, dates, audits and statuses. It reparses raw measurements and rejects any supplied numeric/qualifier/limit interpretation inconsistent with the raw value. Unknown properties are discarded. There is no implicit migration from future versions. Maximum 2,000 documents and 50,000 total rows. Storage and explicit original-PDF retention are handled by the UI/store layer. The store sanitizes page records, validates canonical source IDs (`SHA256-pN`), and verifies included original bytes against their SHA256 before saving or restoring. Mutations are serialized and database snapshots/writes share one IndexedDB transaction, including restored templates. Document/row limits and a 200 MiB combined metadata/source budget are checked before writes. Removing the final referring document removes orphan pages and source bytes. `DocumentStore.identity(doc)` is the same canonical identity used by the persisted SHA256 fingerprint, allowing in-memory analyses to remove exact duplicate certificates before saving. Save results include skipped `duplicateIds`; corrections, review status, raw specifications and all three date fields participate in identity.

## Export and analysis handoff

`exportLong(documents, {confirmedOnly: false})` returns `{headers, rows}`. Columns include supplier/product/code/lot/certificate/dates, item/method, result raw/numeric/qualifier, unit/limits, both review statuses, source filename/page/box, OCR confidence, original raw result, corrections and issues. Nonconfirmed output is explicitly labelled. CSV formula escaping and UTF-8 BOM are applied by the existing export adapter.

`exportWide` returns one document per row. Columns are separate for each exact item + method + unit + specification combination. Cells retain raw values **and their review status**. Duplicate observations are listed, never silently averaged or overwritten.

`analysisGroups(documents)` permits only:

- Confirmed documents **and** confirmed rows.
- Exact numeric (`=`) results; no censored, range, categorical or missing observations.
- Nonempty supplier, product/product code, lot and item.
- Valid specification syntax/order (missing limits are allowed for a trend).

Each group is separate by supplier ID/name, product/code, item, method, unit and limits. It contains `rows`, `documentRefs`, `table` (`Lot`, `Inspection Date`, `Product`, `Value`) and `mapping` for the existing Importer. Lots are naturally ordered. Every group has `capabilityEligible: false` and reason `certificateSamplingRequiresReview`: certificate values may be rounded lot summaries. The application must obtain an explicit sampling-suitability acknowledgement before its existing capability workflow can show indices. This module creates **no new statistical formulas**.

## Review issue codes

Static codes: `missingItem`, `missingResult`, `nonNumericResult`, `lowConfidence`, `invalidSpecification`, `outOfSpecification`, `duplicateItem`, `ambiguousRow`, `tableNotFound`, `noInspectionRows`, `ambiguousTemplate`, `unidentifiedSupplier`, `missingProduct`, `missingLot`, `unresolvedContinuation`, `boundaryNeedsReview`, `supplierMismatch`, `unitMismatch`, `manualEntry`, `manualBoundary`.

Metadata issues use `ambiguousField:<field>` or `invalidDate:<field>`. UI translations resolve these codes; raw content is never placed into diagnostic log messages.
