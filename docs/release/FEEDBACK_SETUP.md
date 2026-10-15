# ご意見・お問い合わせの設定と運用

対象: v0.8.1-beta.1。2026-10-15、本人より「未設定。設定手順を用意して進める」と回答。
**アプリ導線は実装済み。URL設定・実送信・受信確認は未実施。一般公開の前提条件です。**

## 設定するもの

第一候補はTally。一つの二言語フォームでも、日英で別のフォームでも構いません。
アカウント作成・規約への同意・公開・運用責任者の決定は本人が行います。有料契約は不要な構成にしてください。
[公式のフォーム作成手順](https://tally.so/help/create-a-form)を参照し、下記の文面と4項目を作成します。添付、企業名、氏名、決済、AI、外部連携、hidden fields、URLによる事前入力、リダイレクトによる回答転送は追加しません。

| 項目 | 形式 | 必須 | 選択肢・用途 |
|---|---|---|---|
| 種類 / Type | 単一選択 | はい | 不具合 / Bug、操作性の改善 / Usability improvement、機能要望 / Feature request、一般のお問い合わせ / General inquiry、その他 / Other |
| 内容 / Message | 長文 | はい | 下記案内を表示 |
| 関連ツール / Related tool | 選択 | いいえ | 工程能力解析、定例品質分析、サイクルタイム、バッチ分析、パレート、RCI、Clean & Export、Document Intelligence、その他 |
| 返信用メールアドレス / Reply email | メール | いいえ | 返信だけに使用。営業配信への同意を兼ねない |

## フォームへ貼り付ける文面

### 日本語

**Manufacturing Toolbox — ご意見・お問い合わせ**

何をしようとして、どこで困ったかを教えてください。機能要望の場合は、現在どのように作業しているかも参考になります。

機密情報、製品名、ロット番号、設備名、検査値、ファイル内容は記入しないでください。添付ファイルは受け付けません。

このフォームに任意に入力した内容は、外部フォームサービスで処理され、運営者が不具合の調査、改善の検討、お問い合わせへの返信に使用します。解析対象のファイルやアプリ内の解析結果は自動添付されません。返信用メールアドレスは任意で、返信目的にのみ使用します。

公開前に、運営者名・有効な連絡先・保存期間・削除依頼の方法を本人が確定し、ここに追記してください。**未確定のままこの案内を公開しないでください。**

### English

**Manufacturing Toolbox — Feedback & Contact**

Tell us what you were trying to do and where you got stuck. For feature requests, it also helps to understand how you currently complete the task.

Do not include confidential information, product names, lot numbers, equipment names, inspection values or file contents. Attachments are not accepted.

Information you choose to enter in this form is processed by an external form service. The operator uses it to investigate issues, consider improvements and reply to inquiries. Your analysis files and app results are not attached automatically. A reply email is optional and is used only to reply.

Before publishing, the owner must add the operator's identity, a valid contact, the retention period and a deletion-request process. **This draft is not a completed public privacy notice.**

## 公開URLをアプリへ設定

1. フォームのPreviewで日英の文面・必須項目・任意メールを確認。ファイルアップロード、回答の自動外部連携、部分回答保存、Analytics追加は使わない。
2. 本人がフォームをPublishし、HTTPSの共有URLを取得。実際のTally画面の設定を確認する。[公式設定説明](https://tally.so/help/form-settings)
3. `dist/release-config.js` の `FEEDBACK_FORM_URL_JA` / `FEEDBACK_FORM_URL_EN` にURLを**文字列定数として**設定。同一フォームなら同一URL。`?`クエリ・`#`フラグメント・認証情報・非標準ポートのないURLを使う。
4. 現在の許可ホストは `tally.so`。別サービスにする場合、本人が送信先と扱いを確認したうえで `approvedFeedbackHosts` を変更し、リンク検証テストも追加する。URLをlocalStorageや解析状態から生成しない。
5. `python3 scripts/build-standalone.py` でLaunch.htmlを更新。単体テストとFeedbackのブラウザテストを再実行する。自動テストは遷移先をモックし、実回答を送らない。
6. 日英で「ご意見・お問い合わせ / Feedback & Contact」→説明→外部フォームをクリック。新しいタブ、元の解析状態の保持、URLにファイル名やメール等がないことを確認する。

リンクは `target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"`。フォーム用のscript、iframe、prefetch、preconnect、独自APIはありません。未設定・不正URLでは説明だけを表示し、送信リンクを出しません。外部フォームの入力検証や二重送信制御は提供者側の機能です。

## 実送信と受信の確認（本人）

1. 本人の設定済みフォームで、機密情報を含まない「TEST — owner verification — 日時」の回答を1件だけ送信する。必要なら別言語でも1件。
2. フォームのSubmissionsでその回答と時刻を確認。返信メールの入力を試すなら本人が使えるアドレスだけを任意入力する。
3. `local-test-results/` に送信日時、受信確認日時、言語、対象Commitを記録。スクリーンショットに他人の回答が入らないようにする。
4. 「導線テスト済み」「送信済み」「受信確認済み」を別々に記録。受信画面が見られなければ受信確認待ちのままにする。

## 回答の管理

- 回答確認: 本人がTallyの対象フォーム→Submissionsを開く。
- Export: SubmissionsのDownload CSVから必要な回答を取得し、`local-test-results/` または管理された保管先へ保存。Gitへ追加しない。[公式FAQ](https://tally.so/help/faq)
- 削除: Submissionsで対象を選び削除する。TallyのTrashには復元可能期間があり、公式説明では通常90日。ごみ箱の完全削除と通常削除を区別する。[削除・復元の公式説明](https://tally.so/help/how-to-delete-and-recover-form-data)
- 保存期間は本人が決定し、定期的に回答・Export先・ごみ箱を確認する。自動保存期間機能のために有料プランへ変更しない。
- 本人が確定すべき事項: 運営者と連絡先、利用目的、回答を読める担当者、保存期間、削除依頼先、提供者の現行規約・プライバシー条件と社内方針。認証取得や法令適合を推測して表示しない。

改善の整理は `demo-data/Feedback_Tracking_Template.csv` をローカル用にコピーして使用します。「困った業務・頻度・回避策・影響・対応方針」を記録し、返信メールや原文の公開転載は不要です。
