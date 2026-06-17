import assert from 'node:assert/strict';

import { convertAozoraRubyToHtml, repairAozoraLegacyRubyHtml } from '../src/aozora-ruby.js';
import { convertAozoraEmphasisToHtml } from '../src/aozora-emphasis.js';
import { replaceAozoraGaijiNotation } from '../src/aozora-gaiji.js';
import { renderAozoraBodyWithHeadings, repairAozoraLayoutNotesInHtml } from '../src/aozora-headings.js';
import { derivePreviewFromText } from '../src/import-preview.js';
import { extractAozoraTxtFromZip } from '../src/aozora-zip-importer.js';
import { buildAozoraCatalogPayload, normalizeAozoraCatalogPayload } from '../src/aozora-catalog.js';
import { createExportPayload, buildDownloadName, parseImportJson } from '../src/export-import.js';
import { STORE_NAMES } from '../src/db.js';
import { fragmentText } from '../src/fragmenter.js';
import { buildWorkEndHash, buildWorkOutlineHash } from '../src/router.js';
import { canonicalizeBookmarkRecords, sameBookmarkRecords } from '../src/state.js';
import { createInitialAppState } from '../src/app-state.js';
import { returnLinkLabel } from '../src/renderer-shared.js';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function pushUint16(parts, value) {
  parts.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(parts, value) {
  parts.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

function buildSingleFileStoreZip(fileName, text, options = {}) {
  const fileNameBytes = encodeText(fileName);
  const dataBytes = encodeText(text);
  const localHeader = [];
  pushUint32(localHeader, 0x04034b50);
  pushUint16(localHeader, 20);
  pushUint16(localHeader, 0);
  pushUint16(localHeader, 0);
  pushUint16(localHeader, 0);
  pushUint16(localHeader, 0);
  pushUint32(localHeader, 0);
  pushUint32(localHeader, dataBytes.length);
  pushUint32(localHeader, dataBytes.length);
  pushUint16(localHeader, fileNameBytes.length);
  pushUint16(localHeader, 0);

  const centralDirectory = [];
  pushUint32(centralDirectory, 0x02014b50);
  pushUint16(centralDirectory, 20);
  pushUint16(centralDirectory, 20);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint32(centralDirectory, 0);
  pushUint32(centralDirectory, dataBytes.length);
  pushUint32(centralDirectory, dataBytes.length);
  pushUint16(centralDirectory, fileNameBytes.length);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint16(centralDirectory, 0);
  pushUint32(centralDirectory, 0);
  pushUint32(centralDirectory, 0);

  const centralDirectoryOffset = localHeader.length + fileNameBytes.length + dataBytes.length;
  const centralDirectorySize = centralDirectory.length + fileNameBytes.length;
  const entryCount = options.entryCountOverride ?? 1;

  const eocd = [];
  pushUint32(eocd, 0x06054b50);
  pushUint16(eocd, 0);
  pushUint16(eocd, 0);
  pushUint16(eocd, entryCount);
  pushUint16(eocd, entryCount);
  pushUint32(eocd, centralDirectorySize);
  pushUint32(eocd, centralDirectoryOffset);
  pushUint16(eocd, 0);

  return Uint8Array.from([
    ...localHeader,
    ...fileNameBytes,
    ...dataBytes,
    ...centralDirectory,
    ...fileNameBytes,
    ...eocd
  ]).buffer;
}

test('ruby converts explicit notation and escapes html', () => {
  const html = convertAozoraRubyToHtml('｜私《わたし》<b>');
  assert.equal(html, '<ruby>私<rt>わたし</rt></ruby>&lt;b&gt;');
});

test('ruby keeps lineage prefix outside implicit ruby base', () => {
  const html = convertAozoraRubyToHtml('子規庵《しきあん》');
  assert.equal(html, '子<ruby>規庵<rt>しきあん</rt></ruby>');
});

test('legacy ruby repair splits lineage prefix', () => {
  const html = repairAozoraLegacyRubyHtml('<ruby>子規庵<rt>しきあん</rt></ruby>');
  assert.equal(html, '子<ruby>規庵<rt>しきあん</rt></ruby>');
});

test('emphasis converts adjacent bouten notes', () => {
  const html = convertAozoraEmphasisToHtml('言葉［＃「言葉」に傍点］');
  assert.match(html, /class="emphasis-dot"/u);
  assert.match(html, /filled dot/u);
  assert.match(html, />言葉</u);
});

test('gaiji resolves unicode and plane row cell references', () => {
  assert.equal(replaceAozoraGaijiNotation('※［＃「呭」、U+546D、1-84-77］'), '呭');
  assert.equal(replaceAozoraGaijiNotation('※［＃二の字点、1-2-22］'), '〻');
});

test('headings render outline metadata and heading markup', () => {
  const rendered = renderAozoraBodyWithHeadings('序\n［＃「序」は中見出し］\n本文です。', fragmentText);
  assert.equal(rendered.outline.length, 1);
  assert.equal(rendered.outline[0].title, '序');
  assert.match(rendered.html, /data-heading-id="heading-1"/u);
});

test('layout repair wraps leading layout notes into lightweight spans', () => {
  const repaired = repairAozoraLayoutNotesInHtml('［＃地付き］終わり');
  assert.match(repaired, /aozora-layout-line/u);
  assert.match(repaired, /aozora-layout-bottom/u);
});

test('preview derivation keeps outline fragment indices and readable metadata', () => {
  const preview = derivePreviewFromText([
    '作品名',
    '著者名',
    '',
    '序',
    '［＃「序」は中見出し］',
    '｜私《わたし》は本文です。'
  ].join('\n'), 'Shift_JIS');

  assert.equal(preview.title, '作品名');
  assert.equal(preview.author, '著者名');
  assert.deepEqual(preview.sourceTitleLines, ['作品名', '著者名']);
  assert.equal(preview.textFragmentCount > 0, true);
  assert.equal(preview.outline.length, 1);
  assert.equal(preview.outline[0].fragmentIndex, 1);
});

test('outline jump helper reuses work visible/focus routing', () => {
  const href = buildWorkOutlineHash('work-1', {
    fragmentId: 'work-1-fragment-0007',
    fragmentIndex: 7
  }, 5);
  assert.equal(href, '#/work/work-1?visible=7&focus=work-1-fragment-0007');

  const earlyHref = buildWorkOutlineHash('work-1', {
    fragmentId: 'work-1-fragment-0002',
    fragmentIndex: 2
  }, 5);
  assert.equal(earlyHref, '#/work/work-1?visible=5&focus=work-1-fragment-0002');

  assert.equal(buildWorkOutlineHash('work-1', { fragmentIndex: 3 }, 5), '');
});

test('work end jump helper targets the page-bottom marker', () => {
  const href = buildWorkEndHash('work-1', 12, 5);
  assert.equal(href, '#/work/work-1?visible=12&focus=work-end-marker');

  const shortHref = buildWorkEndHash('work-1', 3, 5);
  assert.equal(shortHref, '#/work/work-1?visible=5&focus=work-end-marker');

  assert.equal(buildWorkEndHash('work-1', 0, 5), '');
});

test('zip importer extracts a single stored txt file', async () => {
  const archive = buildSingleFileStoreZip('sample.txt', '青空本文');
  const extracted = await extractAozoraTxtFromZip(archive);
  assert.equal(extracted.fileName, 'sample.txt');
  assert.equal(new TextDecoder('utf-8').decode(extracted.bytes), '青空本文');
});

test('zip importer rejects multi entry archives', async () => {
  const archive = buildSingleFileStoreZip('sample.txt', '青空本文', { entryCountOverride: 2 });
  await assert.rejects(
    () => extractAozoraTxtFromZip(archive),
    /Only single-file Aozora ZIP archives are supported\./u
  );
});

test('export helpers build current payload shape and download name', () => {
  const payload = createExportPayload({ works: [{ id: 'work-1' }] });
  assert.equal(payload.version, 1);
  assert.equal(Number.isNaN(Date.parse(payload.exportedAt)), false);
  assert.deepEqual(payload.data, { works: [{ id: 'work-1' }] });
  assert.equal(buildDownloadName('2026-06-17T09:19:28.000Z'), 'dopagaki-bunko-export-2026-06-17T09-19-28-000Z.json');
});

test('import parser fills missing stores and ignores unknown stores', () => {
  const stores = parseImportJson(JSON.stringify({
    data: {
      works: [{ id: 'work-1' }],
      bookmarks: [{ id: 'work-1' }],
      unknown: [{ id: 'ignored' }]
    }
  }));

  assert.deepEqual(stores.works, [{ id: 'work-1' }]);
  assert.deepEqual(stores.bookmarks, [{ id: 'work-1' }]);
  for (const storeName of STORE_NAMES) {
    assert.equal(Array.isArray(stores[storeName]), true);
  }
  assert.equal('unknown' in stores, false);
});

test('bookmark canonicalization keeps the latest entry per work', () => {
  const fragments = [
    { id: 'work-a-fragment-0001', workId: 'work-a', index: 1 },
    { id: 'work-a-fragment-0002', workId: 'work-a', index: 2 },
    { id: 'work-b-fragment-0001', workId: 'work-b', index: 1 }
  ];
  const records = [
    { id: 'old-a', fragmentId: 'work-a-fragment-0001', savedAt: '2026-06-17T09:00:00.000Z' },
    { id: 'new-a', fragmentId: 'work-a-fragment-0002', savedAt: '2026-06-17T10:00:00.000Z' },
    { id: 'only-b', fragmentId: 'work-b-fragment-0001', createdAt: '2026-06-17T08:00:00.000Z' }
  ];

  const canonical = canonicalizeBookmarkRecords(records, fragments);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].workId, 'work-a');
  assert.equal(canonical[0].fragmentId, 'work-a-fragment-0002');
  assert.equal(canonical[1].workId, 'work-b');
  assert.equal(sameBookmarkRecords(canonical, canonical.map((item) => ({ ...item }))), true);
});

test('initial app state starts with empty collections and search batch size', () => {
  const state = createInitialAppState();
  assert.deepEqual(state.works, []);
  assert.equal(state.likes instanceof Set, true);
  assert.equal(state.aozoraCatalogVisibleCount, 25);
  assert.equal(state.workLoadMode, 'auto');
});

test('compact Aozora catalog payload expands to searchable records', () => {
  const payload = buildAozoraCatalogPayload([{
    id: '000001',
    title: '作品名',
    titleReading: 'さくひんめい',
    author: '著者名',
    authorReading: 'ちょしゃめい',
    cardUrl: 'https://example.test/card.html',
    textZipUrl: 'https://example.test/text.zip',
    kanaType: '新字新仮名',
    copyrightWarning: true
  }], 'https://example.test/catalog.zip', '2026-06-17T00:00:00.000Z');

  assert.equal(payload.version, 2);
  assert.equal(payload.format, 'array-v1');
  assert.equal(Array.isArray(payload.records[0]), true);

  const normalized = normalizeAozoraCatalogPayload(payload);
  assert.equal(normalized.records[0].id, '000001');
  assert.equal(normalized.records[0].workId, '000001');
  assert.equal(normalized.records[0].title, '作品名');
  assert.equal(normalized.records[0].copyrightWarning, true);
  assert.equal(normalized.meta.recordCount, 1);
});

test('return link labels match current route semantics', () => {
  assert.equal(returnLinkLabel('#/'), 'ホームTLへ戻る');
  assert.equal(returnLinkLabel('#/collection/likes'), 'ふせん一覧へ戻る');
  assert.equal(returnLinkLabel('#/work/work-1?visible=24'), '作品TLへ戻る');
});

let failures = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`${failures} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`${tests.length} test(s) passed.`);
}
