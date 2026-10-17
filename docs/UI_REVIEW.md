# Manufacturing Tools｜表示デザインの本人レビュー

2026-10-17 / **READY_FOR_OWNER_UI_REVIEW — 本番未反映・承認待ち**

対象ブランチは `feature/monochrome-design-and-dark-mode`。基点は無料β候補の `b5f584c86267a63e3e449718b4a28294e540c2e5`（`release/free-beta-owner-test` / Draft PR #1）。今回の変更はこの候補に積み重ねています。本番mainは `ea808cf830cb70d84ec2fc72884c75b15ccf9ac4` のままです。

検証対象 `Launch.html` のSHA-256：
`64032f53a6f1d1c7b7c1ea9897edba3aeddac806c2335e669d9f2269b65c552e`

## 変更内容

- ヘッダー・サイドバー・ホーム・フッター・ブラウザタイトル・メタ説明・日英ヘルプ・レポートの表示名を **Manufacturing Tools** に変更。日本語名は **製造の道具箱**。
- 日本語ホームは指定コピーを完全一致で表示。英語は既存の `locales/en.js`、日本語は `locales/ja.js` で管理。β表記と注意文は紹介コピーから分離しました。
- 白・黒・グレーを中心に背景、文字、入力欄、境界線、選択、フォーカス、グラフの共通CSS変数を整理。OS標準フォントと桁が揃う数値を使用。外部フォント・装飾画像は追加していません。
- ホームの紹介と4つの主要ツールを整理し、分析画面は既存の情報密度・全幅管理図・データ操作の配置を維持。390px幅でもページ全体には横スクロールを出さず、広い表は表の中でスクロールします。
- グラフは測定系列、CL実線、UCL/LCL破線、USL/LSL点線と直接ラベルを使い分けます。異常点は補助色に加えてサイズ・輪郭で区別。パレート累積線とバッチ工程も線種・マーカー・ラベルを使用します。
- レポートはダーク中でも白背景。PDF・画像原本は反転しません。

## テーマ設定

ヘッダーの「表示 / Appearance」で **ライト / ダーク / システムに合わせる** を選べます。未設定時はSystem、明示設定時はその選択を優先します。SystemのときだけOS変更に追従します。

専用キー `manufacturing-toolbox.theme.v1` に選択値だけを保存します。ページ移動・日英切替・再読込でも維持し、保存拒否時もそのセッションで切り替えられます。製造データや既存の保存キーは変更しません。

`dist/theme.js` が初期スタイルより先に選択を復元し、ルート要素の属性とCSS変数だけを切り替えます。`render()`・再解析・ページ再読込を呼ばないため、ファイル、マッピング、規格値、期間、拡大チャート、解析結果、RCI編集中内容、開いたダイアログの入力を保持します。

単体HTMLの生成処理もこの順番を保ち、各スクリプトのCSPハッシュを再計算します。スクリプトの `unsafe-inline` 等は追加していません。

## 対応画面

ホーム、工程能力と管理図、定例品質分析、サイクルタイム、バッチ工程分析、パレート、RCI、ImporterとClean & Export、Document Intelligenceの周辺UI、Feedback、共通ダイアログ・ツールチップ・通知・レポート。

今回の対象内に未対応画面はありません。OSが表示するファイル選択・印刷ダイアログと外部フォームの配色は変更対象外です。Document Intelligenceは従来どおりEXPERIMENTAL、ブラウザAIブリッジはEXCLUDED。Feedbackの外部フォームは未設定のままで、[設定手順](release/FEEDBACK_SETUP.md)を維持しています。

## 再利用と互換性

共通Importer、Cleaner、Preset/Mapping、各分析core、翻訳、レポートのデータ構成、PDF/OCRエンジン、IndexedDBをそのまま再利用しました。新しい統計・AI・ログイン・課金機能は追加していません。

新規ファイルは `dist/theme.js`、`dist/chart-theme.css` とテーマテスト2本。主な変更は `dist/style.css`、ブランド表示用の `index.html / product.js / release-ui.js / i18n.js / locales`、SVGの表示用クラス、レポートの表示名、単体HTMLビルドです。`Launch.html` は生成物です。

既存URL、`Launch.html` 名称、ルート、保存形式、既存localStorage/IndexedDBキー、計算式、データの解釈は維持しています。解析対象ファイルを外部へ送信する処理・Analyticsは追加していません。ネットワーク検証では新しい外部通信先・製造データの送信なし。OCRで必要なプログラムは従来どおり同一オリジンから取得します。

## 検証

Chrome **155.0.8059.80**、macOS。デスクトップ **1440×1000**、モバイル **390×844** のビューポート。既存合成デモのみを使用しています。

| 検証 | 結果 |
|---|---|
| 全単体テスト（テーマ10件を含む） | 315件合格 |
| 既存13ブラウザスイート | 547チェック合格 |
| 実PDF/OCR | 4ケース合格。既知の誤読は残り、未確認の解析・出力を防止 |
| テーマ・日英・10ルート・2画面幅・状態保持・出力 | 303チェック合格。実HTTP応答と配布ファイルのハッシュも一致 |
| 原本画素不変・ダークからの報告書の追加検証 | 11チェック合格。PDF4ページを画像化して確認 |
| 統計・Importer等の差分レビュー | 計算・解釈・保存形式の変更なし |

全5万件の定例品質/バッチ工程、ExcelとClean & Export、PDF、貼り付け、Lot文字列、RCI、グラフの期間・拡大表示を確認しました。主要回帰の後に加えた最終調整は見出しの折返し、文字・系列の明度、反転したCpkカードのヘルプ記号の色で、最終版で単体・テーマ表示検証を再実行しています。

通常文字の代表箇所（補助文、入力、カード、テーマ選択、ヘルプ記号、ツールチップ、レポート）はコントラスト最小5.68:1（目標4.5:1以上）を測定。Tabの可視フォーカス、選択の線/太字、reduced-motionも確認しました。これは全画素のアクセシビリティ認証ではありません。

既存の軽微な表示課題：RCIタイムラインの日時入力で時刻部分が狭くなる場合があります。今回のテーマ変更とは独立した改善候補として残しています。

未実施：Safari/WebKit（未導入）、Firefox、Windows実機のEdge、実スマートフォン、社内PC、未知の実帳票、本人による見た目の最終評価。Chromiumの390px検証は実機検証の代わりではありません。OCRの認識精度・元の公開前条件は今回改善対象外で、[既存の残条件](release/STATUS.md)を維持します。

## レビュー写真と証拠

実アプリの写真をローカルの `artifacts/ui-review/` に保存しています（生成物のためGit管理外）。`theme-summary.json` に撮影ブランチ、基点Commit、作業版の差分一覧、Launchハッシュ、画面幅、言語、テーマ、撮影時刻を記録しています。

- `01-home-ja-*-desktop.png`：日本語ホームのライト・ダーク
- `02-home-en-*-desktop.png`：英語ホームのライト・ダーク
- `03-capability-*-desktop.png`：合成ExcelのIndividuals/MR/ヒストグラム
- `04-capability-tooltip-dark.png` / `05-paste-modal-dark.png` / `06-rci-draft-dark.png`
- `07-recurring-results-*-desktop.png`：定例品質の比較表・結果
- `08-home-ja-*-mobile.png`：390pxホームのライト・ダーク
- 原本ビューアのライト・ダーク写真と `10-feedback-dark.png`
- `capability-from-dark.pdf / .xlsx`、`cleaned-from-dark.xlsx`

本人向けZIPにも写真・検証概要を同梱します。テストログは作業フォルダの `work/ui-review/evidence/`。元データは既存の合成デモで、実製造データは含みません。

## 起動とレビュー順

**通常の分析はコマンド不要**：このブランチのフォルダにある `Launch.html` をChrome / Edgeで開いてください。GitHubのファイル一覧はHTMLソースを表示するため、ダウンロードしたファイルをブラウザで開きます。READMEのGitHub Pagesリンクは旧本番版です。

Document Intelligenceも含めて確認する場合だけ、リポジトリのフォルダから静的サーバーを起動します。

```sh
python3 -m http.server 8776 --bind 127.0.0.1
```

確認用URL：`http://127.0.0.1:8776/Launch.html#home`。終了時はそのターミナルでCtrl+C。ローカル検証では本番相当の `/manufacturing-toolbox/` 配下でも成功しています。テスト用サーバーは作業完了時に停止するため、後日このコマンドで再開してください。

開発時の再生成とテスト：

```sh
python3 scripts/build-standalone.py
node --test tests/*.test.cjs
TOOLBOX_URL=http://127.0.0.1:8776/Launch.html node tests/theme-browser.cjs
```

ブラウザテストは既存のPlaywrightとChromeを使用します。実行環境によって `TOOLBOX_PLAYWRIGHT` と `TOOLBOX_TEST_OUTPUT` を指定できます。

最初の確認：**ホーム（ライト）→ダーク→品質サンプル→管理図・規格線・ヒストグラム→再切替して結果と拡大表示の維持→RCIの入力→390px幅→気になる箇所を記録**。特に文字の読みやすさ、入力境界、分析画面の密度、グラフの線種、社内PCでのフォントを見てください。

## Gitと本番保護

2026-10-17にAPIで再確認：Pagesはmain/rootからのbranch deploy、独自ワークフローなし（組込みpages-build-deploymentのみ）、Webhook 0件。本番runは `38556122817`、最新deploymentは `7063935960`、main Commitは上記のままです。

作業ブランチのPushとDraft PRだけを使用します。PRのbaseは先行する無料β候補ブランチです。先行PR #1と本UI候補は、本人が対象Commitを確認・承認するまでmainへマージしません。mainへのPush、force push、マージ、デプロイ、DNS・公開URL変更は行っていません。
