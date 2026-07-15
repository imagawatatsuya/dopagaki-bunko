import { STORE_NAMES, applyRecordMutations, exportStores } from './db.js?v=20260715223058';

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
const ZIP_DOS_TIME_MIDNIGHT = 0;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;
const ZIP_TEXT_ENTRY_DIR = 'works';
const ZIP_FILENAME_MAP_PATH = '_filename-map.json';
const ZIP_TEXT_EXTENSION = '.txt';
const ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES = 200;
const ZIP_MAX_INTERNAL_PATH_CHARS = 240;
const ZIP_SHORT_HASH_BYTES = 8;
const WINDOWS_FORBIDDEN_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]+/gu;
const WINDOWS_FORBIDDEN_NAME_CHARS_TEST = /[<>:"/\\|?*\u0000-\u001f]/u;
const WINDOWS_RESERVED_BASENAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu;
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

function utf8ByteLength(value) {
  return ZIP_TEXT_ENCODER.encode(String(value ?? '')).byteLength;
}

function stableNameHash(value) {
  let hash = 0x811c9dc5;
  for (const byte of ZIP_TEXT_ENCODER.encode(String(value ?? ''))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(ZIP_SHORT_HASH_BYTES, '0').slice(0, ZIP_SHORT_HASH_BYTES);
}

function graphemeClusters(value) {
  const text = String(value ?? '').normalize('NFC');
  if (globalThis.Intl?.Segmenter) {
    const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

function truncateToUtf8Bytes(value, maxBytes) {
  if (maxBytes <= 0) {
    return '';
  }

  let result = '';
  for (const cluster of graphemeClusters(value)) {
    const next = `${result}${cluster}`;
    if (utf8ByteLength(next) > maxBytes) {
      break;
    }
    result = next;
  }
  return result.replace(/[. ]+$/gu, '');
}

function normalizeWindowsNamePart(value) {
  const normalized = String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(WINDOWS_FORBIDDEN_NAME_CHARS, '_')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '');
  return normalized || 'untitled';
}

function avoidWindowsReservedBaseName(baseName) {
  const trimmed = String(baseName ?? '').replace(/[. ]+$/gu, '') || 'untitled';
  return WINDOWS_RESERVED_BASENAME.test(trimmed) ? `${trimmed}_` : trimmed;
}

function buildSafeTextFileName({ prefix, title, author, collisionSuffix = '', forceShort = false }) {
  const normalizedPrefix = normalizeWindowsNamePart(prefix).replace(/_/gu, '') || '000';
  const rawTitle = String(title ?? '').trim() || '無題';
  const rawAuthor = String(author ?? '').trim() || '著者不明';
  const rawOriginalName = `${normalizedPrefix}_${rawTitle}_${rawAuthor}${ZIP_TEXT_EXTENSION}`;
  const normalizedTitle = normalizeWindowsNamePart(title);
  const normalizedAuthor = normalizeWindowsNamePart(author);
  const normalizedOriginalName = `${normalizedPrefix}_${normalizedTitle}_${normalizedAuthor}${ZIP_TEXT_EXTENSION}`;
  const originalUtf8Bytes = utf8ByteLength(rawOriginalName);
  const hash = stableNameHash(rawOriginalName);
  const suffix = collisionSuffix ? `_${collisionSuffix}` : '';
  let baseName = avoidWindowsReservedBaseName(`${normalizedPrefix}_${normalizedTitle}_${normalizedAuthor}${suffix}`);
  let fileName = `${baseName}${ZIP_TEXT_EXTENSION}`;
  const reasons = [];

  if (rawOriginalName.normalize('NFC') !== normalizedOriginalName) {
    reasons.push('windows-name');
  }

  if (forceShort || utf8ByteLength(fileName) > ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES) {
    reasons.push(forceShort ? 'path-length' : 'utf8-byte-length');
    const fixedLeft = `${normalizedPrefix}_`;
    const fixedRight = `${suffix}_${hash}${ZIP_TEXT_EXTENSION}`;
    const maxMiddleBytes = ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES - utf8ByteLength(fixedLeft) - utf8ByteLength(fixedRight);
    const descriptive = `${normalizedTitle}_${normalizedAuthor}`;
    const shortened = truncateToUtf8Bytes(descriptive, Math.max(1, maxMiddleBytes)) || 'untitled';
    baseName = avoidWindowsReservedBaseName(`${normalizedPrefix}_${shortened}${suffix}_${hash}`);
    fileName = `${baseName}${ZIP_TEXT_EXTENSION}`;
  }

  if (utf8ByteLength(fileName) > ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES) {
    const fixedLeft = `${normalizedPrefix}_`;
    const fixedRight = `${suffix}_${hash}${ZIP_TEXT_EXTENSION}`;
    const maxMiddleBytes = ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES - utf8ByteLength(fixedLeft) - utf8ByteLength(fixedRight);
    const shortened = truncateToUtf8Bytes('untitled', Math.max(1, maxMiddleBytes)) || 'x';
    baseName = avoidWindowsReservedBaseName(`${normalizedPrefix}_${shortened}${suffix}_${hash}`);
    fileName = `${baseName}${ZIP_TEXT_EXTENSION}`;
  }

  return {
    fileName,
    originalName: rawOriginalName.normalize('NFC'),
    originalUtf8Bytes,
    shortened: reasons.length > 0,
    reason: reasons.join(',') || ''
  };
}

function buildUniqueSafeTextPath({ prefix, title, author }, usedPaths) {
  let collisionIndex = 0;
  let collisionAvoided = false;
  let safe = buildSafeTextFileName({ prefix, title, author });
  let path = `${ZIP_TEXT_ENTRY_DIR}/${safe.fileName}`;

  if (path.length > ZIP_MAX_INTERNAL_PATH_CHARS) {
    safe = buildSafeTextFileName({ prefix, title, author, forceShort: true });
    path = `${ZIP_TEXT_ENTRY_DIR}/${safe.fileName}`;
  }

  while (usedPaths.has(path)) {
    collisionIndex += 1;
    collisionAvoided = true;
    safe = buildSafeTextFileName({
      prefix,
      title,
      author,
      collisionSuffix: String(collisionIndex + 1),
      forceShort: safe.shortened || path.length > ZIP_MAX_INTERNAL_PATH_CHARS
    });
    path = `${ZIP_TEXT_ENTRY_DIR}/${safe.fileName}`;
  }

  usedPaths.add(path);
  const reasons = new Set((safe.reason ? safe.reason.split(',') : []).filter(Boolean));
  if (collisionAvoided) {
    reasons.add('collision');
  }
  if (path.length > ZIP_MAX_INTERNAL_PATH_CHARS) {
    throw new Error(`TXT ZIP の内部パスが長すぎます: ${path}`);
  }
  if (utf8ByteLength(safe.fileName) > ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES) {
    throw new Error(`TXT ZIP のファイル名が長すぎます: ${safe.fileName}`);
  }

  const result = {
    path,
    fileName: safe.fileName,
    originalName: safe.originalName,
    originalPath: `${ZIP_TEXT_ENTRY_DIR}/${safe.originalName}`,
    originalUtf8Bytes: safe.originalUtf8Bytes,
    shortened: reasons.size > 0,
    reason: Array.from(reasons).join(','),
    collisionAvoided
  };

  console.debug?.('[dopagaki-bunko] TXT ZIP entry', {
    originalName: result.originalPath,
    normalizedName: result.path,
    utf8Bytes: utf8ByteLength(result.fileName),
    shortened: result.shortened,
    reason: result.reason,
    collisionAvoided: result.collisionAvoided
  });

  return result;
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
  const filenameMap = {};
  const entries = works.map((work, index) => {
    const title = String(work?.title ?? '').trim() || '無題';
    const author = String(work?.author ?? '').trim() || '著者不明';
    const prefix = String(index + 1).padStart(3, '0');
    const safePath = buildUniqueSafeTextPath({ prefix, title, author }, usedPaths);
    if (safePath.shortened || safePath.originalPath !== safePath.path) {
      filenameMap[safePath.path] = {
        originalName: safePath.originalPath,
        reason: safePath.reason || 'normalized',
        originalUtf8Bytes: safePath.originalUtf8Bytes
      };
    }
    return {
      path: safePath.path,
      text: buildWorkText(work, fragmentsByWorkId.get(work?.id) ?? [])
    };
  });

  if (Object.keys(filenameMap).length > 0) {
    entries.push({
      path: ZIP_FILENAME_MAP_PATH,
      text: `${JSON.stringify(filenameMap, null, 2)}\n`
    });
  }

  return entries;
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
    writeUint16(localHeader, 10, ZIP_DOS_TIME_MIDNIGHT);
    writeUint16(localHeader, 12, ZIP_DOS_DATE_1980_01_01);
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
    writeUint16(centralHeader, 12, ZIP_DOS_TIME_MIDNIGHT);
    writeUint16(centralHeader, 14, ZIP_DOS_DATE_1980_01_01);
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

function readUint16(view, offset) {
  return view.getUint16(offset, true);
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('TXT ZIP の中央ディレクトリ終端が見つかりません。');
}

function validateTextZipEntryName(path) {
  if (!path) {
    throw new Error('TXT ZIP に空のエントリ名があります。');
  }
  if (path.includes('\\')) {
    throw new Error(`TXT ZIP のエントリ名にバックスラッシュがあります: ${path}`);
  }
  if (path.length > ZIP_MAX_INTERNAL_PATH_CHARS) {
    throw new Error(`TXT ZIP の内部パスが ${ZIP_MAX_INTERNAL_PATH_CHARS} 文字を超えています: ${path}`);
  }
  const fileName = path.split('/').pop() ?? '';
  if (!fileName) {
    throw new Error(`TXT ZIP のファイル名が空です: ${path}`);
  }
  const extensionIndex = fileName.lastIndexOf('.');
  const baseName = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
  if (WINDOWS_RESERVED_BASENAME.test(baseName)) {
    throw new Error(`TXT ZIP のファイル名がWindows予約名です: ${path}`);
  }
  if (/[. ]$/u.test(baseName)) {
    throw new Error(`TXT ZIP のファイル名末尾がWindows互換ではありません: ${path}`);
  }
  if (WINDOWS_FORBIDDEN_NAME_CHARS_TEST.test(fileName)) {
    throw new Error(`TXT ZIP のファイル名にWindows禁止文字があります: ${path}`);
  }
  if (utf8ByteLength(fileName) > ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES) {
    throw new Error(`TXT ZIP のファイル名が UTF-8 ${ZIP_MAX_TEXT_FILE_NAME_UTF8_BYTES} バイトを超えています: ${path}`);
  }
}

export async function validateStoredZipBlob(blob, { expectedTextEntryCount } = {}) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(view, endOffset + 10);
  const centralDirectorySize = readUint32(view, endOffset + 12);
  const centralDirectoryOffset = readUint32(view, endOffset + 16);
  const seenPaths = new Set();
  let textEntryCount = 0;
  let offset = centralDirectoryOffset;

  if (centralDirectoryOffset + centralDirectorySize > bytes.byteLength) {
    throw new Error('TXT ZIP の中央ディレクトリ位置が不正です。');
  }

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('TXT ZIP の中央ディレクトリエントリが不正です。');
    }

    const flags = readUint16(view, offset + 8);
    const method = readUint16(view, offset + 10);
    const expectedCrc = readUint32(view, offset + 16);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const path = decoder.decode(bytes.slice(nameStart, nameEnd));

    if ((flags & ZIP_UTF8_FLAG) === 0) {
      throw new Error(`TXT ZIP のエントリ名が UTF-8 指定ではありません: ${path}`);
    }
    if (method !== ZIP_STORE_METHOD) {
      throw new Error(`TXT ZIP の圧縮方式が不正です: ${path}`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(`TXT ZIP のstoredエントリサイズが一致しません: ${path}`);
    }
    validateTextZipEntryName(path);
    if (seenPaths.has(path)) {
      throw new Error(`TXT ZIP のエントリ名が重複しています: ${path}`);
    }
    seenPaths.add(path);

    if (readUint32(view, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`TXT ZIP のローカルヘッダーが不正です: ${path}`);
    }
    const localFileNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) {
      throw new Error(`TXT ZIP の本文データ範囲が不正です: ${path}`);
    }
    const dataBytes = bytes.slice(dataStart, dataEnd);
    const actualCrc = crc32(dataBytes);
    if (actualCrc !== expectedCrc) {
      throw new Error(`TXT ZIP のCRC検査に失敗しました: ${path}`);
    }
    if (path.startsWith(`${ZIP_TEXT_ENTRY_DIR}/`) && path.endsWith(ZIP_TEXT_EXTENSION)) {
      textEntryCount += 1;
    }

    offset = nameEnd + extraLength + commentLength;
  }

  if (typeof expectedTextEntryCount === 'number' && textEntryCount !== expectedTextEntryCount) {
    throw new Error(`TXT ZIP の本文ファイル数が一致しません: ${textEntryCount}/${expectedTextEntryCount}`);
  }

  return {
    entryCount,
    textEntryCount
  };
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
  const textEntryCount = entries.filter((entry) => entry.path.startsWith(`${ZIP_TEXT_ENTRY_DIR}/`) && entry.path.endsWith(ZIP_TEXT_EXTENSION)).length;
  if (textEntryCount === 0) {
    throw new Error('TXT に書き出せる作品がありません。');
  }

  const exportedAt = new Date().toISOString();
  const downloadName = buildTextZipDownloadName(exportedAt);
  const blob = buildStoredZipBlob(entries);
  await validateStoredZipBlob(blob, { expectedTextEntryCount: textEntryCount });
  return {
    blob,
    downloadName,
    exportedAt,
    workCount: textEntryCount
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
