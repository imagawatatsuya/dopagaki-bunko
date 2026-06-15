# どぱ書き文庫

青空文庫の作品を短い断片に分割し、縦スクロール読書で x.com 依存を置き換えるための静的 Web アプリです。

## ローカル起動

ビルドは不要です。リポジトリ直下で次を実行します。

```bash
python -m http.server 8000
```

ブラウザで `http://127.0.0.1:8000/` を開いてください。

同一Wi-Fi上のスマホ確認では、PC側で次を使うと分かりやすいです。

```powershell
python -m http.server 8000 --bind 0.0.0.0
```

## 開発→公開の自動化

公開前のローカル自動化は PowerShell スクリプトで行います。

```powershell
pwsh ./scripts/update-release-stamp.ps1
pwsh ./verify-pages.ps1
pwsh ./publish-pages.ps1
```

- `update-release-stamp.ps1`
  `index.html` と `src/*.js` のローカル参照へ release version を付け、`release.json` を更新します。
- `verify-pages.ps1`
  GitHub Pages 公開に必要なファイル、相対参照、`manifest.webmanifest`、`main` ブランチ、`origin` 設定を検証します。
- `publish-pages.ps1`
  stamp、verify、commit、`origin/main` への push をまとめて実行します。

`origin` が未設定の clone では publish は失敗します。先に GitHub リポジトリの remote を追加してください。

## GitHub Pages 公開

このリポジトリは `main` ブランチのルート `/` をそのまま公開元にします。

1. GitHub の `Settings` を開く
2. `Pages` を開く
3. `Build and deployment` で `Deploy from a branch` を選ぶ
4. Branch に `main`、Folder に `/ (root)` を選ぶ
5. 保存する

初回設定後の更新は、ローカルで次を実行すれば足ります。

```powershell
pwsh ./publish-pages.ps1
```

アプリはハッシュルーティングを使うため、個別ページ遷移は `#/fragment/...` で維持されます。`404.html` はルートへの復帰用です。

## データバックアップ

設定画面 `#/settings` から JSON バックアップを扱えます。

- `JSONを書き出す` で全ストアを JSON としてダウンロードできます
- `JSONを選ぶ` でバックアップを読み込めます
- 読み込み後に `上書きする` か `追加する` かを選べます

バックアップ対象は `works`, `fragments`, `likes`, `bookmarks`, `quotes`, `settings` です。

`bookmarks` は作品ごとに常に1件だけ保持される最新しおりです。気になった断片を複数残す用途は `likes` を使います。

## 青空文庫 ZIP 取り込み

検索画面 `#/search` で青空文庫 ZIP を取り込めます。

- ZIP をドラッグ＆ドロップ、またはファイル選択
- ZIP 内 txt を抽出
- Shift_JIS 優先でデコードし、必要なら UTF-8 に fallback
- クリーニング、ルビ・圏点変換、断片化
- プレビュー確認後に作品アカウントとして保存

現状の ZIP 対応は最小実装です。

- 対応: store, deflate, 単一 txt
- 非対応: ZIP64, パスワード付き ZIP, 分割 ZIP, 複数作品入り ZIP, 画像入り ZIP
