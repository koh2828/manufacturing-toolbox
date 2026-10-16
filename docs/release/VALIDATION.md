# 候補版の検証記録

対象: v0.8.1-beta.1、2026-10-15。本人の手動試験は未実施です。自動テストの合格で公開承認を代用しません。

## 2026-10-17の最終再検証

認証完了後の引き渡しに合わせ、同じアプリCommit `a05f4b3c06dcacf88f0f706dcf3146766dd19936` をChrome **155.0.8059.80**で再検証しました。単体305件（失敗・skip 0）、ブラウザ13本547チェック、実PDF/OCR4ケースがすべて合格。既存のテストと期待値は変更していません。

さらにGitHubの候補ブランチから `Launch.html` を再取得し、検証済みファイルとSHA256が完全一致することを確認。取得したHTMLそのものを専用ローカル環境で起動して `node tests/browser-acceptance.cjs` の35チェックを追加実行し、外部通信・ブラウザ例外0件で合格しました。これは上記547チェックとは別のアップロード後確認です。

実行コマンドは下記「再実行」の全試験と `tests/release-startup-browser.cjs`。通常の画面試験は独立したコンテキストで行い、性能を測る定例・バッチ試験は単独実行しました。別ポートのlocalhostサーバーを使用し、試験後に停止。利用者の8770の画面・作業状態は操作していません。

集計・環境・通信監査・性能値は [evidence/rerun-2026-10-17.json](evidence/rerun-2026-10-17.json)、生のログ・出力は作業フォルダの `work/beta-release/evidence/resume-2026-10-17/` と `resume-document-2026-10-17/` に保存しています。WebKit、社内PC、本人の手動検証、実フォーム受信は引き続き未実施です。OCR4ケースの合格は安全制御の検証であり、画像PDFの誤認識が解消した意味ではありません。

## 実行環境・結果

macOS / Node v24.19.0 の同梱ランタイム、Python 3、Playwright Chromium channel `chrome` **155.0.8059.40**。
正確な実行環境と集計は [evidence/final-summary.json](evidence/final-summary.json)、単体ログは [evidence/final-unit.txt](evidence/final-unit.txt)。

- 開始時の既存単体試験: **276合格 / 失敗0 / skip0**。
- 変更後の全単体試験: **305合格 / 失敗0 / skip0**。
- Chromium: 既存・追加の画面試験すべて合格。**547チェック**と、実PDF/OCR **4ケース**を確認。
- 本番と同じ `/manufacturing-toolbox/Launch.html` 配下で起動。ルートindexから相対リダイレクト、file://の通常機能、同一オリジンのOCR資材取得を確認。
- WebKit: 実行ファイルが環境に存在せず起動不能。Safari、企業管理下のChrome/Edge、異なるOSの手動検証は未実施。
- 実フォーム送信・受信、本人の時間計測・使いやすさ評価、本番デプロイは未実施。

## 再実行

リポジトリルートで実行します。`node` / `python3` / Playwright（Chrome channel）を利用できる環境が必要です。ランタイムをアプリ利用者へインストールさせる要件ではなく、開発用試験です。

```sh
python3 scripts/build-standalone.py
node --test tests/*.test.cjs
python3 -m http.server 8770 --bind 127.0.0.1 --directory .
```

別ターミナルで、実行対象の試験を指定します。Playwrightが標準検索先にない場合、`TOOLBOX_PLAYWRIGHT` にインストール済みモジュールのパスを設定します。

```sh
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/browser-acceptance.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/multilingual-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html#capability node tests/chart-view-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html#capability node tests/lot-axis-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/workflow-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/workflow-safety-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/document-ui-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/document-ui-safety-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/document-store-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/release-ui-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/release-demo-browser.cjs
TOOLBOX_URL=http://127.0.0.1:8770/Launch.html node tests/release-security-browser.cjs
TOOLBOX_ENGINE_BASE=http://127.0.0.1:8770/dist/ node tests/release-demo-documents.cjs
```

`TOOLBOX_TEST_OUTPUT`で証拠の出力先を指定できます。PDFの数値・文字を照合して全ページを画像化する補助:

```sh
python3 tests/release-pdf-verify.py <release-demo-browserの出力先>
```

これはpypdf、Pillow、pdftoppmを使います。実際に出力した6レポートの22ページを目視確認し、数値・日本語18項目も照合しました。ダウンロード発生だけで合格にしていません。
ローカルサーバー停止はCtrl+C。公開トンネルは使用しません。

## 計算の定義と独立性

詳細は [STATISTICS_EVIDENCE.md](STATISTICS_EVIDENCE.md)、デモ用の定義・許容差は [definitions.json](../../demo-data/expected/definitions.json)。入力生成と期待値生成はアプリの計算関数に依存していません。既存の独立Python Decimal参照値も再生成し、差分がないことを確認しました。

| 正解確認 | 独立した期待値 | 確認経路 |
|---|---|---|
| 1,2,3,4,5 | N=5、平均/中央値3、標本分散2.5、s=√2.5 | CSV/XLSX→共通読込→解析→実XLSX再読込 |
| 同データXmR、LSL0、USL6 | MR平均1、σwithin=1/1.128、Cp=Cpk=1.128、Pp=Ppk≈0.632455532 | 単体・UI・Excel・日本語PDF |
| 10〜18,60のR7 | P25=12.25、P50=14.5、P75=16.75、P90=22.2、P95=41.1 | サイクルP25/P50、バッチの既存分位点 |
| IQR選択時 | 下限5.5/上限23.5、60が候補。除外後P50=14、P75=16、P90=17.2、P95=17.6 | バッチのみ。原記録と経過時間には60を保持 |
| 23:50→翌00:10 | 20分 | 実CSV→サイクル解析 |
| 09:00–09:20と09:10–09:30 | 合計40分、和集合30分、経過30分 | 実CSV→バッチ→実Excel再読込 |
| 40,30,20,10 | 累積40/70/90/100% | Excel→パレート→Excel/PDF |
| 全件0 | 割合未定義。図・割合評価を抑止 | 単独パレートとバッチのレポート |

整数・識別子・件数は厳密一致、浮動小数点の解析値は事前定義した絶対/相対許容差、PDFは表示桁に対応した丸め値で照合します。結果に合わせて許容差を拡大していません。

標本標準偏差とwithin推定を区別し、Cp/Cpkにwithin、Pp/Ppkに全体の標本標準偏差を使用します。Xbar-Rは連続した固定サイズの合理的な群を前提とし、不完全群を除外します。単一工程能力の少数サンプルは参考計算であり、十分な工程能力評価の標本数を意味しません。管理限界は規格限界ではありません。比較は期間ごとの再計算で、改善の因果関係を断定しません。

## ImportからExportまで

- `000123`はXLSX再読込でも文字列として保持。空欄、数値0、文字列0、`<0.01`、ND、Passを区別。
- 曖昧日付の勝手な解釈、欠測の補完、繰り返し値の重複削除は行わない。日英切替で元データ・条件・結果が変わらないことを検証。
- XLSX日付シリアルの1900/1904系、保存済み数式の値、キャッシュなし数式の拒否、外部リンク非取得を確認。Excel数式は再計算しないため、キャッシュの鮮度は原本側で確認する。
- CSVの数式安全化は先頭アポストロフィをプレビューへ表示。XLSXは元の文字列・型を保持。正当な負数を壊さない。CSVをExcelが再解釈する問題まで保証しない。
- シート切替失敗で旧データと新シート名が混在しない。混合製品・単位・試験方法は判定可能な列と明示マッピングを検査。列名から識別できない任意の業務条件までは推測しないため、利用者の条件確認が必要。
- 既存Mapping/Preset、旧形式RCI、作業プロジェクト、Documentバックアップを再読込。容量不足・不正バックアップでは既存保存を破壊しない。
- サンプルA→復元、A→サンプル→別実データB→取消/退避更新/復元を確認。RCI未保存フラグ、設定、元Lotを維持。

## Local-first・保存・通信

コードの静的確認と、合成識別子入りの実ブラウザ試験を実施しました。[SECURITY_EVIDENCE.md](SECURITY_EVIDENCE.md)に通信先・Worker・保存領域・依存版・公式脆弱性資料を一覧化しています。

- 8機能、実PDF.js、実Tesseractを通した監査では、初期画面取得後の**同一オリジン静的GET10件、リクエスト本文0 bytes**。観測範囲で外部ホスト、製造識別子のURL/本文/ログへの漏出、WebSocket、Service Worker登録は0。
- Feedbackの遷移試験だけは外部URLをモック。実回答を送信せず、opener/referrerなし、固定URLのみ、元作業維持を確認。
- 設定は既存localStorageキー。言語は専用キー。通常データ/RCIはメモリ、Documentは明示保存した内容と任意原本を既存IndexedDBへ保存。サンプル退避もメモリ内のみ。
- 解析用のアップロードAPI、Analytics、外部AI APIは追加していない。既存の任意ブラウザAIツール登録も候補版では停止。
- ブラウザ拡張、OS、企業プロキシ、ホスティングアクセスログ、未知の悪性ファイルを網羅した監査ではありません。新規クリーンコンテキストにService Workerがない条件で監視しました。「通信ゼロ」「完全安全」とは表現しません。

## 性能実測

同一PC・Chromiumでの単回測定です。人工的に操作した時間であり、本人の仕事の所要時間や短縮率ではありません。表の10,000/50,000行は定例品質とバッチの既存上限経路を試した結果で、全形式・全端末の性能保証ではありません。

| ケース | Import→結果 / またはImport | 解析・描画 | XLSX出力と再読込 / またはレポート出力 |
|---|---:|---:|---:|
| D01・5行XLSX | 101.5ms（解析まで） | 左記に含む | 127.0ms |
| D01・5行CSV | 104.7ms（解析まで） | 左記に含む | 161.7ms |
| 定例品質10,000/50,000行 | 実測JSON参照 | 実測JSON参照 | 実測JSON参照 |
| バッチ10,000/50,000行 | 実測JSON参照 | 実測JSON参照 | 実測JSON参照 |

5行の時間は設定・実ダウンロード・保存・再読込を含みPDF生成を除きます。大きいデータは [evidence/performance.json](evidence/performance.json) に入出力サイズと分割時間を記録。通常用デモと分けて試験中に生成し、ホームで自動取得しません。

## OCR・PDF・未確認範囲

D08は架空の2社、各社の設定用/未使用検証用、計4PDF。画像PDFに隠しテキスト層はありません。テキストPDFの3/5行は一致しましたが、画像PDFの2/4行では項目名・証明書番号・測定値の誤読があり、検証用粘度103.2を1032と読みました。正解は変更せず、原本照合と訂正を必要とする結果として記録しています。
未確認の抽出値は解析・確認済み出力に入らず、訂正すると確認状態が解除されることを確認しました。限定した合成例の結果を全帳票のOCR精度として公表しません。

PDFの図・日本語・数値は確認済み。残るP2は管理限界ラベルの近接、一部監査表の折り返し、パレートPDFのフッターだけの最終ページ。本人の実プリンター・PDF保存ダイアログ・Excelアプリでの操作は手動検証対象です。

## 試験中の修正と証拠の扱い

初回の多言語テストは旧CSV警告文への期待で失敗し、新仕様の安全化説明・プレビュー・実CSVの検査へ更新しました。追加テストの小さなCSVは自動見出しが低信頼となるため、テスト内で正しい見出し1行目を指定してから確認します。数値や元文字列の期待値は変更していません。
追加UI試験の1回は閉じた詳細パネル内の選択操作で停止し、実際にパネルを開く操作を追加して再実行しました。直接起動の制限案内も候補版用のローカルHTTP説明へ修正し確認しました。

短い証拠は `docs/release/evidence/`、生のダウンロード・画像・ログは作業ディレクトリの `work/beta-release/evidence/`、統計PDF画像は `work/beta-statistics-browser/`、デモ画像は `work/beta-demo-proof/`。すべて架空データです。本人が記入した結果は別の `local-test-results/` に保存し、Git管理対象にしません。
