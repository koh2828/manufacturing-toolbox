# Document Intelligence — Local-first Security Review

確認日: 2026-10-14（Asia/Tokyo）。対象はこのリリースのコード、固定依存配布物、合成帳票によるブラウザ試験です。侵入テスト、全依存ライブラリの完全な安全性証明、会社の利用許可を意味しません。

## データの経路と通信

PDF/PNG/JPEGはブラウザの `File` / `Blob` として読み込み、PDF.js workerとTesseract workerで処理します。OCRにファイルのURLを渡さず、端末内で作成したCanvasを渡します。ファイル本文・OCR結果・製品名・Lot・測定値を送るAPI、AI呼び出し、Analytics、Error Tracking、WebSocketは追加していません。

通信が必要なのは、同一オリジンの静的なJavaScript、Worker、WASM、モデル、フォント、PDF画像デコーダー、およびユーザーが選択した内蔵の架空サンプルです。モデルと言語の選択肢は固定値に制限し、任意のモデルURLは受け付けません。CDNへの自動フォールバックはありません。

実エンジンの20ページ試験では、再処理・キャンセル・不正PDF・連続プレビューも含め **25件のGET、送信本文0 bytes、外部ホスト0件** でした。URLもすべて固定の `dist/vendor/document/` 配下でした。保存・バックアップ・復元・削除のIndexedDB試験44項目では、処理中のHTTPリクエスト0件・未捕捉例外0件を確認しました。これは試験したコード経路についての結果です。通常のページ／静的資産アクセスのIPアドレス等はホスティング側のアクセス記録に残り得ます。

証跡: [`benchmark/audit-summary.json`](../tests/fixtures/documents/benchmark/audit-summary.json)、`tests/document-engine-browser.cjs`、`tests/document-store-browser.cjs`、`tests/privacy.test.cjs`。公開サイトでの実行確認はリリース記録と区別して報告します。

## 保存内容と利用者の選択

既存の設定・言語・Presetは引き続きブラウザ設定保存です。Document Intelligenceでは、明示的に保存した確認済みデータをIndexedDB `manufacturing-toolbox.documents.v1` に保存します。単に読み込み・抽出しただけでは製造データは永続保存されません。

「抽出結果だけ保存」には、文書メタデータ、検査行、修正履歴、原文OCRテキスト、単語と原本位置、処理設定、限定した再処理履歴が含まれます。**元PDFを保存しなくても機密情報を含む保存データです。** 元PDF/画像のバイト列は原本保存を明示的に選んだ場合だけ追加します。原本なしの場合、再読込後のプレビューには同じ原本の再添付が必要です。SHA-256で別のファイルのすり替えを検出します。

保存データと `.mtbd` JSONバックアップは、このアプリ独自の暗号化をしていません。OS・ブラウザプロフィールの保護に依存します。バックアップへの原本の含有も選択式で、元ファイルを変更する処理はありません。

削除は対象文書と、どの保存文書からも参照されなくなったページ・原本を削除します。別文書で共有される原本は残します。テンプレートは独立した設定として管理します。ブラウザのサイトデータ削除でも消去できます。SSD・バックアップ・OSスナップショットからの物理的な完全消去までは保証しません。

OCRのモデルキャッシュは別用途のIndexedDBです。固定の日英モデルだけを保存し、書類画像・OCR結果は入れません。ブラウザのページキャッシュも実行用の静的資産です。

## 同一オリジンと共有PCの注意点

ブラウザ保存領域はURLのパスではなくオリジンで分離されます。現在のGitHub Pagesでは、同じ `https://koh2828.github.io` の別リポジトリにあるページも同一オリジンです。それらのスクリプト、将来配信されるこのサイトのコード、権限を持つブラウザ拡張や端末利用者が保存内容へアクセスできる可能性があります。アプリ内の「Local-first」は、同一オリジンからの隔離・端末暗号化・社内利用許可を保証しません。

機密用途を拡大する場合の優先検討事項は、他用途と共有しない専用オリジン、管理されたブラウザプロフィール、会社の保管・削除方針です。実企業の機密成績書は今回の検証にもGitHubにも使用していません。

## CSPと実行制限

`dist/index.html` の主要ポリシー:

```text
default-src 'self' data: blob:;
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' blob: data:;
connect-src 'self';
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
form-action 'none'
```

単体 `Launch.html` ではビルド済みのインラインスクリプトにSHA-256 hashを追加します。JavaScriptの `unsafe-eval` / `unsafe-inline` は許可していません。`wasm-unsafe-eval` はWebAssembly用です。PDFの埋め込みスクリプトやフォームを実行するビューアは使用せず、XFAを無効化、注釈を描画しないCanvas表示に限定しています。QuickJS・PDF sandbox資産は配布しません。

`connect-src 'self'` は同一サイトのモデル取得を許すための設定であり、それだけで「製造データ送信が不可能」とは証明できません。自作コードの通信経路の限定、Worker入力の確認、実ブラウザのリクエスト監査を併用しています。GitHub Pagesでは任意のWorker応答ヘッダー設定や完全なホスト防御を行っていません。

表示する抽出文字列はHTMLエスケープし、テンプレートは実行コードや任意正規表現を受け付けません。JSON復元時は型・範囲・参照・版・重複・解釈値を検証し、成功前に保存領域を部分更新しません。CSVは式として扱われ得る文字列に安全化用の接頭辞を付け、Excel出力は文字列をセルの式に変換しません。元の文字列は内部データ／バックアップで保持します。

エラーは固定コードだけをUIへ返します。Vendor workerの診断出力は内容漏えいを避けるため抑制しています。Workerの変更箇所と元のhashはmanifestで追跡できます。

## 依存ライブラリと公式セキュリティ情報

| 対象 | 配布版 | 公式情報との照合 |
|---|---|---|
| PDF.js / pdfjs-dist | 6.4.299 | 下記の公開済み2件の影響範囲外 |
| Tesseract.js / core | 7.0.0 / 7.0.0 | 公式Securityページでは確認時点に公開advisoryなし。未知の脆弱性がないという意味ではない |
| 言語モデル | eng/jpn 1.0.0、best_int | 固定配布、外部URL指定なし。ライセンス・hashを同梱 |

- **CVE-2024-4367 / GHSA-wgrm-67xf-hhpq**: PDF.jsのフォント処理に関する任意JavaScript実行。公式advisoryの対象は4.1.392以下、修正版4.2.67。採用版6.4.299は対象外で、アプリも `isEvalSupported:false` を指定します。[Mozilla公式advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)
- **CVE-2026-16633 / GHSA-hq66-cqwq-w95j**: スクリプト有効なPDFビューアとCSP条件に関する任意JavaScript実行。修正版6.2.108。採用版6.4.299は修正後です。GitHubの整理済み影響範囲は5.6.83以上6.2.108未満。こちらの実装はPDF scripting viewerを使用しません。[Mozilla公式advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)、[GitHub advisoryの影響版](https://github.com/advisories/GHSA-hq66-cqwq-w95j)
- [Tesseract.js公式Security](https://github.com/naptha/tesseract.js/security)、[Tesseract.js-core公式Security](https://github.com/naptha/tesseract.js-core/security)も確認しました。内蔵ネイティブ画像ライブラリ全体の独立した脆弱性監査やファジングは未実施です。

[依存・ライセンス一覧](ocr-dependencies.md)と[固定資産manifest](../dist/vendor/document/manifest.json)を参照してください。更新時にはモデルだけでなくPDFパーサー、Worker、画像デコーダー、依存ライブラリのadvisoryも再確認します。

## 残るリスクと非対象

悪意ある圧縮画像／PDF、非常に大きなデコード画像、低メモリ端末での停止を完全には防げません。実測のChromeプロセス群RSSは約1.37 GBでした。入力上限・逐次処理・Canvas解放・Worker終了はありますが、低スペックPCの安全な最大量は別途確認が必要です。

ブラウザの保存容量不足、管理ポリシー、プライベートモード、ストレージの消去・退避により保存は失敗／消失し得ます。検査値の「確認済み」はユーザー操作を表す状態であり、電子署名・改ざん防止監査台帳・正式な品質承認フローではありません。バックアップの記録は暗号学的にユーザーの承認を証明しません。
