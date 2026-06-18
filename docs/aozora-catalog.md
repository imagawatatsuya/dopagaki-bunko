# 同梱青空カタログ更新手順

## 目的

`data/aozora-catalog.json.gz` は、追加画面 `#/search` で使う同梱の検索用スナップショットです。

- ブラウザ実行中に青空文庫の一覧ZIPを直接取りにいかない
- GitHub Pages とローカル静的配信で同じ検索結果を使う
- CORS に依存しない
- 転送量を抑えるため、短い配列形式のJSONをgzipして配信する

サイズ感の目安:

| 項目 | 以前 | 現在 |
|---|---:|---:|
| 配信形式 | 通常の JSON | 配列化 JSON + gzip |
| 同梱カタログサイズ | 約 `12 MB` | 約 `0.69 MB` |
| 圧縮後の比率 | 1倍 | 約 `16分の1` |

必要項目だけを固定順の配列へ詰めてから gzip 圧縮しているため、同梱カタログの配信サイズを約 `94%` 削減している。

このため、一覧ZIPの更新はローカル作業で行います。

## 検索結果の並び順

検索結果の並び順には独自ルールがあります。

1. まず、検索語と著者名がぴったり一致する作品を最優先に出す。
2. 次に、作品名や著者名への一致の強さを、完全一致、前方一致、部分一致の順で評価する。
3. 同じ作品が複数の文字遣いで並ぶ場合だけは、`新字・新かな` を上に出す。
4. さらに同点の場合は、記号で始まる題名を少し下げる。
5. 作品名の文字数にも調整があり、短すぎる題名は少し下げ、長めで区別しやすい題名を上に寄せる。
6. それでも並びが決まらない場合は、作品名の読み、著者名の読みの順で整列する。

検索時には旧字体や異体字の一部も吸収するため、`森鷗外` と `森鴎外`、`芥川龍之介` と `芥川竜之介` のような差をまたいで探せます。

## 更新元

- ZIP: `https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip`
- 現在の同梱カタログ: [data/aozora-catalog.json.gz](/C:/Users/xylitol/github_p/dopagaki-bunko/data/aozora-catalog.json.gz)

## 使うスクリプト

- [scripts/update-aozora-catalog.ps1](/C:/Users/xylitol/github_p/dopagaki-bunko/scripts/update-aozora-catalog.ps1)
- [scripts/update-aozora-catalog.mjs](/C:/Users/xylitol/github_p/dopagaki-bunko/scripts/update-aozora-catalog.mjs)
- ルートの簡易ラッパー: [update-aozora-catalog.ps1](/C:/Users/xylitol/github_p/dopagaki-bunko/update-aozora-catalog.ps1), [update-aozora-catalog.bat](/C:/Users/xylitol/github_p/dopagaki-bunko/update-aozora-catalog.bat)

PowerShell が使える環境では `pwsh ./scripts/update-aozora-catalog.ps1 ...` を基本にし、`cmd.exe` やダブルクリックでは `update-aozora-catalog.bat` を使えます。

## 1. 現在の更新日を確認する

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -StatusOnly
```

この表示で最低限確認する項目:

- `fetchedAt`
- `recordCount`
- `sourceUrl`

## 2. 公式ZIPをローカルへ保存する

ブラウザや `Invoke-WebRequest` などで `list_person_all_extended_utf8.zip` を保存します。

保存場所は任意ですが、作業中に分かりやすいよう `scratch/` や `Downloads/` の明示的な場所を使ってください。

## 3. 差分だけ確認する

まだ書き換えず、現行カタログとの差分概要だけ見ます。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip
```

この段階では以下が出ます。

- 現在の `fetchedAt` と `recordCount`
- 再生成後の `fetchedAt` と `recordCount`
- `追加 / 削除 / 変更 / 件数差`

ここで件数や変更量が不自然なら、ZIPの取り違えや壊れたダウンロードを疑ってください。

## 4. カタログを書き換える

差分確認に問題がなければ、`--write` を付けて更新します。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -ZipPath C:\path\to\list_person_all_extended_utf8.zip -Write
```

ZIPの保存日時を `fetchedAt` に使いたくない場合は、明示指定もできます。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 `
  -ZipPath C:\path\to\list_person_all_extended_utf8.zip `
  -Write `
  -FetchedAt 2026-06-17T12:34:56Z
```

## 5. 差分を確認する

更新後は、少なくとも次を見ます。

```powershell
pwsh ./scripts/update-aozora-catalog.ps1 -StatusOnly
git diff --stat -- data/aozora-catalog.json.gz
```

見るポイント:

- `recordCount`
- `fetchedAt`
- `data/aozora-catalog.json.gz` のサイズ
- `-Write` なしで見た追加・削除・変更の規模が想定内か

gzip済みのため、通常の `git diff` では中身の差分は見ません。更新前の差分概要は `-Write` なしの実行結果で確認します。

## 6. 既存の検証を通す

カタログ更新後は、既存の検証手順も通します。

```powershell
pwsh ./scripts/verify-self-tests.ps1
pwsh ./verify-pages.ps1
```

## 補足

- この更新手順は外部依存を追加しません
- 生成は既存の `src/aozora-catalog.js` と `src/aozora-zip-importer.js` を再利用します
- ブラウザでは `DecompressionStream` で gzip を展開し、通常のレコード形へ戻してから IndexedDB へ保存します
- ブラウザ実行中に公式ZIPへ直接アクセスするための仕組みは追加しません
