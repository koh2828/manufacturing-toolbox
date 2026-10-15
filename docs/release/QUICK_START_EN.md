# Manufacturing Toolbox beta candidate: owner quick start

Version: **v0.8.1-beta.1**. Record the exact commit tested. See [STATUS](STATUS.md) for scope and release blockers. This is a candidate for owner testing, not approval to publish.

## Start locally

Use a separate test browser profile or private window. From the candidate repository folder, with Python3 installed:

```sh
python3 -m http.server 8770 --bind 127.0.0.1 --directory .
```

Open **http://127.0.0.1:8770/Launch.html#home**. Stop the server with Ctrl+C. Normal spreadsheet tools can also open directly from Launch.html; PDF/OCR requires HTTP and local static assets. Do not use the current production site to test unreleased changes.

Copy `demo-data/Manual_Test_Checklist.xlsx` to `local-test-results/`. Keep every status **Not Tested** until you personally run that test. This local folder must not be committed. Record elapsed time, actual results and usability yourself; automated test results do not fill this sheet.

## Try three jobs before reading detailed steps

1. **Process Capability Analysis**: load `A-experience/D01/D01A_inspection.xlsx`, choose sheet Product_A and Viscosity, LSL95/USL110, Lot and Date. Review Individuals/MR and generate a report you can open.
2. **Recurring Quality Review**: add the two CSVs in `A-experience/D02/`, map the long-format columns, compare October against September and save settings for reuse.
3. **Batch Process Analysis**: load `A-experience/D05/D05A_batch_events.xlsx`, inspect waiting and parallel steps, open the Pareto view and export the result.

Record where you hesitate. The full Japanese guide has detailed test IDs and exact Japanese UI labels. Switch to English to check that values, identifiers and settings remain unchanged.

## Check known answers

`B-known-answer/` contains small fixtures. `expected/` contains the independently calculated answers and source-document truth. It is not an input folder.

- D01: values1–5, mean3, sample SD√2.5; with LSL0/USL6 and XmR, Cp/Cpk1.128 and Pp/Ppk0.632455532. N5 is not an adequate capability study.
- D04: Start→End minutes10…18,60 gives P25 12.25 and P50 14.5. A valid long cycle remains included. Midnight23:50→00:10 the next day is20 minutes.
- D05: parallel20-minute steps overlap by10 minutes; sum40, union30, elapsed30. The existing Batch tool supplies the IQR comparison; Cycle Time does not add an IQR feature.
- D06: counts40/30/20/10, cumulative40/70/90/100%. The all-zero fixture is separate.
- D03: preserve Lot000123, blank vs numeric0 vs text0, <0.01, ND and Pass. Do not guess whether01/02/2026 means January2 or February1.
- D08 is experimental: setup files are inA, held-out files inB. Aster is text PDF; Aoba is image-only. Check against the source before confirming. Unconfirmed and qualified nonnumeric results must not flow into numerical analysis.

## Export, reset and feedback safely

Open every downloaded Excel/CSV/PDF and verify its values and row counts. CSV has no cell type metadata; import Lot columns as text in Excel. Save a `.mtb` project for recurring/batch work, a `.rci` file for investigations, or a `.mtbd` backup for document records before replacing or reloading work. Do not clear all browser storage or overwrite an existing preset to reset a test.

Use Feedback & Contact only for information you choose to enter. Do not include confidential manufacturing details. If no form URL is configured, record the external form test as Blocked; a working navigation link does not prove that responses are received.

Report failures with Test ID, commit, browser/OS, fixture, settings, expected vs actual result and reproduction steps. General release requires the owner's explicit approval of the tested commit.
