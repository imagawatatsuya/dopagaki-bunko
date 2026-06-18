import { parseCsvObjects } from './aozora-csv.js?v=20260619021924';
import { buildAozoraSearchText } from './aozora-search.js?v=20260619021924';

export const AOZORA_CATALOG_SOURCE_URL = 'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip';
export const AOZORA_CATALOG_ASSET_PATH = './data/aozora-catalog.json.gz';
export const AOZORA_CATALOG_META_ID = 'catalog:meta';
export const AOZORA_CATALOG_COMPACT_FIELDS = [
  'id',
  'title',
  'titleReading',
  'author',
  'authorReading',
  'cardUrl',
  'textZipUrl',
  'kanaType',
  'copyrightWarning'
];

function normalizeFlag(flag) {
  return String(flag ?? '').trim();
}

function buildAuthorName(row) {
  return [row['姓'], row['名']].filter(Boolean).join(' ').trim();
}

function buildAuthorReading(row) {
  return [row['姓読み'], row['名読み']].filter(Boolean).join(' ').trim();
}

function buildTitle(row) {
  return [row['作品名'], row['副題']].filter(Boolean).join(' ').trim();
}

function buildTitleReading(row) {
  return [row['作品名読み'], row['副題読み']].filter(Boolean).join(' ').trim();
}

function hasTextZipUrl(row) {
  return String(row['テキストファイルURL'] ?? '').trim().toLowerCase().endsWith('.zip');
}

function choosePrimaryAuthor(rows) {
  return rows.find((row) => String(row['役割フラグ'] ?? '') === '著者') ?? rows[0] ?? null;
}

function buildCatalogRecord(workId, rows) {
  const primaryRow = choosePrimaryAuthor(rows);
  if (!primaryRow) {
    return null;
  }

  const authorRows = rows.filter((row) => {
    return String(row['役割フラグ'] ?? '') === '著者' || String(row['役割フラグ'] ?? '') === '';
  });
  const authors = authorRows.length > 0 ? authorRows : rows;
  const authorNames = [...new Set(authors.map((row) => buildAuthorName(row)).filter(Boolean))];
  const authorReadings = [...new Set(authors.map((row) => buildAuthorReading(row)).filter(Boolean))];
  const title = buildTitle(primaryRow) || String(primaryRow['作品名'] ?? '') || '無題';
  const titleReading = buildTitleReading(primaryRow);
  const workCopyrightFlag = normalizeFlag(primaryRow['作品著作権フラグ']);
  const authorCopyrightFlags = [...new Set(rows.map((row) => normalizeFlag(row['人物著作権フラグ'])).filter(Boolean))];
  const copyrightWarning = workCopyrightFlag !== 'なし' || authorCopyrightFlags.some((flag) => flag !== 'なし');

  return {
    id: String(workId),
    workId: String(workId),
    title,
    titleReading,
    author: authorNames.join(' / ') || '著者不明',
    authorReading: authorReadings.join(' / '),
    authors: authorNames,
    authorsReading: authorReadings,
    cardUrl: String(primaryRow['図書カードURL'] ?? '').trim(),
    textZipUrl: String(primaryRow['テキストファイルURL'] ?? '').trim(),
    htmlUrl: String(primaryRow['XHTML/HTMLファイルURL'] ?? '').trim(),
    kanaType: String(primaryRow['文字遣い種別'] ?? '').trim(),
    workCopyrightFlag,
    authorCopyrightFlags,
    copyrightWarning,
    searchText: buildAozoraSearchText([
      title,
      titleReading,
      authorNames.join(' '),
      authorReadings.join(' ')
    ])
  };
}

export function buildAozoraCatalogRecords(csvText) {
  const rows = parseCsvObjects(csvText).filter((row) => hasTextZipUrl(row));
  const grouped = new Map();

  rows.forEach((row) => {
    const workId = String(row['作品ID'] ?? '').trim();
    if (!workId) {
      return;
    }

    const current = grouped.get(workId) ?? [];
    current.push(row);
    grouped.set(workId, current);
  });

  return [...grouped.entries()]
    .map(([workId, workRows]) => buildCatalogRecord(workId, workRows))
    .filter(Boolean);
}

export function buildAozoraCatalogMeta(records, sourceUrl = AOZORA_CATALOG_SOURCE_URL, fetchedAt = new Date().toISOString()) {
  return {
    id: AOZORA_CATALOG_META_ID,
    fetchedAt,
    recordCount: records.length,
    sourceUrl
  };
}

export function compactAozoraCatalogRecords(records) {
  return records.map((record) => AOZORA_CATALOG_COMPACT_FIELDS.map((field) => {
    if (field === 'copyrightWarning') {
      return Boolean(record[field]);
    }
    return record[field] ?? '';
  }));
}

export function expandAozoraCatalogRecords(records, fields = AOZORA_CATALOG_COMPACT_FIELDS) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => {
    if (!Array.isArray(record)) {
      return record;
    }

    const expanded = {};
    fields.forEach((field, index) => {
      expanded[field] = record[index] ?? (field === 'copyrightWarning' ? false : '');
    });
    expanded.workId = expanded.id;
    return expanded;
  });
}

export function buildAozoraCatalogPayload(records, sourceUrl = AOZORA_CATALOG_SOURCE_URL, fetchedAt = new Date().toISOString()) {
  return {
    version: 2,
    format: 'array-v1',
    fetchedAt,
    sourceUrl,
    recordCount: records.length,
    fields: AOZORA_CATALOG_COMPACT_FIELDS,
    records: compactAozoraCatalogRecords(records)
  };
}

export function normalizeAozoraCatalogPayload(payload) {
  const records = expandAozoraCatalogRecords(payload?.records, payload?.fields);
  return {
    records,
    meta: buildAozoraCatalogMeta(
      records,
      String(payload?.sourceUrl ?? AOZORA_CATALOG_SOURCE_URL),
      String(payload?.fetchedAt ?? new Date().toISOString())
    )
  };
}
