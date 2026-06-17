function katakanaToHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/gu, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
}

const AOZORA_SEARCH_VARIANT_MAP = new Map([
  ['鷗', '鴎'],
  ['龍', '竜'],
  ['澤', '沢'],
  ['聲', '声'],
  ['國', '国'],
  ['獨', '独'],
  ['齋', '斎'],
  ['齊', '斎'],
  ['圓', '円'],
  ['與', '与'],
  ['濱', '浜'],
  ['瀧', '滝'],
  ['邊', '辺'],
  ['邉', '辺'],
  ['德', '徳']
]);

export const SEARCH_SORT_MODES = Object.freeze({
  READER: 'reader',
  READING: 'reading'
});

export const DEFAULT_SEARCH_SORT_MODE = SEARCH_SORT_MODES.READER;

const LEADING_READER_NOISE_RE = /^[\s\u3000"'“”‘’「」『』（）()［］[\]【】〔〕〈〉《》,，、。・･:：;；!！?？…‥\-‐‑‒–—―〜～＊*※#＃]/u;

function collapseWhitespace(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function stripSearchSeparators(text) {
  return text.replace(/[\s\u3000・･\-‐‑‒–—―ーｰ～〜「」『』（）()\[\]［］【】〔〕〈〉《》,，、。]/gu, '');
}

function normalizeAozoraSearchVariants(text) {
  return text.replace(/[鷗龍澤聲國獨齋齊圓與濱瀧邊邉德]/gu, (char) => {
    return AOZORA_SEARCH_VARIANT_MAP.get(char) ?? char;
  });
}

export function normalizeAozoraSearchText(text) {
  return collapseWhitespace(katakanaToHiragana(
    normalizeAozoraSearchVariants(
      String(text ?? '')
        .normalize('NFKC')
        .toLowerCase()
    )
  ));
}

export function compactAozoraSearchText(text) {
  return stripSearchSeparators(normalizeAozoraSearchText(text));
}

export function buildAozoraSearchText(parts) {
  return normalizeAozoraSearchText(parts.filter(Boolean).join(' '));
}

function buildCatalogSearchSource(record) {
  return [
    record.title,
    record.titleReading,
    record.author,
    record.authorReading,
    ...(Array.isArray(record.authors) ? record.authors : []),
    ...(Array.isArray(record.authorsReading) ? record.authorsReading : []),
    record.searchText
  ].filter(Boolean).join(' ');
}

function buildWorkSearchSource(record) {
  return [
    record.title,
    record.author,
    ...(Array.isArray(record.sourceTitleLines) ? record.sourceTitleLines : [])
  ].filter(Boolean).join(' ');
}

export function buildSearchNeedles(query) {
  const normalized = normalizeAozoraSearchText(query);
  const compact = compactAozoraSearchText(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const compactTokens = tokens
    .map((token) => compactAozoraSearchText(token))
    .filter(Boolean);

  return {
    normalized,
    compact,
    tokens,
    compactTokens
  };
}

function computeRecordMatchScore(record, needles, options = {}) {
  const source = options.sourceBuilder ? options.sourceBuilder(record) : buildCatalogSearchSource(record);
  const normalizedSource = normalizeAozoraSearchText(source);
  const compactSource = compactAozoraSearchText(source);
  const compactTitleValues = [
    record.title,
    record.titleReading,
    ...(Array.isArray(record.sourceTitleLines) ? record.sourceTitleLines : [])
  ].map((value) => compactAozoraSearchText(value)).filter(Boolean);
  const compactAuthorValues = [
    record.author,
    record.authorReading,
    ...(Array.isArray(record.authors) ? record.authors : []),
    ...(Array.isArray(record.authorsReading) ? record.authorsReading : [])
  ].map((value) => compactAozoraSearchText(value)).filter(Boolean);

  const normalizedMatched = needles.tokens.every((token) => normalizedSource.includes(token));
  const compactMatched = needles.compactTokens.every((token) => compactSource.includes(token));
  if (!normalizedMatched && !compactMatched) {
    return -1;
  }

  let score = 0;

  if (needles.compact && compactAuthorValues.some((value) => value === needles.compact)) {
    score += 1200;
  } else if (needles.compact && compactAuthorValues.some((value) => value.startsWith(needles.compact))) {
    score += 620;
  } else if (needles.compact && compactAuthorValues.some((value) => value.includes(needles.compact))) {
    score += 320;
  }

  if (needles.compact && compactTitleValues.some((value) => value === needles.compact)) {
    score += 1000;
  } else if (needles.compact && compactTitleValues.some((value) => value.startsWith(needles.compact))) {
    score += 760;
  } else if (needles.compact && compactTitleValues.some((value) => value.includes(needles.compact))) {
    score += 420;
  }

  if (needles.normalized && normalizedSource.startsWith(needles.normalized)) {
    score += 140;
  }

  score += needles.compactTokens.length * 10;
  return score;
}

function isExactAuthorMatch(record, needles) {
  if (!needles.compact) {
    return false;
  }

  const compactAuthorValues = [
    record.author,
    record.authorReading,
    ...(Array.isArray(record.authors) ? record.authors : []),
    ...(Array.isArray(record.authorsReading) ? record.authorsReading : [])
  ].map((value) => compactAozoraSearchText(value)).filter(Boolean);

  return compactAuthorValues.some((value) => value === needles.compact);
}

function sortText(value, fallback = '') {
  return normalizeAozoraSearchText(value || fallback);
}

function compareRecordSortText(leftRecord, rightRecord, primaryKey, fallbackKey) {
  const leftText = sortText(leftRecord[primaryKey], leftRecord[fallbackKey]);
  const rightText = sortText(rightRecord[primaryKey], rightRecord[fallbackKey]);
  return leftText.localeCompare(rightText, 'ja');
}

export function normalizeSearchSortMode(sortMode) {
  return sortMode === SEARCH_SORT_MODES.READING
    ? SEARCH_SORT_MODES.READING
    : DEFAULT_SEARCH_SORT_MODE;
}

function computeReaderSortScore(record) {
  const title = String(record.title ?? '');
  const compactTitleLength = compactAozoraSearchText(title).length;
  let score = Math.min(compactTitleLength, 40);

  if (compactTitleLength <= 2) {
    score -= 80;
  } else if (compactTitleLength <= 4) {
    score -= 20;
  }

  if (LEADING_READER_NOISE_RE.test(title)) {
    score -= 1000;
  }

  return score;
}

function compareReaderSort(leftRecord, rightRecord) {
  const scoreCompare = computeReaderSortScore(rightRecord) - computeReaderSortScore(leftRecord);
  return scoreCompare;
}

function compareRecordSortMode(leftRecord, rightRecord, sortMode) {
  if (sortMode === SEARCH_SORT_MODES.READER) {
    return compareReaderSort(leftRecord, rightRecord);
  }

  return 0;
}

function searchRecords(records, query, options = {}) {
  const needles = buildSearchNeedles(query);
  const limit = Number.isFinite(options.limit) ? options.limit : 0;
  const sortMode = normalizeSearchSortMode(options.sortMode);

  if (!needles.normalized) {
    return [];
  }

  const matched = records
    .filter((record) => record.id !== 'catalog:meta')
    .map((record) => ({
      record,
      score: computeRecordMatchScore(record, needles, options),
      exactAuthorMatch: isExactAuthorMatch(record, needles)
    }))
    .filter((entry) => entry.score >= 0)
  ;

  const ranked = matched
    .sort((left, right) => {
      if (left.exactAuthorMatch !== right.exactAuthorMatch) {
        return left.exactAuthorMatch ? -1 : 1;
      }

      const scoreCompare = right.score - left.score;
      if (scoreCompare !== 0) {
        return scoreCompare;
      }

      const modeCompare = compareRecordSortMode(left.record, right.record, sortMode);
      if (modeCompare !== 0) {
        return modeCompare;
      }

      const titleCompare = compareRecordSortText(left.record, right.record, 'titleReading', 'title');
      if (titleCompare !== 0) {
        return titleCompare;
      }

      return compareRecordSortText(left.record, right.record, 'authorReading', 'author');
    })
    .map((entry) => entry.record)
  ;

  if (limit > 0) {
    return ranked.slice(0, limit);
  }

  return ranked;
}

export function searchAozoraCatalog(records, query, options = {}) {
  return searchRecords(records, query, {
    ...options,
    sourceBuilder: buildCatalogSearchSource
  });
}

export function searchWorkRecords(records, query, options = {}) {
  return searchRecords(records, query, {
    ...options,
    sourceBuilder: buildWorkSearchSource
  });
}
