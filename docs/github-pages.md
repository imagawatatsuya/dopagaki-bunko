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
pwsh ./scripts/verify-self-tests.ps1
pwsh ./verify-pages.ps1
pwsh ./publish-pages.ps1
```

Windows の `cmd.exe` やダブルクリックでは、以下の `.bat` ラッパーも使える。

```bat
update-release-stamp.bat
verify-self-tests.bat
verify-pages.bat
publish-pages.bat
```

`publish-pages.ps1` は `origin/main` への push を前提とする。
ローカル repository に remote が無い場合は公開を止める。

同梱の青空文庫検索カタログを更新するときは、[docs/aozora-catalog.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/aozora-catalog.md) のローカル手順に従う。

## 更新反映

`index.html` は起動時に `release.json` を `no-store` で取得し、そこに書かれた
release version の CSS / JS を動的に読み込む。

これにより、ブラウザ全体のキャッシュ削除なしで、新しいアセットへ追従しやすくする。

それでも古い `index.html` が残る場合は、URL に一時的な query を付けて HTML だけ再取得する。

```text
https://imagawatatsuya.github.io/dopagaki-bunko/?reload=20260616
```

この方法は、このサイトの HTML 再取得を促すだけで、他サイトのキャッシュには触れない。

## 初期運用でGitHub Actionsを使わない理由

- 依存を増やさない
- 設定を単純にする
- Codexが余計なworkflowを追加しないようにする
- ルートのindex.htmlだけで公開できるため

## 注意

GitHub Pagesで公開されるものはインターネット上から見える。
個人データ、秘密情報、青空文庫から取り込んだ個人用データはリポジトリに入れない。

ユーザーの読書データはブラウザのIndexedDBに保存する。
