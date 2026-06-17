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
pwsh ./scripts/verify-self-tests.ps1
pwsh ./verify-pages.ps1
pwsh ./publish-pages.ps1
```

Windows の `cmd.exe` やダブルクリック向けに、同名の `.bat` ラッパーも置いてあります。

```bat
update-release-stamp.bat
verify-self-tests.bat
verify-pages.bat
publish-pages.bat
```

- `update-release-stamp.ps1`
  `index.html` の fallback release version、`src/*.js` のローカル参照、`release.json` を更新します。
- `verify-pages.ps1`
  GitHub Pages 公開に必要なファイル、相対参照、`manifest.webmanifest`、`main` ブランチ、`origin` 設定を検証します。
- `verify-self-tests.ps1`
  ルビ、圏点、外字、見出し、ZIP、JSON import/export、しおり正規化まわりの自己完結JSテストを実行します。
- `publish-pages.ps1`
  stamp、自己完結JSテスト、Pages verify、commit、`origin/main` への push をまとめて実行します。

`publish-pages.ps1` / `publish-pages.bat` の主なオプション:

- `-SkipStamp`
  すでに版番号更新済みなら stamp を飛ばします。
- `-SkipVerify`
  verify を飛ばします。
- `-CommitMessage "..."`
  commit message を明示します。

`origin` が未設定の clone では publish は失敗します。先に GitHub リポジトリの remote を追加してください。

## 更新反映

このアプリは起動時に `release.json` を取りに行き、最新 release version の CSS / JS を読み込みます。
通常はブラウザ全体のキャッシュ削除は不要です。

それでも更新が見えないときは、サイトURLの末尾へ一時的な query を付けて `index.html` だけ新規取得してください。

```text
https://imagawatatsuya.github.io/dopagaki-bunko/?reload=20260616
```

これはこのサイトの HTML 再取得を促すだけで、他サイトのキャッシュは消しません。

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

バックアップ対象は `works`, `fragments`, `likes`, `bookmarks`, `readingStates`, `settings` です。

`bookmarks` は作品ごとに常に1件だけ保持される最新しおりです。気になった断片へふせんを複数残す用途は `likes` を使います。

## 青空文庫 ZIP 取り込み

追加画面 `#/search` で、同梱の青空文庫作品一覧から検索して取り込めます。

- 起動時に同梱の作品一覧JSONを読み込む
- `一覧を再読込` で同梱の作品一覧JSONを読み直す
- 作品名または著者名で検索
- 検索結果の項目を開いて `図書カード` へ進み、ZIP保存後に下の手動取り込みを使う

手動ZIP取り込みも引き続き使えます。

- ZIP をドラッグ＆ドロップ、またはファイル選択
- ZIP 内 txt を抽出
- Shift_JIS 優先でデコードし、必要なら UTF-8 に fallback
- クリーニング、ルビ・圏点変換、断片化
- プレビュー確認後に作品アカウントとして保存

現状の ZIP 対応は最小実装です。

- 対応: store, deflate, 単一 txt
- 非対応: ZIP64, パスワード付き ZIP, 分割 ZIP, 複数作品入り ZIP, 画像入り ZIP

## 同梱カタログ更新

検索で使う同梱カタログ `data/aozora-catalog.json` は、ブラウザ実行時に青空文庫へ直接取りにいかず、ローカル更新で差し替えます。

まず現在の更新日と件数を確認します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -StatusOnly
```

次に、手元へ保存した `list_person_all_extended_utf8.zip` を使って差分だけ確認します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip
```

問題なければ `-Write` 付きで更新します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip -Write
```

Windows の `cmd.exe` やダブルクリックでは `update-aozora-catalog.bat` も使えます。

詳細手順は [docs/aozora-catalog.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/aozora-catalog.md) を参照してください。
