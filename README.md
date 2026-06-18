# ドパガキ文庫

青空文庫の作品を短い断片に分け、スマホでも縦スクロールで静かに読めるようにした、ビルド不要の静的 Web アプリです。

正式名称は `ドパガキ文庫` です。

## できること

- `ホーム` で追加済み作品や読書イベントを縦スクロールで読む
- `本棚` で `読書中 / 未読 / 読了` ごとに作品を管理する
- `追加` で青空文庫の同梱カタログ検索、または手元の ZIP 取り込みを使う
- `設定` で `最新状態に更新`、JSON バックアップ、JSON 復元、読書の続き読み込み設定を行う

## 読書データの考え方

- `しおり`: 作品ごとに常に1件だけ残る再開位置
- `ふせん`: 気になった断片を複数残すための印。短いメモも付けられる
- `読書状態`: `未読 / 読書中 / 読了` の作品単位の状態

JSON バックアップに含まれるのは `works`, `fragments`, `likes`, `bookmarks`, `readingStates`, `settings` です。検索用の `aozoraCatalog` キャッシュは含めません。

## ローカル起動

ビルドは不要です。リポジトリ直下で次を実行します。

```bash
python -m http.server 8000
```

ブラウザで `http://127.0.0.1:8000/` を開いてください。

同一 Wi-Fi 上のスマホ確認では、PC 側で次を使うと分かりやすいです。

```powershell
python -m http.server 8000 --bind 0.0.0.0
```

## 追加と取り込み

`#/search` では、同梱の青空文庫カタログとローカル本棚の両方を検索できます。

- `青空文庫 / 本棚` の切り替えで検索対象を変えられる
- 青空文庫検索では作品名または著者名で探せる
- 検索結果から `図書カード` を開き、保存した ZIP を `ZIP取り込み` から読み込む
- 手動 ZIP 取り込みでは `.zip` 内の単一 `.txt` を抽出し、Shift_JIS 優先で読んで断片化する

検索結果の並び順には独自ルールがあります。まず、検索語と著者名がぴったり一致する作品を最優先に出します。次に、作品名や著者名への一致の強さを、完全一致、前方一致、部分一致の順で評価します。同じ作品が複数の文字遣いで並ぶ場合だけは `新字・新かな` を上に出します。さらに同点の場合は、記号で始まる題名や短すぎる題名を少し下げ、長めで区別しやすい題名を上に寄せます。それでも並びが決まらない場合は、作品名の読み、著者名の読みの順で整列します。

現在の ZIP 対応範囲:

- 対応: `store`, `deflate`, 単一 `.txt`
- 非対応: `ZIP64`, パスワード付き ZIP, 分割 ZIP, 複数作品入り ZIP, 画像入り ZIP

## バックアップと復元

`#/settings` から JSON バックアップを扱えます。

- `JSONを書き出す` で読書データ一式を保存する
- `JSONを選ぶ` でバックアップを読み込む
- 読み込み後に `上書きする` または `追加する` を選ぶ

## GitHub Pages 公開

このリポジトリは `main` ブランチのルート `/` をそのまま公開元にします。

```text
Branch: main
Folder: / (root)
```

詳しい方針は [docs/github-pages.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/github-pages.md) を参照してください。

## 開発から公開まで

公開前のローカル確認と公開は PowerShell スクリプトで行います。

```powershell
pwsh ./scripts/update-release-stamp.ps1
pwsh ./scripts/verify-self-tests.ps1
pwsh ./verify-pages.ps1
pwsh ./publish-pages.ps1
```

Windows の `cmd.exe` やダブルクリック向けに、同名の `.bat` ラッパーもあります。

```bat
update-release-stamp.bat
verify-self-tests.bat
verify-pages.bat
publish-pages.bat
```

- `update-release-stamp.ps1`: `index.html`, `src/*.js`, `release.json` の版番号を更新する
- `verify-self-tests.ps1`: ルビ、圏点、外字、見出し、ZIP、JSON、しおり正規化まわりの自己完結テストを行う
- `verify-pages.ps1`: GitHub Pages 公開に必要な構成と参照を確認する
- `publish-pages.ps1`: stamp、自己テスト、Pages 確認、commit、`origin/main` への push をまとめて行う

`origin` が未設定の clone では publish は失敗します。先に remote を追加してください。

## 更新反映

起動時に `index.html` が `release.json` を `no-store` で取得し、最新の CSS / JS を読み込みます。通常はブラウザ全体のキャッシュ削除は不要です。

それでも更新が見えないときは、URL 末尾に一時的な query を付けて `index.html` だけ再取得してください。

```text
https://imagawatatsuya.github.io/dopagaki-bunko/?reload=20260616
```

この方法はこのサイトの HTML 再取得を促すだけで、他サイトのキャッシュには触れません。

## 同梱カタログ更新

検索で使う同梱カタログ `data/aozora-catalog.json.gz` は、ブラウザから青空文庫へ直接取りに行かず、ローカル更新で差し替えます。

以前のそのままの JSON 配信は約 `12 MB` ありましたが、現在は必要項目だけを固定順配列に詰めた JSON を gzip 圧縮し、同梱アセットを約 `0.69 MB` まで縮小しています。目安として約 `94%` 削減、約 `16分の1` です。

まず現在の状態を確認します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -StatusOnly
```

次に、手元へ保存した `list_person_all_extended_utf8.zip` を使って差分を確認します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip
```

問題なければ `-Write` 付きで更新します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip -Write
```

詳細は [docs/aozora-catalog.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/aozora-catalog.md) を参照してください。

## 関連ドキュメント

- [docs/ui-pages.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/ui-pages.md)
- [docs/data-model.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/data-model.md)
- [docs/security.md](/C:/Users/xylitol/github_p/dopagaki-bunko/docs/security.md)
