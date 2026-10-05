# Manufacturing Toolbox

## [▶ Launch.html — アプリを起動 / Open the app](https://koh2828.github.io/manufacturing-toolbox/Launch.html)

**上のリンクをクリックするだけで利用できます。インストール・ログイン・アクセス申請・コマンド操作は不要です。**

工程能力解析、Individuals / MR・Xbar-R管理図、サイクルタイム、根本原因調査（RCI）、パレート分析、Excel / CSVの整形・出力をブラウザで利用できます。日本語 / English対応。

共有するときは、このリポジトリのURL、または[アプリの直接起動リンク](https://koh2828.github.io/manufacturing-toolbox/Launch.html)を送ってください。GitHubのファイル一覧で `Launch.html` をクリックするとソース表示になるため、**起動にはこのREADMEの上のリンク**を使います。

### オフラインで使う

1. [Launch.htmlのダウンロード元](https://github.com/koh2828/manufacturing-toolbox/blob/main/Launch.html)を開き、**Download raw file**（ダウンロードアイコン）から保存します。
2. 保存した `Launch.html` をダブルクリックし、Microsoft Edge / Google Chromeなどのブラウザで開きます。

必要なプログラムとライブラリは1ファイルに含まれています。インターネット接続もローカルサーバーも不要です。GitHubの **Code → Download ZIP** を使う場合は、ZIPを展開してから `Launch.html` を開いてください。HTMLがテキストエディタに関連付けられているPCでは「プログラムから開く」でブラウザを指定します。

### データの扱い

- 読み込んだExcel / CSV、測定値、製品名、ロット番号、調査内容は端末のブラウザ内で処理します。アプリにアップロードAPI・外部AI・アクセス解析はありません。
- 自動保存するのは言語・列マッピング・プリセット等の設定だけです。製造データ本体は自動保存しません。
- ファイル出力はユーザーの操作で行います。元ファイルを上書きしません。
- オンライン版のページ配信にはGitHubへの通信があります。GitHub Pagesはアクセス時のIPアドレスをセキュリティ目的で記録します（[GitHub公式説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)）。製造データを送る通信とは別です。
- 社内ネットワークで `github.com` / `github.io` やHTMLファイルの実行が制限されている場合、その制限には従ってください。

[詳しい使い方・計算式](USER_GUIDE.ja.md) · [検証記録](VALIDATION.md)

### English

Click **Launch.html — Open the app** above. No installation, sign-in, terminal, or access request is required. To use the app offline, download `Launch.html` and open it in Edge or Chrome. All dependencies are included. Input data stays in your browser; only preferences are stored locally. The GitHub file listing shows HTML source, so use the launch link in this README to run the online app.

### 開発・保守用 / Development only

利用者が以下を実行する必要はありません。アプリのソースは `dist/`、テストは `tests/` にあります。

- 単体テスト: `node --test tests/*.test.cjs`
- 単体HTMLの再生成: `python3 scripts/build-standalone.py`
- GitHub Pages: `main` ブランチの `/ (root)` を配信。`.nojekyll` で静的ファイルをそのまま公開。
- ブラウザテストの実行方法は [詳細ガイド](USER_GUIDE.ja.md) を参照。

SheetJS CE 0.20.3を同梱しています。ライセンスは [Apache-2.0](dist/vendor/LICENSE.sheetjs.txt) で、単体HTML内にも全文を含めています。
