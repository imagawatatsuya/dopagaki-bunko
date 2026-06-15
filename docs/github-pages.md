# GitHub Pages運用方針

## 基本

このアプリはビルド不要の静的Webアプリとして運用する。

GitHub Pagesの公開元は以下にする。

```text
Branch: main
Folder: / root
```

GitHub公式ドキュメントでは、GitHub Pagesは特定ブランチへのpushまたはGitHub Actions workflowで公開でき、ビルド制御が不要な場合はブランチとフォルダを公開元にできる。

## 開発→公開の自動化

初期運用では GitHub Actions を使わず、ローカルの PowerShell スクリプトで以下をまとめる。

1. release version stamp を付ける
2. GitHub Pages 公開前検証を行う
3. `main` へ commit/push する

使用スクリプト：

```powershell
pwsh ./scripts/update-release-stamp.ps1
pwsh ./verify-pages.ps1
pwsh ./publish-pages.ps1
```

`publish-pages.ps1` は `origin/main` への push を前提とする。
ローカル repository に remote が無い場合は公開を止める。

## 初期運用でGitHub Actionsを使わない理由

- 依存を増やさない
- 設定を単純にする
- Codexが余計なworkflowを追加しないようにする
- ルートのindex.htmlだけで公開できるため

## 注意

GitHub Pagesで公開されるものはインターネット上から見える。
個人データ、秘密情報、青空文庫から取り込んだ個人用データはリポジトリに入れない。

ユーザーの読書データはブラウザのIndexedDBに保存する。
