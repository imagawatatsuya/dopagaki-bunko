# データモデル

## WorkAccount

```js
{
  id,
  sourceType,
  aozoraWorkId,
  title,
  author,
  handle,
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
