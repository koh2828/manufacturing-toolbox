# Manufacturing Toolbox

**このブランチは v0.8.1-beta.1 の本人確認用候補です。本番未反映・公開承認待ちです。**
候補版の検証は、このフォルダの `Launch.html` と [手動検証ガイド](docs/release/MANUAL_TEST_GUIDE_JA.md)を使用してください。
[公開範囲・残条件](docs/release/STATUS.md) / [検証結果](docs/release/VALIDATION.md) / [デモ](demo-data/README.md) / [お問い合わせ設定](docs/release/FEEDBACK_SETUP.md)。
下のGitHub Pagesリンクは既存公開版で、今回の候補版ではありません。

管理図の横軸はロット番号順・等間隔表示です。同じ日付の測定点も重ならず、日付による期間絞り込みも利用できます。

## [▶ 既存公開版を起動 / Open the existing published version](https://koh2828.github.io/manufacturing-toolbox/Launch.html)

**上のリンクをクリックするだけで利用できます。インストール・ログイン・アクセス申請・コマンド操作は不要です。**

**v0.8：Document Intelligenceを追加。** 検査成績書のPDF・画像を端末内で読み取り、原本を確認・修正してから検索・Excel / CSV出力・品質トレンドへつなげられます。既存の定例品質分析・バッチ分析も利用できます。

工程能力解析、Individuals / MR・Xbar-R管理図、サイクルタイム、根本原因調査（RCI）、パレート分析、Excel / CSVの整形・出力をブラウザで利用できます。日本語 / English対応。

共有するときは、このリポジトリのURL、または[アプリの直接起動リンク](https://koh2828.github.io/manufacturing-toolbox/Launch.html)を送ってください。GitHubのファイル一覧で `Launch.html` をクリックするとソース表示になるため、**起動にはこのREADMEの上のリンク**を使います。

### オフラインで使う

1. [Launch.htmlのダウンロード元](https://github.com/koh2828/manufacturing-toolbox/blob/main/Launch.html)を開き、**Download raw file**（ダウンロードアイコン）から保存します。
2. 保存した `Launch.html` をダブルクリックし、Microsoft Edge / Google Chromeなどのブラウザで開きます。

Excel / CSVと既存分析ツールのプログラムは1ファイルに含まれています。これらはインターネット接続もローカルサーバーも不要です。**Document IntelligenceのOCRはこの単独HTMLでは動きません。上の公開リンクをご利用ください。** OCR用プログラム・言語モデルは同じGitHub Pagesから取得し、処理は端末内で行います。GitHubの **Code → Download ZIP** を使う場合は、ZIPを展開してから `Launch.html` を開いてください。HTMLがテキストエディタに関連付けられているPCでは「プログラムから開く」でブラウザを指定します。

### データの扱い

- 読み込んだExcel / CSV、測定値、製品名、ロット番号、調査内容は端末のブラウザ内で処理します。アプリにアップロードAPI・外部AI・アクセス解析はありません。
- 自動保存するのは言語・列マッピング・プリセット等の設定とOCRの言語モデルです。製造データ本体は自動保存しません。Document Intelligenceの「確認済みデータを保存」は、抽出テキスト・座標・訂正履歴を含む結果をこのブラウザのIndexedDBへ保存します。原本PDF / 画像は別途選択した場合のみ保存します。
- ブラウザ内保存は暗号化保管庫ではありません。同じオリジン（この配信では `koh2828.github.io`）のコードからアクセスでき、他のPCやブラウザには同期しません。バックアップを明示的に出力できます。
- ファイル出力はユーザーの操作で行います。元ファイルを上書きしません。
- オンライン版のページ配信にはGitHubへの通信があります。GitHub Pagesはアクセス時のIPアドレスをセキュリティ目的で記録します（[GitHub公式説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)）。製造データを送る通信とは別です。
- 社内ネットワークで `github.com` / `github.io` やHTMLファイルの実行が制限されている場合、その制限には従ってください。

[詳しい使い方・計算式](USER_GUIDE.ja.md) · [検証記録](VALIDATION.md)

### Document Intelligenceを試す

[検査成績書を読み取る](https://koh2828.github.io/manufacturing-toolbox/Launch.html#documents) → **架空の帳票で試す** → 原本と抽出値を比較 → 必要箇所を修正 → 確認 → 保存・出力／品質トレンド。

日英3社・6製品の架空帳票でテストしています。初回20ページはこの検証端末で約14.5秒、検査値の完全一致76/93件（81.72%）。実帳票への精度保証ではありません。未確認データや `<0.01` / `ND` は通常の数値として分析しません。手書きや未知の複雑なレイアウトは手修正・テンプレート登録が必要です。

- [使い方](USER_GUIDE.ja.md#v08-document-intelligence) · [検証記録](VALIDATION.md)
- [構成・処理](docs/ocr-architecture.md) · [依存ライブラリとライセンス](docs/ocr-dependencies.md)
- [Supplier Template仕様](docs/supplier-template-spec.md) · [抽出データ仕様](docs/extraction-schema.md)
- [精度と性能の実測](docs/ocr-accuracy-report.md) · [セキュリティ確認](docs/document-security-review.md)
- [既知の制限](docs/document-known-limitations.md) · [今後の拡張](docs/future-ai-ocr.md)
- [20ページのテストPDF](tests/fixtures/documents/mixed-certificates-20-pages.pdf) · [正解データ](tests/fixtures/documents/ground-truth.json)

### English

Click **Launch.html — Open the app** above. No installation, sign-in, terminal, or access request is required. Version 0.8 adds **Document Intelligence**: local PDF / image OCR, supplier templates, source review and corrections, explicit local storage, search, Excel / CSV / PDF reports, and confirmed quality trends. Existing capability, cycle time, Pareto, RCI, cleaning, recurring quality, and batch tools remain available.

Uploaded content stays in your browser. PDF.js, Tesseract.js, and language models load from this site's origin; no file-upload or external AI endpoint exists. Results are never saved automatically. Explicitly saved document results include source text, coordinates, and edit history in IndexedDB; original files are separately opt-in. This storage is unencrypted and shared by applications on the same origin. Backups are explicit downloads.

The bundled `Launch.html` supports the existing Excel / CSV tools offline. **OCR requires the hosted app or a complete static HTTP deployment including `dist/vendor/document/`.** A standalone `file://` HTML does not support OCR. Test accuracy and limitations are documented above; every OCR result requires human confirmation.

### 開発・保守用 / Development only

利用者が以下を実行する必要はありません。アプリのソースは `dist/`、テストは `tests/` にあります。

- 単体テスト: `node --test tests/*.test.cjs`
- 単体HTMLの再生成: `python3 scripts/build-standalone.py`
- GitHub Pages: `main` ブランチの `/ (root)` を配信。`.nojekyll` で静的ファイルをそのまま公開。
- ブラウザテストの実行方法は [詳細ガイド](USER_GUIDE.ja.md) を参照。

SheetJS CE 0.20.3を同梱しています。ライセンスは [Apache-2.0](dist/vendor/LICENSE.sheetjs.txt) で、単体HTML内にも全文を含めています。

PDF.js / Tesseract.js / Tesseract core / 日英言語モデルも配布物に同梱しています。固定バージョン、Apache-2.0ライセンス、NOTICEとハッシュは [依存資産一覧](docs/ocr-dependencies.md) を参照してください。
