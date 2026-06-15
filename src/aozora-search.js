function katakanaToHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/gu, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
}

function collapseWhitespace(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function stripSearchSeparators(text) {
  return text.replace(/[\s\u3000・･\-‐‑‒–—―ーｰ～〜「」『』（）()\[\]［］【】〔〕〈〉《》,，、。]/gu, '');
}

export function normalizeAozoraSearchText(text) {
  return collapseWhitespace(katakanaToHiragana(
    String(text ?? '')
      .normalize('NFKC')
      .toLowerCase()
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

function buildSearchNeedles(query) {
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

function computeMatchScore(record, needles) {
  const source = buildCatalogSearchSource(record);
  const normalizedSource = normalizeAozoraSearchText(source);
  const compactSource = compactAozoraSearchText(source);
  const compactTitle = compactAozoraSearchText([record.title, record.titleReading].filter(Boolean).join(' '));
  const compactAuthor = compactAozoraSearchText([
    record.author,
    record.authorReading,
    ...(Array.isArray(record.authors) ? record.authors : []),
    ...(Array.isArray(record.authorsReading) ? record.authorsReading : [])
  ].filter(Boolean).join(' '));

  const normalizedMatched = needles.tokens.every((token) => normalizedSource.includes(token));
  const compactMatched = needles.compactTokens.every((token) => compactSource.includes(token));
  if (!normalizedMatched && !compactMatched) {
    return -1;
  }

  let score = 0;

  if (needles.compact && compactTitle === needles.compact) {
    score += 600;
  } else if (needles.compact && compactTitle.startsWith(needles.compact)) {
    score += 420;
  } else if (needles.compact && compactTitle.includes(needles.compact)) {
    score += 280;
  }

  if (needles.compact && compactAuthor === needles.compact) {
    score += 520;
  } else if (needles.compact && compactAuthor.startsWith(needles.compact)) {
    score += 360;
  } else if (needles.compact && compactAuthor.includes(needles.compact)) {
    score += 220;
  }

  if (needles.normalized && normalizedSource.startsWith(needles.normalized)) {
    score += 140;
  }

  score += needles.compactTokens.length * 10;
  return score;
}

export function searchAozoraCatalog(records, query, options = {}) {
  const needles = buildSearchNeedles(query);
  const limit = Number.isFinite(options.limit) ? options.limit : 50;

  if (!needles.normalized) {
    return [];
  }

  return records
    .filter((record) => record.id !== 'catalog:meta')
    .map((record) => ({
      record,
      score: computeMatchScore(record, needles)
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      const scoreCompare = right.score - left.score;
      if (scoreCompare !== 0) {
        return scoreCompare;
      }

      const leftTitle = String(left.record.title ?? '');
      const rightTitle = String(right.record.title ?? '');
      const titleCompare = leftTitle.localeCompare(rightTitle, 'ja');
      if (titleCompare !== 0) {
        return titleCompare;
      }

      return String(left.record.author ?? '').localeCompare(String(right.record.author ?? ''), 'ja');
    })
    .map((entry) => entry.record)
    .slice(0, limit);
}
