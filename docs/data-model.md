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
  workCopyrightFlag,
  authorCopyrightFlags,
  copyrightWarning,
  searchText
}
```

`aozoraCatalog` は同梱スナップショット由来の検索用キャッシュであり、JSONバックアップ対象には含めない。

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
