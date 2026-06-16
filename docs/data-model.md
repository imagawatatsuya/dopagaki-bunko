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
  fragmentCount
}
```

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
  createdAt
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

## Quote

```js
{
  id,
  fragmentId,
  workId,
  text,
  createdAt
}
```

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
