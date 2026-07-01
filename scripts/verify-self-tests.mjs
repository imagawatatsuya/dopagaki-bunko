import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { convertAozoraRubyToHtml, repairAozoraLegacyRubyHtml } from '../src/aozora-ruby.js';
import { convertAozoraEmphasisToHtml } from '../src/aozora-emphasis.js';
import { replaceAozoraGaijiNotation } from '../src/aozora-gaiji.js';
import { renderAozoraBodyWithHeadings, repairAozoraLayoutNotesInHtml } from '../src/aozora-headings.js';
import { derivePreviewFromText } from '../src/import-preview.js';
import { extractAozoraTxtFromZip } from '../src/aozora-zip-importer.js';
import { buildAozoraCatalogPayload, normalizeAozoraCatalogPayload, normalizeAozoraTextZipUrl } from '../src/aozora-catalog.js';
import { SEARCH_SORT_MODES, searchAozoraCatalog, searchWorkRecords } from '../src/aozora-search.js';
import { createExportPayload, buildDownloadName, parseImportJson } from '../src/export-import.js';
import { STORE_NAMES, assertStoreCountsEmpty } from '../src/db.js';
import { fragmentText } from '../src/fragmenter.js';
import { buildWorkEndHash, buildWorkOutlineHash, parseSearchRouteIntent } from '../src/router.js';
import { normalizeConverterBaseUrl } from '../src/remote-import.js';
import { createAppData } from '../src/app-data.js';
import {
  canonicalizeBookmarkRecords,
  normalizeHeadingBreakKinds,
  sameBookmarkRecords,
  sliceWorkFragmentsForVisibleCount
} from '../src/state.js';
import { createInitialAppState } from '../src/app-state.js';
import { libraryDeleteScopeLabel, returnLinkLabel } from '../src/renderer-shared.js';
import { buildImportedWorkSavePlan, createSearchActions, findMatchingImportedWork, shouldTreatOpenedWindowAsStalled } from '../src/app-actions.js';
import { aozoraSearchResultsMarkup, errorBodyMarkup, readerActionStatusMarkup, searchImportSheetMarkup, searchPreviewMarkup, settingsBodyMarkup } from '../src/views.js';

const tests = [];
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 0;
};
globalThis.document = {
  querySelector: () => null
};

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

test('wrapped heading tags map large medium and small headings into outline levels', () => {
  const rendered = renderAozoraBodyWithHeadings([
    '［＃大見出し］上巻［＃大見出し終わり］',
    '［＃中見出し］登場人物紹介［＃中見出し終わり］',
    '［＃小見出し］その一［＃小見出し終わり］'
  ].join('\n'), fragmentText);

  assert.deepEqual(
    rendered.outline.map((entry) => ({ title: entry.title, level: entry.level })),
    [
      { title: '上巻', level: 1 },
      { title: '登場人物紹介', level: 2 },
      { title: 'その一', level: 3 }
    ]
  );
});

test('heading and following body split into separate fragments without a blank line', () => {
  const rendered = renderAozoraBodyWithHeadings([
    '［＃中見出し］わたしの黒歴史２［＃中見出し終わり］',
    '魔が差して芸能界入りを目指してから、ずいぶんと長い時間が経っていた。'
  ].join('\n'), fragmentText);
  const textFragments = rendered.fragments.filter((fragment) => fragment.type === 'fragment');
  const breaks = rendered.fragments.filter((fragment) => fragment.type === 'break');

  assert.equal(textFragments.length, 2);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].breakKind, 'heading');
  assert.match(textFragments[0].displayHtml, /aozora-heading/u);
  assert.equal(
    textFragments[1].displayHtml,
    '魔が差して芸能界入りを目指してから、ずいぶんと長い時間が経っていた。'
  );
});

test('legacy heading break records are normalized on load', () => {
  const normalized = normalizeHeadingBreakKinds([
    {
      id: 'work-1-fragment-0001',
      workId: 'work-1',
      type: 'fragment',
      sequence: 1,
      index: 1,
      displayHtml: '<span class="aozora-heading aozora-heading-level-2" data-heading-id="heading-1">見出し</span>',
      plainText: '見出し'
    },
    {
      id: 'work-1-break-0002',
      workId: 'work-1',
      type: 'break',
      sequence: 2,
      index: 2,
      breakCount: 2,
      displayHtml: '',
      plainText: ''
    }
  ]);

  assert.equal(normalized[1].breakKind, 'heading');
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

test('search import preview renders only the first four fragments', () => {
  const markup = searchPreviewMarkup({
    title: '作品名',
    author: '著者名',
    textFragmentCount: 6,
    encoding: 'Shift_JIS',
    fragments: Array.from({ length: 6 }, (_, index) => ({
      type: 'fragment',
      index: index + 1,
      displayHtml: `本文${index + 1}`
    }))
  }, '');

  assert.match(markup, /断片 4/u);
  assert.doesNotMatch(markup, /断片 5/u);
  assert.match(markup, /data-search-preview tabindex="-1"/u);
  assert.match(markup, /aria-labelledby="search-preview-title"/u);
});

test('queued PC import preview shows remaining works and advances after save', () => {
  const markup = searchPreviewMarkup({
    title: '更新作品',
    author: '著者名',
    textFragmentCount: 1,
    encoding: 'UTF-8',
    bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
    bridgeQueueRemaining: 2,
    isExistingWorkUpdate: true,
    libraryWorkCountAtImport: 5,
    fragments: [{
      type: 'fragment',
      index: 1,
      displayHtml: '本文'
    }]
  }, '');

  assert.match(markup, /残り 2件/u);
  assert.match(markup, /このブラウザの本棚: 5作品/u);
  assert.match(markup, />更新して次へ</u);
});

test('last queued PC import preview labels the final update', () => {
  const markup = searchPreviewMarkup({
    title: '最終作品',
    author: '著者名',
    textFragmentCount: 1,
    encoding: 'UTF-8',
    bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
    bridgeQueueRemaining: 0,
    isExistingWorkUpdate: true,
    libraryWorkCountAtImport: 5,
    fragments: [{
      type: 'fragment',
      index: 1,
      displayHtml: '本文'
    }]
  }, '');

  assert.match(markup, /この作品が最後です/u);
  assert.match(markup, />更新して完了</u);
});

test('large import disables preview actions while saving', () => {
  const markup = searchPreviewMarkup({
    title: '大長編',
    author: '著者名',
    textFragmentCount: 8000,
    encoding: 'UTF-8',
    bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
    bridgeQueueRemaining: 0,
    isExistingWorkUpdate: true,
    importSaveInProgress: true,
    fragments: [{
      type: 'fragment',
      index: 1,
      displayHtml: '本文'
    }]
  }, '');

  assert.match(markup, /aria-busy="true"/u);
  assert.match(markup, /8000断片を更新しています/u);
  assert.match(markup, /もう一度押したりしないでください/u);
  assert.match(markup, /data-search-action="save-imported-work" disabled>更新しています…/u);
  assert.match(markup, /data-search-action="clear-preview" disabled/u);
});

test('queued PC import warns when the browser library is empty and uses save wording', () => {
  const markup = searchPreviewMarkup({
    title: '新規作品',
    author: '著者名',
    textFragmentCount: 1,
    encoding: 'UTF-8',
    bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
    bridgeQueueRemaining: 1,
    isExistingWorkUpdate: false,
    libraryWorkCountAtImport: 0,
    fragments: [{
      type: 'fragment',
      index: 1,
      displayHtml: '本文'
    }]
  }, '');

  assert.match(markup, /このブラウザの本棚は0件/u);
  assert.match(markup, /以前の作品があるはずなら、保存せず/u);
  assert.match(markup, />保存して次へ</u);
  assert.doesNotMatch(markup, />更新して次へ</u);
});

test('search import sheet exposes url, paste, file, and bridge import paths together', () => {
  const markup = searchImportSheetMarkup({
    isOpen: true,
    remoteImportUrl: '',
    importTextDraft: '作品名\n著者名\n\n本文です。',
    converterBaseUrl: 'http://192.168.0.10:8765'
  });

  assert.match(markup, /TXT 公開URL/u);
  assert.match(markup, /https:\/\/ ではじまる TXT URL を入力/u);
  assert.match(markup, /URLのTXTを読む/u);
  assert.match(markup, /TXT を貼り付ける/u);
  assert.match(markup, /貼り付け内容を読む/u);
  assert.match(markup, /作品名\n著者名/u);
  assert.match(markup, /ZIP または TXT を選ぶ/u);
  assert.match(markup, /PCからプレビューを開く/u);
  assert.match(markup, /http:\/\/192\.168\.0\.10:8765/u);
  assert.match(markup, /works\/作品名\.txt/u);
  assert.match(markup, /PCからプレビューを開く/u);
  assert.match(markup, /PCのURLだけなら作品一覧/u);
  assert.match(markup, /クリックまたはタップ。ドラッグ&ドロップでも追加できます。/u);
  assert.doesNotMatch(markup, /上のボタン/u);
  assert.doesNotMatch(markup, /data-search-action="pick-aozora-zip"/u);
});

function createSearchActionsForTest(state, options = {}) {
  const savedRecords = [];
  const bridgeAcks = [];
  const actions = createSearchActions({
    state,
    renderSearch: () => {},
    readFileAsArrayBuffer: async () => new ArrayBuffer(0),
    extractAozoraTxtFromZip,
    buildAozoraCatalogMeta: () => ({}),
    normalizeAozoraCatalogPayload: (payload) => payload,
    decodeAozoraText: (bytes) => ({
      text: new TextDecoder().decode(bytes),
      encoding: 'utf-8'
    }),
    derivePreviewFromText,
    searchAozoraCatalog,
    searchWorkRecords,
    converterBaseUrlSettingId: 'setting:converter-base-url',
    normalizeConverterBaseUrl,
    AOZORA_CATALOG_META_ID: 'catalog-meta',
    AOZORA_CATALOG_ASSET_PATH: './data/aozora-catalog.json.gz',
    getAllRecords: async () => [],
    getRecord: async (storeName, id) => {
      return options.getRecord ? options.getRecord(storeName, id) : undefined;
    },
    applyRecordMutations: async ({ putRecords = {} }) => {
      if (options.failMutations) {
        throw new Error('IndexedDB transaction failed.');
      }
      for (const [storeName, records] of Object.entries(putRecords)) {
        for (const record of records) {
          savedRecords.push({ storeName, record });
        }
      }
    },
    clearStore: async () => {},
    deleteRecord: async () => {},
    putRecord: async (storeName, record) => {
      savedRecords.push({ storeName, record });
    },
    putRecords: async (storeName, records) => {
      for (const record of records) {
        savedRecords.push({ storeName, record });
      }
    },
    loadStateFromDb: async () => {},
    sendBridgeImportAck: async (ackUrl, ackPayload, bridgeWindow) => {
      bridgeAcks.push({ ackUrl, ackPayload, bridgeWindow });
      if (options.failBridgeAck) {
        throw new Error('ack failed');
      }
    }
  });

  return { actions, savedRecords, bridgeAcks };
}

test('pasted text draft is cleared after saving a pasted preview', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const pastedText = '貼り付け作品\n作者\n\n本文です。';

  await actions.handleSearchAction('preview-pasted-text', {
    pastedText
  });

  assert.equal(state.importPreview.sourceType, 'pasted-text');
  assert.equal(state.importTextDraft, pastedText);

  await actions.handleSearchAction('save-imported-work');

  assert.equal(state.importPreview, null);
  assert.equal(state.importTextDraft, '');
});

test('bridge import does not replace an unsaved pasted draft', async () => {
  const state = createInitialAppState();
  state.importTextDraft = '未保存の手入力\n作者\n\n消さない本文です。';
  const { actions } = createSearchActionsForTest(state);

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      text: 'PC作品\n作者\n\nPCから受け取った本文です。'
    }
  });

  assert.equal(state.importPreview.sourceType, 'bridge-import');
  assert.equal(state.importTextDraft, '未保存の手入力\n作者\n\n消さない本文です。');

  await actions.handleSearchAction('save-imported-work');

  assert.equal(state.importTextDraft, '未保存の手入力\n作者\n\n消さない本文です。');
});

test('duplicate bridge delivery does not recreate an import preview', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const bridgePayload = {
    type: 'dopagaki-bridge-import-v1',
    bridgeImportId: 'source|generated-at|txt',
    text: 'PC作品\n作者\n\nPCから受け取った本文です。'
  };

  await actions.handleSearchAction('import-bridge-message', { bridgePayload });
  await actions.handleSearchAction('save-imported-work');
  assert.equal(state.importPreview, null);

  await actions.handleSearchAction('import-bridge-message', { bridgePayload });
  assert.equal(state.importPreview, null);
});

test('persisted completed delivery replays its ack without recreating an import preview', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks } = createSearchActionsForTest(state, {
    getRecord: async (storeName, id) => {
      if (storeName === 'importReceipts' && id === 'delivery-completed') {
        return { id, status: 'completed' };
      }
      return undefined;
    }
  });

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      bridgeImportId: 'delivery-completed',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: {
        deliveryId: 'delivery-completed',
        sourceUrl: 'https://example.com/completed',
        txtPath: 'works/completed.txt'
      },
      bridgeSourceWindow: { closed: false },
      text: '再送作品\n作者\n\n再送された本文です。'
    }
  });

  assert.equal(state.importPreview, null);
  assert.equal(bridgeAcks.length, 1);
  assert.equal(bridgeAcks[0].ackPayload.deliveryId, 'delivery-completed');
});

test('invalid bridge delivery is persisted and acknowledged as failed', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks, savedRecords } = createSearchActionsForTest(state);
  const bridgeWindow = { closed: false };

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      bridgeImportId: 'delivery-failed',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: {
        deliveryId: 'delivery-failed',
        sourceUrl: 'https://example.com/failed',
        txtPath: 'works/failed.txt'
      },
      bridgeSourceWindow: bridgeWindow,
      text: ''
    }
  });

  assert.equal(state.importPreview, null);
  assert.equal(
    savedRecords.some(({ storeName, record }) => (
      storeName === 'importReceipts'
      && record.id === 'delivery-failed'
      && record.status === 'failed'
    )),
    true
  );
  assert.equal(bridgeAcks[0].ackPayload.outcome, 'failed');
  assert.match(bridgeAcks[0].ackPayload.error, /本文を受け取れません/u);
});

test('retryable database failure does not permanently reject a delivery', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks, savedRecords } = createSearchActionsForTest(state, {
    getRecord: async () => {
      throw new Error('IndexedDB upgrade is still blocked by another dopagaki-bunko tab.');
    }
  });

  const result = await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      bridgeImportId: 'delivery-retryable',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: { deliveryId: 'delivery-retryable' },
      bridgeSourceWindow: { closed: false },
      text: '再試行作品\n作者\n\n本文です。'
    }
  });

  assert.equal(result, 'retryable');
  assert.equal(bridgeAcks.length, 0);
  assert.equal(savedRecords.some(({ record }) => record.status === 'failed'), false);
  assert.match(state.importWorkStatus, /ほかのdopagaki-bunkoタブを閉じて/u);
});

test('bridge receipt ack is sent only after import processing finishes', () => {
  const source = readFileSync(new URL('../src/app-runtime.js', import.meta.url), 'utf8');
  const handlerStart = source.indexOf('async function handleBridgeMessage(event)');
  const importAwait = source.indexOf("await handleSearchAction('import-bridge-message'", handlerStart);
  const receiptAck = source.indexOf("type: 'dopagaki-bridge-received-v1'", handlerStart);

  assert.equal(handlerStart >= 0, true);
  assert.equal(importAwait > handlerStart, true);
  assert.equal(receiptAck > importAwait, true);
});

test('save database failure keeps the preview retryable and does not send a failed ack', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks } = createSearchActionsForTest(state, {
    failMutations: true
  });

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      bridgeImportId: 'delivery-save-retry',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: { deliveryId: 'delivery-save-retry' },
      bridgeSourceWindow: { closed: false },
      text: '保存再試行作品\n作者\n\n本文です。'
    }
  });
  await actions.handleSearchAction('save-imported-work');

  assert.equal(state.importPreview?.deliveryId, 'delivery-save-retry');
  assert.equal(bridgeAcks.length, 0);
  assert.match(state.importWorkStatus, /保存に失敗しました/u);
});

test('window name import does not fill the pasted text draft', () => {
  const state = createInitialAppState();
  state.importTextDraft = '未保存の手入力\n作者\n\n保持する本文です。';
  const { actions } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;

  globalThis.window = {
    name: JSON.stringify({
      type: 'dopagaki-window-name-import-v1',
      text: '受け渡し作品\n作者\n\nwindow.nameから受け取った本文です。'
    })
  };

  try {
    assert.equal(actions.applySearchRouteIntent({ shouldConsumeWindowNameImport: true }), true);
    assert.equal(globalThis.window.name, '');
    assert.equal(state.importPreview.sourceType, 'window-name-import');
    assert.equal(state.importTextDraft, '未保存の手入力\n作者\n\n保持する本文です。');
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test('successful imported text is kept separate from the visible pasted draft', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const importedText = 'PC作品\n作者\n\nPCから受け取った本文です。';

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      text: importedText
    }
  });

  assert.equal(state.importPreview.sourceType, 'bridge-import');
  assert.equal(state.importTextLastImported, importedText);
  assert.equal(state.importTextDraft, '');

  await actions.handleSearchAction('save-imported-work');
  await actions.handleSearchAction('open-import-sheet');

  assert.equal(state.importPreview, null);
  assert.equal(state.importSheetOpen, true);
  assert.equal(state.importTextDraft, '');
});

test('bridge import save acknowledges the sender list entry after saving', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks, savedRecords } = createSearchActionsForTest(state);
  const bridgeWindow = { closed: false };

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      sourceUrl: 'https://example.com/source',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: {
        deliveryId: 'delivery-1',
        sourceUrl: 'https://example.com/source',
        txtPath: 'works/source.txt'
      },
      bridgeSourceWindow: bridgeWindow,
      text: 'PC作品\n作者\n\nPCから受け取った本文です。'
    }
  });

  await actions.handleSearchAction('save-imported-work');

  assert.deepEqual(bridgeAcks, [
    {
      ackUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      ackPayload: {
        deliveryId: 'delivery-1',
        sourceUrl: 'https://example.com/source',
        txtPath: 'works/source.txt'
      },
      bridgeWindow
    }
  ]);
  assert.equal(
    savedRecords.some(({ storeName, record }) => (
      storeName === 'importReceipts'
      && record.id === 'delivery-1'
      && record.status === 'completed'
    )),
    true
  );
});

test('bridge ack failure keeps a clear retry action after the work is saved', async () => {
  const state = createInitialAppState();
  const { actions, savedRecords } = createSearchActionsForTest(state, {
    failBridgeAck: true
  });

  await actions.handleSearchAction('import-bridge-message', {
    bridgePayload: {
      type: 'dopagaki-bridge-import-v1',
      bridgeImportId: 'delivery-ack-retry',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: {
        deliveryId: 'delivery-ack-retry',
        sourceUrl: 'https://example.com/ack-retry',
        txtPath: 'works/ack-retry.txt'
      },
      bridgeSourceWindow: { closed: true },
      bridgeQueueRemaining: 2,
      text: 'ACK再試行作品\n作者\n\n本文です。'
    }
  });
  await actions.handleSearchAction('save-imported-work');

  assert.equal(state.importPreview, null);
  assert.equal(state.importWorkNoticeTone, 'success');
  assert.equal(state.pendingBridgeAck?.queueRemaining, 2);
  assert.match(state.importWorkStatus, /作品の更新は完了しました/u);
  assert.equal(
    savedRecords.some(({ storeName, record }) => (
      storeName === 'importReceipts'
      && record.id === 'delivery-ack-retry'
      && record.status === 'completed'
      && record.ackUrl.includes('__dopagaki_ack__')
    )),
    true
  );
});

test('manual bridge ack retry clears the pending action after navigation succeeds', async () => {
  const state = createInitialAppState();
  state.pendingBridgeAck = {
    ackUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
    ackPayload: { deliveryId: 'delivery-manual-retry' },
    bridgeWindow: { closed: false },
    queueRemaining: 1
  };
  const { actions, bridgeAcks } = createSearchActionsForTest(state);

  await actions.handleSearchAction('retry-bridge-ack');

  assert.equal(bridgeAcks.length, 1);
  assert.equal(state.pendingBridgeAck, null);
  assert.match(state.importWorkStatus, /次の作品を準備しています/u);
});

test('window name import save acknowledges the sender list entry after saving', async () => {
  const state = createInitialAppState();
  const { actions, bridgeAcks } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;

  globalThis.window = {
    name: JSON.stringify({
      type: 'dopagaki-window-name-import-v1',
      sourceUrl: 'https://example.com/source',
      bridgeAckUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
      bridgeAckPayload: {
        sourceUrl: 'https://example.com/source',
        txtPath: 'works/source.txt'
      },
      text: '受け渡し作品\n作者\n\nwindow.nameから受け取った本文です。'
    })
  };

  try {
    assert.equal(actions.applySearchRouteIntent({ shouldConsumeWindowNameImport: true }), true);
    await actions.handleSearchAction('save-imported-work');

    assert.deepEqual(bridgeAcks, [
      {
        ackUrl: 'http://192.168.0.10:8765/__dopagaki_ack__',
        ackPayload: {
          sourceUrl: 'https://example.com/source',
          txtPath: 'works/source.txt'
        },
        bridgeWindow: null
      }
    ]);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test('opening the import sheet clears a draft that matches the last imported text', async () => {
  const state = createInitialAppState();
  state.importTextDraft = '成功済み作品\n作者\n\n残してはいけない本文です。';
  state.importTextLastImported = state.importTextDraft;
  const { actions } = createSearchActionsForTest(state);

  await actions.handleSearchAction('open-import-sheet', {
    pastedText: 'クリック時の値は新規オープンでは採用しない'
  });

  assert.equal(state.importSheetOpen, true);
  assert.equal(state.importTextDraft, '');
});

test('converter import helper normalizes base urls', () => {
  assert.equal(normalizeConverterBaseUrl(' http://192.168.0.10:8765/ '), 'http://192.168.0.10:8765');
});

test('converter bridge accepts exact works txt urls', async () => {
  const state = createInitialAppState();
  const { actions, savedRecords } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  let opened = null;

  globalThis.location = {
    href: 'https://imagawatatsuya.github.io/dopagaki-bunko/#/search'
  };
  globalThis.window = {
    open: (url, target) => {
      opened = { url, target };
      return {};
    }
  };

  try {
    await actions.handleSearchAction('open-converter-bridge', {
      baseUrl: 'http://192.168.0.10:8765/works/serial-work.txt'
    });

    assert.equal(savedRecords.at(-1)?.record?.value, 'http://192.168.0.10:8765/works/serial-work.txt');
    assert.equal(opened?.target, 'dopagaki-delivery');
    assert.match(opened?.url ?? '', /txt=http%3A%2F%2F192\.168\.0\.10%3A8765%2Fworks%2Fserial-work\.txt/u);
    assert.match(state.importWorkStatus, /PC上の中継ページを別タブで開いています。/u);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});

test('converter bridge opens works list when given only the pc base url', async () => {
  const state = createInitialAppState();
  const { actions, savedRecords } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  let opened = null;

  globalThis.location = {
    href: 'https://imagawatatsuya.github.io/dopagaki-bunko/#/search'
  };
  globalThis.window = {
    open: (url, target) => {
      opened = { url, target };
      return {};
    }
  };

  try {
    await actions.handleSearchAction('open-converter-bridge', {
      baseUrl: 'http://192.168.0.10:8765'
    });

    assert.equal(savedRecords.at(-1)?.record?.value, 'http://192.168.0.10:8765');
    assert.equal(opened?.target, 'dopagaki-delivery');
    assert.equal(opened?.url, 'http://192.168.0.10:8765/dopagaki-import-works.html');
    assert.match(state.importWorkStatus, /PC上の作品一覧を別タブで開いています。/u);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});

test('converter bridge keeps an exact works page url stable', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  let opened = null;

  globalThis.location = {
    href: 'https://imagawatatsuya.github.io/dopagaki-bunko/#/search'
  };
  globalThis.window = {
    open: (url, target) => {
      opened = { url, target };
      return {};
    }
  };

  try {
    await actions.handleSearchAction('open-converter-bridge', {
      baseUrl: 'http://192.168.0.10:8765/dopagaki-import-works.html'
    });

    assert.equal(opened?.target, 'dopagaki-delivery');
    assert.equal(opened?.url, 'http://192.168.0.10:8765/dopagaki-import-works.html');
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});

test('converter bridge treats latest txt as a works-list entrypoint', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  let opened = null;

  globalThis.location = {
    href: 'https://imagawatatsuya.github.io/dopagaki-bunko/#/search'
  };
  globalThis.window = {
    open: (url, target) => {
      opened = { url, target };
      return {};
    }
  };

  try {
    await actions.handleSearchAction('open-converter-bridge', {
      baseUrl: 'http://192.168.0.10:8765/latest.txt'
    });

    assert.equal(opened?.target, 'dopagaki-delivery');
    assert.equal(opened?.url, 'http://192.168.0.10:8765/dopagaki-import-works.html');
    assert.match(state.importWorkStatus, /PC上の作品一覧を別タブで開いています。/u);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});

test('converter bridge rewrites exact works zip urls to txt', async () => {
  const state = createInitialAppState();
  const { actions } = createSearchActionsForTest(state);
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  let opened = null;

  globalThis.location = {
    href: 'https://imagawatatsuya.github.io/dopagaki-bunko/#/search'
  };
  globalThis.window = {
    open: (url, target) => {
      opened = { url, target };
      return {};
    }
  };

  try {
    await actions.handleSearchAction('open-converter-bridge', {
      baseUrl: 'http://192.168.0.10:8765/works/serial-work.zip'
    });

    assert.equal(opened?.target, 'dopagaki-delivery');
    assert.match(opened?.url ?? '', /txt=http%3A%2F%2F192\.168\.0\.10%3A8765%2Fworks%2Fserial-work\.txt/u);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
    if (previousLocation === undefined) {
      delete globalThis.location;
    } else {
      globalThis.location = previousLocation;
    }
  }
});

test('stalled popup detection only flags about blank windows past the timeout', () => {
  assert.equal(
    shouldTreatOpenedWindowAsStalled({ closed: false, location: { href: 'about:blank' } }, 0, 2500, 2600),
    true
  );
  assert.equal(
    shouldTreatOpenedWindowAsStalled({ closed: false, location: { href: 'about:blank' } }, 0, 2500, 1000),
    false
  );
  assert.equal(
    shouldTreatOpenedWindowAsStalled({ closed: false, location: { href: 'http://192.168.0.10:8765/dopagaki-import-works.html' } }, 0, 2500, 2600),
    false
  );
});

test('search route intent opens the import sheet and carries remoteImportUrl', () => {
  const intent = parseSearchRouteIntent('#/search?remoteImportUrl=http%3A%2F%2F192.168.0.10%3A8765%2Flatest.txt');
  assert.equal(intent.path, '#/search');
  assert.equal(intent.shouldOpenImportSheet, true);
  assert.equal(intent.remoteImportUrl, 'http://192.168.0.10:8765/latest.txt');
  assert.equal(intent.shouldConsumeWindowNameImport, false);

  const bridgeIntent = parseSearchRouteIntent('#/search?windowNameImport=1');
  assert.equal(bridgeIntent.shouldOpenImportSheet, false);
  assert.equal(bridgeIntent.shouldConsumeWindowNameImport, true);

  const plainSearchIntent = parseSearchRouteIntent('#/search');
  assert.equal(plainSearchIntent.shouldOpenImportSheet, false);
  assert.equal(plainSearchIntent.remoteImportUrl, '');
  assert.equal(plainSearchIntent.shouldConsumeWindowNameImport, false);
});

test('outline jump helper opens a bounded range around the focused fragment', () => {
  const href = buildWorkOutlineHash('work-1', {
    fragmentId: 'work-1-fragment-0007',
    fragmentIndex: 7
  }, 5);
  assert.equal(href, '#/work/work-1?from=3&visible=7&focus=work-1-fragment-0007');

  const earlyHref = buildWorkOutlineHash('work-1', {
    fragmentId: 'work-1-fragment-0002',
    fragmentIndex: 2
  }, 5);
  assert.equal(earlyHref, '#/work/work-1?visible=5&focus=work-1-fragment-0002');

  const lateHref = buildWorkOutlineHash('work-1', {
    fragmentId: 'work-1-fragment-6500',
    fragmentIndex: 6500
  }, 24);
  assert.equal(lateHref, '#/work/work-1?from=6496&visible=6519&focus=work-1-fragment-6500');

  assert.equal(buildWorkOutlineHash('work-1', { fragmentIndex: 3 }, 5), '');
});

test('work fragment slicing can open a bounded range without materializing its prefix', () => {
  const fragments = Array.from({ length: 7000 }, (_, offset) => ({
    id: `fragment-${offset + 1}`,
    workId: 'work-1',
    index: offset + 1,
    type: 'fragment'
  }));
  const result = sliceWorkFragmentsForVisibleCount(fragments, 'work-1', 6519, 6496);

  assert.equal(result.fragments.length, 24);
  assert.equal(result.fragments[0].id, 'fragment-6496');
  assert.equal(result.fragments.at(-1).id, 'fragment-6519');
  assert.equal(result.shownTextCount, 6519);
  assert.equal(result.firstShownTextIndex, 6496);
});

test('library deletion prompt labels follow the visible reading-status tabs', () => {
  assert.equal(libraryDeleteScopeLabel('reading'), '読書中一覧');
  assert.equal(libraryDeleteScopeLabel('unread'), '未読一覧');
  assert.equal(libraryDeleteScopeLabel('completed'), '読了一覧');
  assert.equal(libraryDeleteScopeLabel('unknown'), '読書中一覧');
});

test('work end jump helper targets the page-bottom marker', () => {
  const href = buildWorkEndHash('work-1', 12, 5);
  assert.equal(href, '#/work/work-1?from=8&visible=12&focus=work-end-marker');

  const shortHref = buildWorkEndHash('work-1', 3, 5);
  assert.equal(shortHref, '#/work/work-1?visible=3&focus=work-end-marker');

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

test('imported work matching prefers aozoraWorkId then normalized sourceUrl', () => {
  const works = [
    { id: 'work-aozora', aozoraWorkId: '123', sourceUrl: 'https://example.test/ignored' },
    { id: 'work-remote', aozoraWorkId: '', sourceUrl: 'https://example.test/novel/1/2/' }
  ];

  assert.equal(findMatchingImportedWork(works, { aozoraWorkId: '123', sourceUrl: '' })?.id, 'work-aozora');
  assert.equal(findMatchingImportedWork(works, { aozoraWorkId: '', sourceUrl: 'https://example.test/novel/1/2?ts=1#preview' })?.id, 'work-remote');
  assert.equal(findMatchingImportedWork(works, { aozoraWorkId: '', sourceUrl: '' }), null);
});

test('imported work save plan updates an existing work and migrates bookmark and likes by fragment index', () => {
  const preview = {
    sourceType: 'remote-url',
    aozoraWorkId: '',
    title: '連載作品',
    author: '作者',
    sourceTitleLines: ['連載作品', '作者'],
    sourceUrl: 'https://example.test/novel/1/2',
    sourceFileName: 'latest.txt',
    textFragmentCount: 3,
    outline: [{ id: 'heading-1', title: '第一章', level: 1, indentStep: 0, fragmentIndex: 1 }],
    fragments: [
      { type: 'fragment', index: 1, plainText: '本文1', displayHtml: '<p data-heading-id="heading-1">本文1</p>' },
      { type: 'fragment', index: 2, plainText: '本文2', displayHtml: '<p>本文2</p>' },
      { type: 'fragment', index: 3, plainText: '本文3', displayHtml: '<p>本文3</p>' }
    ]
  };
  const existingWork = {
    id: 'work-existing',
    createdAt: '2026-06-20T00:00:00.000Z'
  };
  const currentFragments = [
    { id: 'work-existing-fragment-0001', workId: 'work-existing', type: 'fragment', index: 1 },
    { id: 'work-existing-fragment-0002', workId: 'work-existing', type: 'fragment', index: 2 }
  ];
  const currentBookmarkRecords = [{
    id: 'work-existing',
    workId: 'work-existing',
    fragmentId: 'work-existing-fragment-0002',
    fragmentIndex: 2,
    savedAt: '2026-06-20T01:00:00.000Z'
  }];
  const currentLikeRecords = [{
    id: 'work-existing-fragment-0002',
    fragmentId: 'work-existing-fragment-0002',
    savedAt: '2026-06-20T01:05:00.000Z',
    note: 'メモ'
  }];

  const plan = buildImportedWorkSavePlan({
    preview,
    existingWork,
    importedAt: '2026-06-20T02:00:00.000Z',
    currentFragments,
    currentBookmarkRecords,
    currentLikeRecords
  });

  assert.equal(plan.isUpdate, true);
  assert.equal(plan.workRecord.id, 'work-existing');
  assert.equal(plan.workRecord.createdAt, '2026-06-20T00:00:00.000Z');
  assert.equal(plan.fragmentRecords.length, 3);
  assert.equal(plan.workRecord.outline[0].fragmentId, 'work-existing-fragment-0001');
  assert.deepEqual(plan.oldFragmentIds, ['work-existing-fragment-0001', 'work-existing-fragment-0002']);
  assert.equal(plan.migratedBookmarkRecord.fragmentId, 'work-existing-fragment-0002');
  assert.equal(plan.migratedLikeRecords[0].fragmentId, 'work-existing-fragment-0002');
  assert.equal(plan.migratedLikeRecords[0].note, 'メモ');
});

test('initial app state starts with empty collections and search batch size', () => {
  const state = createInitialAppState();
  assert.deepEqual(state.works, []);
  assert.equal(state.likes instanceof Set, true);
  assert.equal(state.aozoraCatalogVisibleCount, 25);
  assert.equal(state.searchScope, 'aozora');
  assert.equal(state.remoteImportUrl, '');
  assert.equal(state.importTextDraft, '');
  assert.equal(state.importTextLastImported, '');
  assert.equal(state.workLoadMode, 'auto');
  assert.equal(state.readerActionStatus, '');
  assert.equal(state.readerActionStatusTone, '');
});

test('app reset clears only user stores and keeps the internal catalog state', async () => {
  const state = createInitialAppState();
  state.aozoraCatalogMeta = { id: 'catalog-meta', recordCount: 1 };
  state.aozoraCatalogRecords = [{ id: 'catalog-1' }];
  const clearedStores = [];
  const appData = createAppData({
    state,
    userStoreNames: STORE_NAMES,
    searchResultsBatchSize: 25,
    workLoadModeSettingId: 'setting:work-load-mode',
    converterBaseUrlSettingId: 'setting:converter-base-url',
    canonicalizeBookmarkRecords: (records) => records,
    applyRecordMutations: async ({ clearStores = [] }) => {
      clearedStores.push(...clearStores);
    },
    clearStore: async (storeName) => {
      clearedStores.push(storeName);
    },
    deleteRecord: async () => {},
    getAllRecords: async () => [],
    getRecord: async () => null,
    listBookmarks: async () => [],
    listLikes: async () => [],
    putRecord: async () => {},
    putRecords: async () => {}
  });

  await appData.clearAllStoresAndResetUi();

  assert.deepEqual(clearedStores, STORE_NAMES);
  assert.equal(clearedStores.includes('aozoraCatalog'), false);
  assert.equal(state.aozoraCatalogRecords.length, 1);
  assert.equal(state.aozoraCatalogMeta.recordCount, 1);
});

test('database transactions subscribe to completion before running requests', () => {
  const source = readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const completionIndex = source.indexOf('const completion = transactionDone(transaction);');
  const callbackIndex = source.indexOf('const result = await callback(stores, transaction);');
  assert.notEqual(completionIndex, -1);
  assert.notEqual(callbackIndex, -1);
  assert.ok(completionIndex < callbackIndex);
  assert.match(source, /IndexedDB transaction timed out/u);
});

test('reset verification rejects any remaining user-store records', () => {
  assert.equal(assertStoreCountsEmpty({
    works: 0,
    fragments: 0,
    likes: 0,
    bookmarks: 0,
    readingStates: 0,
    settings: 0
  }), true);
  assert.throws(
    () => assertStoreCountsEmpty({ works: 1, fragments: 0 }),
    /初期化後も保存データが残っています（works:1）/u
  );
});

test('reset closes the old connection and verifies stores before reporting completion', () => {
  const dbSource = readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const actionsSource = readFileSync(new URL('../src/app-actions.js', import.meta.url), 'utf8');
  assert.match(dbSource, /verifyStoresEmpty[\s\S]*resetOpenState\(\)[\s\S]*\.count\(\)/u);
  const clearIndex = actionsSource.indexOf('await clearAllStores();');
  const verifyIndex = actionsSource.indexOf('await verifyUserStoresEmpty();', clearIndex);
  const completedIndex = actionsSource.indexOf("state.resetStatus = 'アプリを初期化しました。';", verifyIndex);
  assert.ok(clearIndex !== -1 && clearIndex < verifyIndex);
  assert.ok(verifyIndex < completedIndex);
  assert.match(actionsSource, /データが残っている可能性があります/u);
});

test('destructive multi-store operations use the shared atomic mutation path', () => {
  const appDataSource = readFileSync(new URL('../src/app-data.js', import.meta.url), 'utf8');
  const appActionsSource = readFileSync(new URL('../src/app-actions.js', import.meta.url), 'utf8');
  const importSource = readFileSync(new URL('../src/export-import.js', import.meta.url), 'utf8');
  assert.match(appDataSource, /applyRecordMutations\(\{ clearStores: userStoreNames \}\)/u);
  assert.match(appDataSource, /fragments: fragmentIds[\s\S]*likes: fragmentIds/u);
  assert.match(appActionsSource, /deleteRecords: savePlan\.isUpdate/u);
  assert.match(importSource, /clearStores: mode === 'replace' \? STORE_NAMES : \[\]/u);
});

test('home routing does not wait for catalog initialization', () => {
  const runtimeSource = readFileSync(new URL('../src/app-runtime.js', import.meta.url), 'utf8');
  const initializationIndex = runtimeSource.indexOf('const catalogInitialization = initializeAozoraCatalogState();');
  const routeIndex = runtimeSource.indexOf('route();', initializationIndex);
  assert.notEqual(initializationIndex, -1);
  assert.notEqual(routeIndex, -1);
  assert.ok(initializationIndex < routeIndex);
  assert.doesNotMatch(runtimeSource, /await initializeAozoraCatalogState\(\)/u);
});

test('catalog replacement clears and writes records in one atomic mutation', () => {
  const source = readFileSync(new URL('../src/app-actions.js', import.meta.url), 'utf8');
  assert.match(source, /clearStores: \['aozoraCatalog'\][\s\S]*aozoraCatalog: \[\.\.\.payload\.records, metaRecord\]/u);
  assert.doesNotMatch(source, /putRecordsInBatches/u);
});

test('reader action status markup renders only non-empty messages', () => {
  assert.equal(readerActionStatusMarkup('', 'error'), '');
  assert.match(readerActionStatusMarkup('しおり保存に失敗しました: IndexedDB transaction failed.', 'error'), /settings-status-error/u);
  assert.match(readerActionStatusMarkup('しおり保存に失敗しました: IndexedDB transaction failed.', 'error'), /IndexedDB transaction failed/u);
});

test('loading failures and settings show non-destructive iPhone recovery guidance', () => {
  const errorMarkup = errorBodyMarkup('IndexedDB transaction timed out.');
  const settingsMarkup = settingsBodyMarkup({
    exportStatusHtml: '',
    importStatusHtml: '',
    releaseStatusHtml: '',
    readingStatusHtml: '',
    workLoadMode: 'auto',
    resetStatusHtml: '',
    pendingImportMarkup: ''
  });

  assert.match(errorMarkup, /このタブを閉じ/u);
  assert.match(errorMarkup, /アプリを初期化する.*使わない/u);
  assert.match(settingsMarkup, /困ったとき/u);
  assert.match(settingsMarkup, /ブラウザで新しいタブを開きます/u);
  assert.match(settingsMarkup, /表示不良や「準備中」の復旧には使わない/u);
});

test('startup replaces prolonged loading with recovery guidance', () => {
  const source = readFileSync(new URL('../src/app-runtime.js', import.meta.url), 'utf8');
  assert.match(source, /recoveryGuideTimer/u);
  assert.match(source, /このタブを閉じて新しいタブでdopagaki-bunkoを開き直してください/u);
  assert.match(source, /clearTimeout\(recoveryGuideTimer\)/u);
});

test('reset confirmation states that reset is not a recovery action', () => {
  const source = readFileSync(new URL('../src/app-actions.js', import.meta.url), 'utf8');
  const resetFunction = source.slice(
    source.indexOf('async function resetAppData()'),
    source.indexOf('async function handleSettingsAction')
  );
  assert.doesNotMatch(resetFunction, /globalThis\.confirm/u);
  assert.match(source, /resetConfirmationStep = 'backup'/u);
  assert.match(source, /resetConfirmationStep = 'final'/u);
  assert.match(source, /初期化を中止しました/u);
});

test('reset uses backup and final confirmation panels with explicit cancel wording', () => {
  const shared = {
    exportStatusHtml: '',
    importStatusHtml: '',
    releaseStatusHtml: '',
    readingStatusHtml: '',
    workLoadMode: 'auto',
    pendingImportMarkup: ''
  };
  const backupMarkup = settingsBodyMarkup({
    ...shared,
    resetConfirmationStep: 'backup'
  });
  const finalMarkup = settingsBodyMarkup({
    ...shared,
    resetConfirmationStep: 'final'
  });

  assert.match(backupMarkup, /初期化前のバックアップ/u);
  assert.match(backupMarkup, /data-settings-reset-confirmation tabindex="-1"/u);
  assert.match(backupMarkup, /バックアップを書き出す/u);
  assert.match(backupMarkup, /バックアップ済みなので次へ/u);
  assert.match(backupMarkup, /初期化を中止する/u);
  assert.doesNotMatch(backupMarkup, />キャンセル</u);
  assert.match(finalMarkup, /初期化の最終確認/u);
  assert.match(finalMarkup, /data-settings-reset-confirmation tabindex="-1"/u);
  assert.match(finalMarkup, /確認したので初期化する/u);
  assert.match(finalMarkup, /初期化を中止する/u);
});

test('reset confirmation actions focus and scroll the newly rendered panel', () => {
  const source = readFileSync(new URL('../src/app-actions.js', import.meta.url), 'utf8');
  assert.match(source, /function focusResetConfirmationPanel\(\)/u);
  assert.match(source, /querySelector\('\[data-settings-reset-confirmation\]'\)/u);
  assert.match(source, /panel\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(source, /behavior: 'smooth'/u);
  assert.match(source, /renderSettings\(\);\s*focusResetConfirmationPanel\(\);/u);
});

test('work reading starts only after reaching fragment 3', async () => {
  const state = createInitialAppState();
  const savedRecords = [];
  const appData = createAppData({
    state,
    userStoreNames: [],
    searchResultsBatchSize: 25,
    workLoadModeSettingId: 'setting:work-load-mode',
    converterBaseUrlSettingId: 'setting:converter-base-url',
    canonicalizeBookmarkRecords: (records) => records,
    applyRecordMutations: async () => {},
    clearStore: async () => {},
    deleteRecord: async () => {},
    getAllRecords: async () => [],
    getRecord: async () => null,
    listBookmarks: async () => [],
    listLikes: async () => [],
    putRecord: async (storeName, record) => {
      savedRecords.push({ storeName, record });
    },
    putRecords: async () => {}
  });

  appData.ensureWorkMarkedReadingAtIndex('work-1', 1);
  appData.ensureWorkMarkedReadingAtIndex('work-1', 2);
  await Promise.resolve();
  assert.equal(savedRecords.length, 0);
  assert.equal(state.readingStateRecords.length, 0);

  appData.ensureWorkMarkedReadingAtIndex('work-1', 3);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(savedRecords.length, 1);
  assert.equal(savedRecords[0].storeName, 'readingStates');
  assert.equal(savedRecords[0].record.workId, 'work-1');
  assert.equal(savedRecords[0].record.status, 'reading');
  assert.equal(state.readingStateRecords[0].workId, 'work-1');

  appData.ensureWorkMarkedReadingAtIndex('work-1', 5);
  await Promise.resolve();
  assert.equal(savedRecords.length, 1);
});

test('resetting a work to unread clears reading state and bookmark but keeps likes', async () => {
  const state = createInitialAppState();
  state.readingStateRecords = [{
    id: 'work-1',
    workId: 'work-1',
    status: 'completed',
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z'
  }];
  state.bookmarkRecords = [{
    id: 'work-1',
    workId: 'work-1',
    fragmentId: 'work-1-fragment-0002',
    fragmentIndex: 2,
    savedAt: '2026-06-20T00:00:00.000Z'
  }];
  state.bookmarks = new Set(['work-1-fragment-0002']);
  state.likeRecords = [{
    id: 'work-1-fragment-0003',
    fragmentId: 'work-1-fragment-0003',
    savedAt: '2026-06-20T00:00:00.000Z',
    note: '残す'
  }];
  state.likes = new Set(['work-1-fragment-0003']);
  const deletedRecords = [];
  const appData = createAppData({
    state,
    userStoreNames: [],
    searchResultsBatchSize: 25,
    workLoadModeSettingId: 'setting:work-load-mode',
    converterBaseUrlSettingId: 'setting:converter-base-url',
    canonicalizeBookmarkRecords: (records) => records,
    applyRecordMutations: async ({ deleteRecords = {} }) => {
      for (const [storeName, ids] of Object.entries(deleteRecords)) {
        for (const id of ids) {
          deletedRecords.push({ storeName, id });
        }
      }
    },
    clearStore: async () => {},
    deleteRecord: async (storeName, id) => {
      deletedRecords.push({ storeName, id });
    },
    getAllRecords: async () => [],
    getRecord: async () => null,
    listBookmarks: async () => [],
    listLikes: async () => [],
    putRecord: async () => {},
    putRecords: async () => {}
  });

  await appData.resetWorkToUnread('work-1');
  assert.deepEqual(deletedRecords, [
    { storeName: 'readingStates', id: 'work-1' },
    { storeName: 'bookmarks', id: 'work-1' }
  ]);
  assert.equal(state.readingStateRecords.length, 0);
  assert.equal(state.bookmarkRecords.length, 0);
  assert.equal(state.bookmarks.size, 0);
  assert.equal(state.likeRecords.length, 1);
  assert.equal(state.likes.has('work-1-fragment-0003'), true);
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

test('Aozora text ZIP URL validator accepts only official card ZIP paths', () => {
  assert.equal(
    normalizeAozoraTextZipUrl('https://www.aozora.gr.jp/cards/123/files/sample.zip'),
    'https://www.aozora.gr.jp/cards/123/files/sample.zip'
  );
  assert.equal(normalizeAozoraTextZipUrl('https://www.aozora.gr.jp/cards/123/files/sample.zip?ts=1'), '');
  assert.equal(normalizeAozoraTextZipUrl('https://www.aozora.gr.jp/files/sample.zip'), '');
  assert.equal(normalizeAozoraTextZipUrl('http://www.aozora.gr.jp/cards/123/files/sample.zip'), '');
  assert.equal(normalizeAozoraTextZipUrl('https://example.com/cards/123/files/sample.zip'), '');
});

test('Aozora catalog search ranks exact and prefix title matches first', () => {
  const records = [
    {
      id: '1',
      title: '女生徒余話',
      titleReading: 'じょせいとよわ',
      author: '太宰 治',
      authorReading: 'だざい おさむ'
    },
    {
      id: '2',
      title: '女生徒',
      titleReading: 'じょせいと',
      author: '太宰 治',
      authorReading: 'だざい おさむ'
    },
    {
      id: '3',
      title: '走れメロス',
      titleReading: 'はしれめろす',
      author: '太宰 治',
      authorReading: 'だざい おさむ'
    }
  ];

  const results = searchAozoraCatalog(records, '女生徒');
  assert.equal(results[0].id, '2');
  assert.equal(results[1].id, '1');
});

test('Aozora catalog search accepts common author name variants', () => {
  const records = [
    { id: 'ogai', title: '舞姫', author: '森 鴎外' },
    { id: 'akutagawa', title: '羅生門', author: '芥川 竜之介' },
    { id: 'miyazawa', title: '銀河鉄道の夜', author: '宮沢 賢治' },
    { id: 'kunikida', title: '武蔵野', author: '国木田 独歩' },
    { id: 'saito', title: '赤光', author: '斎藤 茂吉' },
    { id: 'yano', title: '小説神髄', author: '三遊亭 円朝' },
    { id: 'yosano', title: 'みだれ髪', author: '与謝野 晶子' },
    { id: 'yanagita', title: '遠野物語', author: '柳田 国男' },
    { id: 'takahama', title: '俳句とはどんなものか', author: '高浜 虚子' }
  ];

  assert.equal(searchAozoraCatalog(records, '森鷗外')[0].id, 'ogai');
  assert.equal(searchAozoraCatalog(records, '芥川龍之介')[0].id, 'akutagawa');
  assert.equal(searchAozoraCatalog(records, '宮澤賢治')[0].id, 'miyazawa');
  assert.equal(searchAozoraCatalog(records, '國木田獨歩')[0].id, 'kunikida');
  assert.equal(searchAozoraCatalog(records, '齋藤茂吉')[0].id, 'saito');
  assert.equal(searchAozoraCatalog(records, '三遊亭圓朝')[0].id, 'yano');
  assert.equal(searchAozoraCatalog(records, '與謝野晶子')[0].id, 'yosano');
  assert.equal(searchAozoraCatalog(records, '柳田國男')[0].id, 'yanagita');
  assert.equal(searchAozoraCatalog(records, '高濱虚子')[0].id, 'takahama');
});

test('Aozora catalog search ranks exact author matches above title prefix matches', () => {
  const records = [
    { id: 'essay', title: '宮沢賢治の詩', author: '中原 中也' },
    { id: 'author-work', title: '銀河鉄道の夜', author: '宮沢 賢治', authorReading: 'みやざわ けんじ' }
  ];

  assert.equal(searchAozoraCatalog(records, '宮澤賢治')[0].id, 'author-work');
});

test('Aozora catalog search keeps title hits after exact author matches', () => {
  const records = [
    { id: 'title-hit', title: '太宰治論', author: '坂口 安吾' },
    { id: 'author-hit', title: '走れメロス', author: '太宰 治', authorReading: 'だざい おさむ' },
    { id: 'author-hit-2', title: '女生徒', author: '太宰 治', authorReading: 'だざい おさむ' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(records, '太宰治').map((record) => record.id),
    ['author-hit', 'author-hit-2', 'title-hit']
  );
});

test('Aozora catalog search uses title reading for same-score ordering', () => {
  const records = [
    { id: 'later-reading', title: '乙作品', titleReading: 'んのさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ' },
    { id: 'earlier-reading', title: '甲作品', titleReading: 'あのさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(records, '検索著者').map((record) => record.id),
    ['earlier-reading', 'later-reading']
  );
});

test('Aozora catalog search defaults to reader-oriented sorting for same-score results', () => {
  const records = [
    { id: 'symbol-title', title: '「断章」', titleReading: 'たんしょう', author: '太宰 治', authorReading: 'だざい おさむ' },
    { id: 'short-title', title: '斜陽', titleReading: 'しゃよう', author: '太宰 治', authorReading: 'だざい おさむ' },
    { id: 'long-title', title: '人間失格についての長い作品', titleReading: 'にんげんしっかくについてのながいさくひん', author: '太宰 治', authorReading: 'だざい おさむ' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(records, '太宰治').map((record) => record.id),
    ['long-title', 'short-title', 'symbol-title']
  );
});

test('Aozora catalog search can still use reading-order sort mode', () => {
  const records = [
    { id: 'later-reading', title: '長い作品名', titleReading: 'んのさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ' },
    { id: 'earlier-reading', title: '短編', titleReading: 'あのさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(records, '検索著者', { sortMode: SEARCH_SORT_MODES.READING }).map((record) => record.id),
    ['earlier-reading', 'later-reading']
  );
});

test('Aozora catalog search prioritizes modern kana only within the same work', () => {
  const sameWorkRecords = [
    { id: 'old-same-work', title: '同じ作品', titleReading: 'おなじさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ', kanaType: '旧字旧仮名' },
    { id: 'modern-same-work', title: '同じ作品', titleReading: 'おなじさくひん', author: '検索 著者', authorReading: 'けんさく ちょしゃ', kanaType: '新字新仮名' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(sameWorkRecords, '検索著者').map((record) => record.id),
    ['modern-same-work', 'old-same-work']
  );

  const differentWorkRecords = [
    { id: 'long-old-work', title: '長い別作品名', titleReading: 'ながいべつさくひんめい', author: '検索 著者', authorReading: 'けんさく ちょしゃ', kanaType: '旧字旧仮名' },
    { id: 'short-modern-work', title: '短編', titleReading: 'たんぺん', author: '検索 著者', authorReading: 'けんさく ちょしゃ', kanaType: '新字新仮名' }
  ];

  assert.deepEqual(
    searchAozoraCatalog(differentWorkRecords, '検索著者').map((record) => record.id),
    ['long-old-work', 'short-modern-work']
  );
});

test('Aozora search results render readable kana labels for every kana type', () => {
  const markup = aozoraSearchResultsMarkup([
    { id: 'modern', title: '現代版', author: '著者', kanaType: '新字新仮名' },
    { id: 'old-kana', title: '旧かな版', author: '著者', kanaType: '新字旧仮名' },
    { id: 'old-kanji', title: '旧字版', author: '著者', kanaType: '旧字新仮名' },
    { id: 'old-both', title: '旧字旧かな版', author: '著者', kanaType: '旧字旧仮名' }
  ]);

  assert.match(markup, /新字・新かな/u);
  assert.match(markup, /aozora-kana-label-modern/u);
  assert.match(markup, /新字・旧かな/u);
  assert.match(markup, /旧字・新かな/u);
  assert.match(markup, /旧字・旧かな/u);
});

test('Aozora search results show direct ZIP action and card sublink separately', () => {
  const markup = aozoraSearchResultsMarkup([
    {
      id: 'zip-ok',
      title: '公開作品',
      author: '著者',
      cardUrl: 'https://www.aozora.gr.jp/cards/1/card1.html',
      textZipUrl: 'https://www.aozora.gr.jp/cards/1/files/work.zip',
      resultType: 'aozora'
    },
    {
      id: 'copyright',
      title: '著作権注意作品',
      author: '著者',
      cardUrl: 'https://www.aozora.gr.jp/cards/2/card2.html',
      textZipUrl: 'https://www.aozora.gr.jp/cards/2/files/work.zip',
      resultType: 'aozora',
      copyrightWarning: true
    }
  ]);

  assert.match(markup, /青空文庫ZIPを開く/u);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/u);
  assert.match(markup, /図書カードを見る/u);
  assert.match(markup, /著作権と公開状況を確認してください。/u);
  assert.doesNotMatch(markup, /<article class="fragment-card aozora-result-card">\s*<a class="aozora-result-link"/u);
});

test('local work search uses titles, authors, and source title lines', () => {
  const works = [
    {
      id: 'work-1',
      title: '保存済み作品',
      author: '著者A',
      sourceTitleLines: ['底本タイトル']
    },
    {
      id: 'work-2',
      title: '別作品',
      author: '探せる著者',
      sourceTitleLines: []
    }
  ];

  assert.equal(searchWorkRecords(works, '底本')[0].id, 'work-1');
  assert.equal(searchWorkRecords(works, '探せる著者')[0].id, 'work-2');
});

test('local work search shares Aozora author variant normalization', () => {
  const works = [
    { id: 'work-ogai', title: '保存済み舞姫', author: '森 鴎外', sourceTitleLines: [] }
  ];

  assert.equal(searchWorkRecords(works, '森鷗外')[0].id, 'work-ogai');
});

test('local work search keeps title hits after exact author matches', () => {
  const works = [
    { id: 'title-hit', title: '太宰治覚書', author: '坂口 安吾', sourceTitleLines: [] },
    { id: 'author-hit', title: '斜陽', author: '太宰 治', sourceTitleLines: [] }
  ];

  assert.deepEqual(searchWorkRecords(works, '太宰治').map((record) => record.id), ['author-hit', 'title-hit']);
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
