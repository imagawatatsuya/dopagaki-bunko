# AGENTS.md

このファイルは、Codexなどのコーディングエージェントに必ず読ませる作業ルールです。

## 最重要方針

このプロジェクトは、サプライチェーン攻撃リスクを下げるため、外部依存を極力使わない。

## 禁止事項

Codexは、明示的な許可なしに以下を行ってはいけない。

- npm install
- package.jsonにdependenciesを追加
- 外部CDNのscript/linkを追加
- React / Vue / Svelte / Next.js / Vite / Webpack / Babelを導入
- JSZip / Dexie / Lodashなどを導入
- Google Fontsなど外部フォント配信を導入
- GitHub Actionsの外部サードパーティActionを追加
- タイムライン上にいいね、しおり、引用などの操作アイコンを出す
- 通常投稿、返信、リポスト、通知、コメント欄を実装する

## 許可される技術

- HTML
- CSS
- Vanilla JavaScript
- ES Modules
- File API
- TextDecoder
- IndexedDB
- localStorage
- Blob
- URL.createObjectURL
- DecompressionStream
- ruby / rt
- CSS text-emphasis

## 起動方法

```bash
python -m http.server 8000
```

ビルド工程は不要。

## GitHub Pages方針

- `main` ブランチのルート `/` を公開元にする
- `index.html` をルートに置く
- ビルドツールを使わない
- GitHub Actionsは初期では使わない

## GitHub Pages公開運用

- このリポジトリでユーザーが `やれ`、`実装せよ`、`改修せよ` と指示した場合は、実装とローカル検証だけで止めず、公開までを完了条件とする
- 公開はリポジトリ直下の `publish-pages.bat` を使う。このスクリプトがリリース番号更新、自己テスト、Pages事前検証、コミット、`origin/main` へのpushをまとめて行う
- ユーザーが `公開不要`、`ローカルまで`、`保留` と明示した場合は `publish-pages.bat` を実行しない
- 原因調査、診断、設計、レビューだけを求められた場合は、変更や公開を行わない
- `verify-pages.ps1` の成功は `Pages事前検証成功` と表現する。これは公開成功を意味しない
- `Pages公開成功` と報告してよいのは、`publish-pages.bat` が正常終了し、対象コミットが `origin/main` へpushされたことを確認した場合だけ
- 作業完了時は、実装、自己テスト、Pages事前検証、公開、push先コミットを区別して報告する

## 実装姿勢

- 一度に大規模変更しない
- 1タスク1目的で実装する
- 既存仕様に反するUIを追加しない
- 変更したら `CHANGELOG.md` に要点を書く
- 実装前に関連docsを読む
- 仕様に迷ったら、勝手にSNS化せず、読書UIを優先する

## テスト方針

依存を増やさないため、初期ではブラウザ上の手動テストと小さな自己完結JSテストを優先する。

最低限確認すること：

- ローカル起動できる
- タイムラインが表示される
- 断片個別ページへ遷移できる
- IndexedDBに保存できる
- エクスポート/インポートできる
- 青空文庫ルビがruby表示になる
- 圏点がtext-emphasisで表示される
- ZIP取り込みでtxtを抽出できる
