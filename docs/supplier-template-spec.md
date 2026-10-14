# Supplier Template Specification — Document Intelligence

Schema version: **1**. Templates are editable local extraction configuration, not a trained OCR model. No regular expressions, scripts, URLs, API keys or remote processors are executed by the template engine.

## Template JSON

```json
{
  "schemaVersion": 1,
  "id": "aster-v1",
  "supplierId": "aster",
  "supplier": "Aster Materials",
  "name": "Aster certificate v1",
  "version": 1,
  "title": "Certificate of Analysis",
  "keywords": ["Aster Materials"],
  "fields": {
    "product": {"labels": ["Product", "Product Name"], "pattern": "", "region": null},
    "productCode": {"labels": ["Product Code"]},
    "lot": {"labels": ["Lot", "Lot Number"]},
    "certificate": {"labels": ["Certificate", "Certificate No"]},
    "issueDate": {"labels": ["Issue Date"]},
    "inspectionDate": {"labels": ["Inspection Date"]},
    "deliveryDate": {"labels": ["Delivery Date"]}
  },
  "table": {
    "headerKeywords": ["Inspection Item", "Result"],
    "columns": {
      "item": ["Inspection Item", "Item"],
      "result": ["Result", "Value"],
      "unit": ["Unit"],
      "lsl": ["LSL"],
      "usl": ["USL"],
      "method": ["Test Method", "Method"]
    },
    "endKeywords": ["END OF RESULTS", "Authorized Signature"],
    "region": null
  },
  "aliases": {"items": {}, "products": {}},
  "continuationKeywords": ["Continued"]
}
```

An exported template collection has `{ "schemaVersion": 1, "templates": [...] }`. Version and IDs are explicit. Separate version IDs allow the previous template to remain available. A collection cannot contain duplicate IDs.

## Recognition and extraction

- Supplier name or at least one supplier keyword must match. A generic certificate title alone is insufficient. Comparisons normalize Unicode width, case and whitespace in **labels**, not in extracted manufacturing values.
- Matching scores supplier identity, title and recognized table column labels. Higher scores win. If scores tie within one supplier, the highest template version wins. Cross-supplier ties, or equal-version competing templates, remain unidentified for human selection.
- Metadata labels locate values on the same line, stopping before the next metadata label. If a label has no same-line value, the immediately following nearby line can supply the value, bounded by the next column's label position. More-specific labels take precedence over prefixes (`Product Code` over `Product`). Titles and certificate-page footers are excluded from metadata candidates.
- Optional regions are normalized `[x, y, width, height]` within `[0, 1]`. They restrict searches or supply an explicit positional fallback. Field regions are never used to invent absent values.
- `pattern` is a **literal** prefix/suffix rule, optionally containing one `{value}` token. Example: `LOT-{value}` extracts the suffix from `LOT-001`. Without `{value}`, the literal must be present and the full value is retained. There is no regex execution.
- The table starts at a line containing the configured **item and result** column labels. Other available labels anchor unit, method and limits. Repeated headers are supported. `headerKeywords` is descriptive template metadata; it does not replace mandatory item/result anchors.
- Row cells are associated by word positions relative to header anchors. The row count is variable. An explicit end keyword stops extraction. Missing or ambiguous cells are retained with review issues; missing headers do not produce guessed rows.
- Exact item/product aliases apply only within their supplier template. The original OCR value remains available. Similar names are never automatically collapsed. An alias edit improves a rule; it does not retrain Tesseract.

## Page boundaries

Automatic continuation requires all of the following:

1. An explicit configured continuation keyword on the later page.
2. Adjacent pages in the same source file.
3. The same template and supplier, nonempty matching lot, and matching product/product code/certificate identity.
4. No conflict between nonempty inspection, issue or delivery dates.

The same supplier alone is never sufficient. Repeated identity without a continuation keyword remains a separate document with a boundary-review issue. Missing identity, changed identity and unresolved continuations remain separate. Manual split/merge resets confirmation; conflicting nonempty metadata is rejected during merge. Human boundary edits are retained in the audit.

## Validation and limits

Up to 100 templates; 40 labels/keywords per field; 200 characters per label; 500 exact aliases per dictionary; version 1–10,000. Regions must stay within the page. Unknown properties are discarded. Reserved prototype keys in alias dictionaries are rejected. Measurement data does not belong in a template.

The initial three templates describe **fictional** Aster Materials, 青葉試薬株式会社 and Northstar Polymers. They are examples for the supplied synthetic corpus, not guarantees for unrelated suppliers. Missing text, rotated/skewed rows, multiline cells, complex spanning headers, or poor scans can require preprocessing, a template edit or manual correction.
