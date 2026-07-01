# データモデル

## WorkAccount

```js
{
  id,
  sourceType,
  aozoraWorkId,
  title,
  author,
  sourceUrl,
  sourceFileName,
  importedAt,
  fragmentCount,
  outline: [
    {
      id,
      title,
      level,
      indentStep,
      fragmentIndex,
      fragmentId
    }
  ]
}
```

`outline` は青空文庫の見出し注記から保存した章構造で、作品ページの目次ジャンプに使う。

## Fragment

```js
{
  id,
  workId,
  index,
  rawText,
  plainText,
  displayHtml,
  fragmentType,
  charCount
}
```

## Internal Cache

```js
{
  id, // workId or "catalog:meta"
  title,
  titleReading,
  author,
  authorReading,
  cardUrl,
  textZipUrl,
  kanaType,
  copyrightWarning
}
```

`aozoraCatalog` は同梱スナップショット由来の検索用キャッシュであり、JSONバックアップ対象には含めない。配信ファイルは `data/aozora-catalog.json.gz` で、ブラウザ読み込み時に通常のレコード形へ展開してから IndexedDB へ保存する。

## Like

```js
{
  fragmentId,
  savedAt,
  note
}
```

## Bookmark

```js
{
  id, // workId
  workId,
  fragmentId,
  fragmentIndex,
  savedAt
}
```

`bookmarks` は作品ごとに常に1件だけ保持し、再開位置として使う。

## Runtime Fragment Index

IndexedDBから断片を読み込んだ後、作品別レコード配列、本文番号から配列位置を引く`Int32Array`、断片ID検索用`Map`をメモリ上へ分割構築する。索引は永続化せず、本文文字列も複製しない。作品ページの目次・しおり・断片番号ジャンプと前後読み込みは、この索引から表示範囲だけを取得する。

## ReadingState

```js
{
  id, // workId
  workId,
  status, // "reading" | "completed"
  createdAt,
  updatedAt
}
```

未読は `readingStates` も `bookmarks` もない状態として扱う。
