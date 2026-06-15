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

## ReadingProgress

```js
{
  workId,
  lastReadFragmentIndex,
  updatedAt
}
```

## Follow

```js
{
  workId,
  followedAt
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
  fragmentId,
  createdAt
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
