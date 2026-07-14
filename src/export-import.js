import { STORE_NAMES, applyRecordMutations, exportStores } from './db.js?v=20260714225646';

const ZIP_TEXT_ENCODER = new TextEncoder();
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION_NEEDED = 20;
const ZIP_VERSION_MADE_BY = 20;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_MAX_UINT32 = 0xffffffff;
const ZIP_MAX_UINT16 = 0xffff;
const ZIP_CRC_TABLE = buildCrc32Table();

export function createExportPayload(data) {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    data
  };
}

export function buildDownloadName(timestamp) {
  const compact = timestamp.replaceAll(':', '-').replaceAll('.', '-');
  return `dopagaki-bunko-export-${compact}.json`;
}

export function buildTextZipDownloadName(timestamp) {
  const compact = timestamp.replaceAll(':', '-').replaceAll('.', '-');
  return `dopagaki-bunko-texts-${compact}.zip`;
}

export async function buildExportJson() {
  const stores = await exportStores();
  const payload = createExportPayload(stores);
  return JSON.stringify(payload, null, 2);
}

export async function downloadExportJson() {
  const json = await buildExportJson();
  const exportedAt = new Date().toISOString();
  const blob = new Blob([json], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = buildDownloadName(exportedAt);
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  return {
    downloadName: anchor.download,
    exportedAt
  };
}

function buildCrc32Table() {
  return Array.from({ length: 256 }, (_value, tableIndex) => {
    let crc = tableIndex;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return crc >>> 0;
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipHeader(length) {
  return new Uint8Array(length);
}

function writeUint16(bytes, offset, value) {
  const view = new DataView(bytes.buffer);
  view.setUint16(offset, value, true);
}

function writeUint32(bytes, offset, value) {
  const view = new DataView(bytes.buffer);
  view.setUint32(offset, value, true);
}

function assertZipLimit(value, maxValue, label) {
  if (value > maxValue) {
    throw new Error(`${label} が ZIP の対応上限を超えています。`);
  }
}

function normalizeTextForExport(value) {
  return String(value ?? '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n');
}

function decodeHtmlEntity(entity) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' '
  };
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }
  return named[entity] ?? `&${entity};`;
}

function plainTextFromFragment(fragment) {
  const displayHtml = String(fragment?.displayHtml ?? '');
  if (displayHtml) {
    return normalizeTextForExport(displayHtml)
      .replace(/<rt>[\s\S]*?<\/rt>/gu, '')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<[^>]+>/gu, '')
      .replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/gu, (_match, entity) => decodeHtmlEntity(entity));
  }
  return normalizeTextForExport(fragment?.plainText ?? '');
}

function fragmentSequenceOf(fragment) {
  if (Number.isFinite(fragment?.sequence)) {
    return fragment.sequence;
  }
  if (Number.isFinite(fragment?.index)) {
    return fragment.index;
  }
  const suffix = String(fragment?.id ?? '').match(/-(\d{4,})$/u);
  return suffix ? Number(suffix[1]) : 0;
}

function sortWorkFragments(fragments) {
  return [...fragments].sort((left, right) => {
    const sequenceCompare = fragmentSequenceOf(left) - fragmentSequenceOf(right);
    if (sequenceCompare !== 0) {
      return sequenceCompare;
    }
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
  });
}

function normalizeExportedBody(body) {
  return String(body)
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+|\n+$/gu, '');
}

function buildWorkText(work, fragments) {
  const title = String(work?.title ?? '').trim() || '無題';
  const author = String(work?.author ?? '').trim() || '著者不明';
  let body = '';

  for (const fragment of sortWorkFragments(fragments)) {
    if (fragment?.type === 'break') {
      body += fragment.breakKind === 'heading' ? '\n' : '\n\n';
      continue;
    }
    body += plainTextFromFragment(fragment);
  }

  return `${title}\n${author}\n\n${normalizeExportedBody(body)}\n`;
}

function sanitizePathSegment(value) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, '_')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .slice(0, 80);
  return sanitized || 'untitled';
}

export function buildWorkTextEntriesFromStores(stores) {
  const works = Array.isArray(stores?.works) ? stores.works : [];
  const fragments = Array.isArray(stores?.fragments) ? stores.fragments : [];
  const fragmentsByWorkId = new Map();

  for (const fragment of fragments) {
    const workId = String(fragment?.workId ?? '');
    if (!workId) {
      continue;
    }
    const list = fragmentsByWorkId.get(workId) ?? [];
    list.push(fragment);
    fragmentsByWorkId.set(workId, list);
  }

  const usedPaths = new Set();
  return works.map((work, index) => {
    const title = String(work?.title ?? '').trim() || '無題';
    const author = String(work?.author ?? '').trim() || '著者不明';
    const prefix = String(index + 1).padStart(3, '0');
    const baseName = `${prefix}_${sanitizePathSegment(title)}_${sanitizePathSegment(author)}`;
    let path = `works/${baseName}.txt`;
    let duplicateIndex = 2;
    while (usedPaths.has(path)) {
      path = `works/${baseName}_${duplicateIndex}.txt`;
      duplicateIndex += 1;
    }
    usedPaths.add(path);
    return {
      path,
      text: buildWorkText(work, fragmentsByWorkId.get(work?.id) ?? [])
    };
  });
}

export function buildStoredZipBlob(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const fileNameBytes = ZIP_TEXT_ENCODER.encode(entry.path);
    const dataBytes = ZIP_TEXT_ENCODER.encode(entry.text);
    const checksum = crc32(dataBytes);
    assertZipLimit(fileNameBytes.byteLength, ZIP_MAX_UINT16, 'ファイル名');
    assertZipLimit(dataBytes.byteLength, ZIP_MAX_UINT32, 'TXT本文');
    assertZipLimit(offset, ZIP_MAX_UINT32, 'ZIP内の位置');

    const localHeader = createZipHeader(30);
    writeUint32(localHeader, 0, ZIP_LOCAL_FILE_HEADER_SIGNATURE);
    writeUint16(localHeader, 4, ZIP_VERSION_NEEDED);
    writeUint16(localHeader, 6, ZIP_UTF8_FLAG);
    writeUint16(localHeader, 8, ZIP_STORE_METHOD);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, dataBytes.byteLength);
    writeUint32(localHeader, 22, dataBytes.byteLength);
    writeUint16(localHeader, 26, fileNameBytes.byteLength);
    writeUint16(localHeader, 28, 0);
    localParts.push(localHeader, fileNameBytes, dataBytes);

    const centralHeader = createZipHeader(46);
    writeUint32(centralHeader, 0, ZIP_CENTRAL_DIRECTORY_SIGNATURE);
    writeUint16(centralHeader, 4, ZIP_VERSION_MADE_BY);
    writeUint16(centralHeader, 6, ZIP_VERSION_NEEDED);
    writeUint16(centralHeader, 8, ZIP_UTF8_FLAG);
    writeUint16(centralHeader, 10, ZIP_STORE_METHOD);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, dataBytes.byteLength);
    writeUint32(centralHeader, 24, dataBytes.byteLength);
    writeUint16(centralHeader, 28, fileNameBytes.byteLength);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, offset);
    centralParts.push(centralHeader, fileNameBytes);

    offset += localHeader.byteLength + fileNameBytes.byteLength + dataBytes.byteLength;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  assertZipLimit(entries.length, ZIP_MAX_UINT16, 'ZIP内ファイル数');
  assertZipLimit(centralDirectorySize, ZIP_MAX_UINT32, 'ZIP中央ディレクトリ');

  const endHeader = createZipHeader(22);
  writeUint32(endHeader, 0, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16(endHeader, 4, 0);
  writeUint16(endHeader, 6, 0);
  writeUint16(endHeader, 8, entries.length);
  writeUint16(endHeader, 10, entries.length);
  writeUint32(endHeader, 12, centralDirectorySize);
  writeUint32(endHeader, 16, centralDirectoryOffset);
  writeUint16(endHeader, 20, 0);

  return new Blob([...localParts, ...centralParts, endHeader], { type: 'application/zip' });
}

function downloadBlob(blob, downloadName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = downloadName;
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

async function buildExportTextZip() {
  const stores = await exportStores();
  const entries = buildWorkTextEntriesFromStores(stores);
  if (entries.length === 0) {
    throw new Error('TXT に書き出せる作品がありません。');
  }

  const exportedAt = new Date().toISOString();
  const downloadName = buildTextZipDownloadName(exportedAt);
  const blob = buildStoredZipBlob(entries);
  return {
    blob,
    downloadName,
    exportedAt,
    workCount: entries.length
  };
}

export async function downloadExportTextZip() {
  const result = await buildExportTextZip();
  downloadBlob(result.blob, result.downloadName);
  return {
    downloadName: result.downloadName,
    exportedAt: result.exportedAt,
    workCount: result.workCount
  };
}

export function parseImportJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  const sourceData = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;

  if (!sourceData || typeof sourceData !== 'object') {
    throw new Error('JSON の形式が不正です。');
  }

  const stores = {};
  STORE_NAMES.forEach((storeName) => {
    const values = sourceData[storeName];
    stores[storeName] = Array.isArray(values) ? values : [];
  });

  return stores;
}

export async function readImportFile(file) {
  const jsonText = await file.text();
  const stores = parseImportJson(jsonText);
  return {
    fileName: file.name,
    stores
  };
}

export async function importJsonData(stores, mode) {
  if (mode !== 'replace' && mode !== 'append') {
    throw new Error('インポートモードが不正です。');
  }

  await applyRecordMutations({
    clearStores: mode === 'replace' ? STORE_NAMES : [],
    putRecords: Object.fromEntries(
      STORE_NAMES.map((storeName) => [storeName, stores[storeName] ?? []])
    )
  });
}
