# 無料β版・本人確認用候補の状態

対象版: **v0.8.1-beta.1** / 作業ブランチ: `release/free-beta-owner-test`。
基点: `ea808cf830cb70d84ec2fc72884c75b15ccf9ac4`（調査時のmain）。対象の正確なCommitは `git rev-parse HEAD` とPRの最終Commitで確認してください。

## 現在の状態

- **READY_FOR_OWNER_TEST**: 単体305件、ブラウザ547チェック、実PDF/OCR4ケースの自動検証とデモ・マニュアルがそろい、本人が手動確認できます。
- **RELEASE_BLOCKED**: 外部フォーム未設定・実受信未確認、本人の手動検証と対象Commitへの明示的な公開承認が未実施。
- `APPROVED_FOR_PUBLIC_BETA` ではありません。本番へのマージ・デプロイ・告知はこの依頼で行いません。

## 機能棚卸しと候補の公開区分

「動作確認済み」は合成データを使った開発者テストの範囲です。本人の検証・全実帳票への適合は含みません。

| 機能 | 実装状態 | 入力 | 出力 | 根拠 | 既知の制限 | 区分 |
|---|---|---|---|---|---|---|
| 工程能力 / XmR / Xbar-R | 動作確認済み | XLSX/XLS/CSV/TSV、貼り付け | XLSX、印刷PDF、RCI引継ぎ | statistics、chart-view、lot-axis、release-demo | 群の妥当性・データの独立性は利用者が確認。描画上限と集計範囲は別 | PUBLIC_BETA |
| 定例品質分析 | 動作確認済み | 複数Excel/CSV、縦/横持ち、既存mtbプロジェクト | 比較XLSX、印刷PDF、工程能力/RCI引継ぎ | recurring、workflow、release-demo | 同じ単位・規格・測定条件だけ比較。各期間の管理限界を再推定 | PUBLIC_BETA |
| サイクルタイム | 動作確認済み | 製品・Lot・Start/End、任意設備列 | XLSX、印刷PDF | cycle、multilingual、release-demo | 空き時間の原因は推定しない。5未満非表示、5–19参考値 | PUBLIC_BETA |
| バッチ工程 | 動作確認済み | バッチ・工程・開始/終了、設備等 | XLSX、印刷PDF、パレート引継ぎ | batch、workflow、release-demo | 工程合計/区間和集合/実経過を区別。IQRは選択時だけ比較 | PUBLIC_BETA |
| パレート | 動作確認済み | カテゴリと非負数値列 | XLSX、印刷PDF、RCI引継ぎ | core、browser-acceptance、release-demo | 合計0では割合を算出不可 | PUBLIC_BETA |
| RCI | 動作確認済み | 手入力、既存rci/json、時系列表 | rci/json、XLSX、印刷PDF | core、browser-acceptance、multilingual | 原因の事実性や対策の有効性を自動判定しない | PUBLIC_BETA |
| Clean & Export | 動作確認済み | 既存共通ImporterのExcel/CSV等 | cleaned.xlsx / cleaned.csv | clean-i18n、multilingual、release-security | 複数行見出しの意味的結合・欠損補完はしない。CSVに型情報なし | PUBLIC_BETA |
| Document Intelligence | 限定条件で動作確認済み | テキストPDF、画像PDF、PNG/JPEG、ローカルテンプレート | 確認済み表、XLSX/CSV、印刷PDF、バックアップ | document suites、release-security、D08 | OCR誤認識あり。全件原本確認必須、未確認は解析禁止。file://ではOCR不可 | EXPERIMENTAL |
| Importer / Preset / Mapping / 日英 | 動作確認済み | 既存共通経路 | ブラウザ内の設定、上記各ツールへ | import-settings、file-reader、multilingual、workflow | あいまいな日付は自動解釈しない。独立した新Importerは作成しない | 共通基盤 |
| Feedback & Contact | 導線検証済み・外部未設定 | 本人が外部フォームで任意入力 | 外部サービスの回答（未設定） | release-uiのモック遷移 | 本番URL・受信確認は本人待ち | 公開前設定必須 |
| ブラウザAI操作ブリッジ | 既存コードを保持、起動登録を停止 | — | — | product.js / security evidence | 今回の非AI対象範囲に合わせて無効化 | EXCLUDED |

新しい分析手法、OCRエンジン、AI、ログイン、課金、DBは追加しません。EXPERIMENTALは確認操作を省略してよい意味ではありません。

## 修正した問題

| 優先度 | 修正前 | 候補の動作 |
|---|---|---|
| P0 | CSVに数式として解釈される文字列をそのまま出力 | 共通CSV出力で文字列を安全化。プレビューと注意文にアポストロフィを明示、負の数値とXLSXの型を保持 |
| P0 | 工程能力の混合製品/方法、定例分析の未指定条件をまとめて計算可能 | 認識された条件列・明示製品列の混在を拒否。定例分析は該当集計と異なる方法の期間比較を停止 |
| P1 | キャッシュのないExcel数式が空欄扱いになり得る | セル座標と再計算・保存手順を表示し拒否。新しい計算エンジンは追加しない |
| P1 | 無効なシート選択後、名前と旧データが不一致 | 読み込み成功後にだけシート・表を切り替え、失敗時は旧状態へ戻す |
| P1 | サンプルが読み込み済み作業を置換 | メモリ内退避と「元の作業に戻る」。別の実データ投入後の復元・退避更新は確認を要求 |
| P1 | 解析・OCR作業が未保存のまま離脱可能 | 読み込み済み作業と処理中OCRのタブ離脱警告。端末内保存は長期バックアップの代わりではない |
| P1 | 展開後サイズの大きいExcelを解析し得る | ZIP構造と宣言展開サイズを事前検査。完全な悪性ファイル検知ではない |
| P1 | バッチの合計0パレートに割合0と表示 | 割合未定義の説明、割合セルは空欄、無意味な図を省略 |
| P2 | 有限な極大値2個の中央値がInfinityになる | 加算overflow時だけ安定した平均を使用。通常値の定義は変更なし |

残すP2: 近接した管理限界・規格限界のラベル重なり、一部PDFの余白ページ、監査表の長文折り返し。計算値や原データの欠落ではなく、手動操作性レビューで優先度を判断します。

## 構成・再利用

ビルド不要のHTML/JavaScript。`dist/` がソース、`Launch.html` が既存単体入口。`scripts/build-standalone.py` がCSS/JSとハッシュCSPをまとめます。ルートindexは相対Launchへ移動。OCR資材は同一オリジンの `dist/vendor/document/` から必要時取得します。

Importerは `core.js / import-core.js / file-reader.js`、保存設定は `product.js / workflow-core.js`、計算は既存各 `*-core.js`、出力は `reports.js / clean-core.js`、翻訳は `locales/ja.js / en.js` を再利用しています。Documentの保存は既存 `document-store.js` のIndexedDBです。詳細は [SECURITY_EVIDENCE.md](SECURITY_EVIDENCE.md)。前依頼のロット順管理図・期間バー・定例/バッチ・Document機能を保持しました。

## 本番保護の確認（2026-10-15、設定変更なし）

- 作業開始時clean、remoteは指定リポジトリと一致。既定ブランチmainと基点Commitをfetchで確認。
- 現在のmainの `.github` にワークフロー定義なし。push / pull_request / workflow_run / workflow_dispatchの独自処理なし。
- GitHubのPages設定を本人の接続済み画面で確認: **Deploy from a branch / main / root**。Actions一覧は組込み `pages-build-deployment` だけ。
- 最終本番run: `38556122817`、2026-10-14 20:22 JST。公開先は既存 `https://koh2828.github.io/manufacturing-toolbox/`。
- Webhooks一覧に登録なし、GitHub Appsは「There aren't any GitHub Apps installed on this repository.」。自動マージは未選択。既存PRはopen/closedとも0。
- 確認できた連携経路では作業ブランチPush/PR作成はPagesを更新しません。任意の第三者による公開リポジトリのポーリングまで保証するものではありません。
- ブランチPushとDraft PRだけを許可。mainへのPush・マージ・公開Release・タグ・Actionsの手動起動は行わない。

[GitHub Pages公式制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)は、商用SaaS等の無料ホスティング利用に制約を設けています。「無料βだから適合」とは判断していません。本人が運営目的と現行条件を確認してください。移行が必要なら `Launch.html / index.html / dist/` とライセンスを同じ相対配置で静的ホストへ移し、base path/CSP/OCRを再検証する手順を使用できます。契約・DNS変更・実移行は未実施です。

## 本人に残ること・再開時の手順

1. [手動マニュアル](MANUAL_TEST_GUIDE_JA.md)の業務体験3件から開始。結果は `local-test-results/` に保存。
2. [Feedback設定手順](FEEDBACK_SETUP.md)に沿って本人がフォーム設定・送信・受信を確認。送信前の注意文、運営者連絡先、保存期間を確定。
3. 現行ホストの条件を確認し、未確認の実帳票・社内ブラウザで主要業務を検証。
4. 問題修正後は影響する自動・手動検証を再実施。**Commit IDを指定して本人が明示的に承認するまで一般公開しない。**
5. 承認後にだけ、設定を再確認しPRを通常マージ→Pagesのmain公開を確認。戻す場合は問題Commitのrevert PRを作り、本人確認後に通常マージ。force push、保存DB削除、履歴破壊は不要。

自動検証の現行結果は [VALIDATION.md](VALIDATION.md)。本人の全チェックは初期値Not Testedで、CodexがPassへ変更しません。
