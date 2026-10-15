# 無料β候補版の手動検証データ

対象：**v0.8.1-beta.1**。すべて架空データです。実在企業の帳票・製品・設備・検査値は含みません。

まず [手動検証ガイド](../docs/release/MANUAL_TEST_GUIDE_JA.md) の「最初に試す仕事」から始めてください。英語の短い案内は [Quick Start](../docs/release/QUICK_START_EN.md) にあります。

| フォルダ | 使い方 |
| --- | --- |
| `A-experience/` | 業務体験用。最初は詳細な手順を読まず、操作に迷う箇所を記録します。 |
| `B-known-answer/` | 少量の正解確認用。無効日時・全件ゼロ等は正常ケースと別ファイルです。 |
| `expected/` | 原本上の正解、計算定義、許容誤差。アプリへの入力ファイルではありません。 |
| `Manual_Test_Checklist.xlsx` | 30テストの記録シート。初期Statusはすべて **Not Tested** です。 |
| `Feedback_Tracking_Template.csv` | 困った業務・頻度・回避策・影響・対応方針を手元で整理する任意の様式。 |
| `catalog.json` | 各入力ファイルの用途・件数/ページ数・Test ID・期待値への参照。 |

D01品質解析、D02定例品質分析、D03Clean & Export、D04サイクルタイム、D05バッチ工程分析、D06パレート、D07RCI、D08Document Intelligenceの構成です。D08は制限付きの試験機能です。Aの帳票で設定を確認し、Bの帳票は初回評価が終わるまで設定調整に使わないでください。

**入力データと本人の結果を分けます。** 記録シートを `local-test-results/` にコピーし、対象Commit ID・実際の結果・所要時間・使いやすさを本人が記入してください。このフォルダはGit管理対象外です。デモ原本を上書きしません。自動テストの合格は本人の手動確認の合格を意味しません。

XLSXは型を保持します。CSVには型情報がないため、ExcelでCSVを開く際はLot列を文字列として取り込んでください。CSVをダブルクリックした際のExcelの自動型変換と、Webアプリによる変換を混同しないようにします。

## 開発者向けの再生成

seedは `20261015` 固定です。通常の操作検証では再生成は不要です。生成コードは開発用で、アプリの統計・抽出関数を呼び出して期待値を作りません。

```sh
node scripts/generate-release-demos.mjs
python3 scripts/generate-release-pdfs.py
node --test tests/release-demo.test.cjs
```

表の生成には `@oai/artifact-tool`、PDFにはReportLab・pypdf・pypdfium2・Pillowが必要です。PDFは既存の開発用 `scripts/generate-document-fixtures.py` の描画関数だけを再利用します。日本語フォントは `DOCUMENT_JP_FONT` で指定できます。PDFの画像確認にはPopplerの `pdftoppm` を使用します。

Codexの同梱環境を使用する場合は `load_workspace_dependencies` で返されたNode/Pythonと依存パッケージを利用します。依存ライブラリやOCRモデルはデモパックに含めません。別環境で再生成する場合、開発用の依存解決環境を用意してください。`DEMO_OUTPUT` で出力先、`REVIEW_OUTPUT` でプレビューと検証ログの保存先を変えられます。これらの生成スクリプトはネットワークから帳票・データを取得しません。

生成後のXLSXは再読込して値・型・シート構成・数式の保存済み値を確認します。D08のスキャンPDFは画像のみで、隠れたテキスト層はありません。PDFの正解JSONは画像化前の架空帳票定義から保存し、OCRの結果を正解に流用しません。
