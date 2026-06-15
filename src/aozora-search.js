function katakanaToHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/gu, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
}

export function normalizeAozoraSearchText(text) {
  return katakanaToHiragana(
    String(text ?? '')
      .normalize('NFKC')
      .toLowerCase()
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

export function buildAozoraSearchText(parts) {
  return normalizeAozoraSearchText(parts.filter(Boolean).join(' '));
}

export function searchAozoraCatalog(records, query, options = {}) {
  const normalizedQuery = normalizeAozoraSearchText(query);
  const limit = Number.isFinite(options.limit) ? options.limit : 50;

  if (!normalizedQuery) {
    return [];
  }

  return records
    .filter((record) => record.id !== 'catalog:meta')
    .filter((record) => record.searchText.includes(normalizedQuery))
    .sort((left, right) => {
      const leftTitle = String(left.title ?? '');
      const rightTitle = String(right.title ?? '');
      const titleCompare = leftTitle.localeCompare(rightTitle, 'ja');
      if (titleCompare !== 0) {
        return titleCompare;
      }

      return String(left.author ?? '').localeCompare(String(right.author ?? ''), 'ja');
    })
    .slice(0, limit);
}
