import { SEARCH_RESULTS_BATCH_SIZE } from './app-config.js?v=20260620004736';

export function createBookmarkActions({
  state,
  getFragmentById,
  getBookmarkForWork,
  saveBookmark,
  listBookmarks,
  canonicalizeBookmarkRecords,
  loadStateFromDb,
  route
}) {
  async function toggleBookmark(fragmentId, options = {}) {
    const fragment = getFragmentById(state.fragments, fragmentId);
    if (!fragment || fragment.type === 'break') {
      return;
    }

    const current = getBookmarkForWork(state.bookmarkRecords, fragment.workId);
    if (current?.fragmentId === fragment.id) {
      return;
    }

    await saveBookmark(fragment);

    if (options.rerender === false) {
      state.bookmarkRecords = canonicalizeBookmarkRecords(await listBookmarks(), state.fragments);
      state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
      return;
    }

    await loadStateFromDb();
    route();
  }

  return { toggleBookmark };
}

export function createSearchActions({
  state,
  renderSearch,
  readFileAsArrayBuffer,
  extractAozoraTxtFromZip,
  buildAozoraCatalogMeta,
  normalizeAozoraCatalogPayload,
  decodeAozoraText,
  derivePreviewFromText,
  searchAozoraCatalog,
  searchWorkRecords,
  remoteImportUrlSettingId,
  converterBaseUrlSettingId,
  normalizeConverterBaseUrl,
  buildConverterLatestManifestUrl,
  resolveConverterTextUrl,
  isMixedContentBlocked,
  AOZORA_CATALOG_META_ID,
  AOZORA_CATALOG_ASSET_PATH,
  getAllRecords,
  clearStore,
  putRecord,
  putRecords,
  loadStateFromDb
}) {
  function resetCatalogSearchSession() {
    state.aozoraCatalogQuery = '';
    state.aozoraCatalogStatus = '';
    state.aozoraCatalogResults = [];
    state.aozoraCatalogVisibleCount = SEARCH_RESULTS_BATCH_SIZE;
  }

  function normalizeSearchScope(scope) {
    return scope === 'library' ? 'library' : 'aozora';
  }

  function importedWorkByAozoraId() {
    return new Map(state.works
      .filter((work) => work.aozoraWorkId)
      .map((work) => [String(work.aozoraWorkId), work]));
  }

  function toCatalogSearchResult(record, importedWorks) {
    const importedWork = importedWorks.get(String(record.workId ?? record.id ?? '')) ?? null;
    return {
      ...record,
      resultType: 'aozora',
      href: record.cardUrl,
      openInNewTab: true,
      isImported: Boolean(importedWork),
      importedWorkId: importedWork?.id ?? ''
    };
  }

  function toLibrarySearchResult(work) {
    return {
      id: work.id,
      workId: work.id,
      title: work.title ?? '無題',
      author: work.author ?? '',
      kanaType: '',
      href: `#/work/${encodeURIComponent(work.id)}`,
      resultType: 'library',
      isImported: false,
      importedWorkId: ''
    };
  }

  function applyCatalogSearchResults(query) {
    state.aozoraCatalogQuery = String(query ?? '');
    if (state.searchScope === 'library') {
      state.aozoraCatalogResults = searchWorkRecords(state.works, state.aozoraCatalogQuery)
        .map((work) => toLibrarySearchResult(work));
    } else {
      const importedWorks = importedWorkByAozoraId();
      state.aozoraCatalogResults = searchAozoraCatalog(state.aozoraCatalogRecords, state.aozoraCatalogQuery)
        .map((record) => toCatalogSearchResult(record, importedWorks));
    }
    state.aozoraCatalogVisibleCount = SEARCH_RESULTS_BATCH_SIZE;
  }

  function resetImportPreview() {
    state.importPreview = null;
  }

  async function saveConverterBaseUrl(baseUrl) {
    state.converterBaseUrl = normalizeConverterBaseUrl(baseUrl);
    await putRecord('settings', {
      id: converterBaseUrlSettingId,
      value: state.converterBaseUrl,
      updatedAt: new Date().toISOString()
    });
  }

  async function saveRemoteImportUrl(url) {
    state.remoteImportUrl = String(url ?? '').trim();
    await putRecord('settings', {
      id: remoteImportUrlSettingId,
      value: state.remoteImportUrl,
      updatedAt: new Date().toISOString()
    });
  }

  function scrollSearchPreviewIntoView() {
    scrollElementIntoView('[data-search-preview]');
  }

  function scrollImportNoticeIntoView() {
    scrollElementIntoView('[data-search-import-notice]');
  }

  function scrollElementIntoView(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return;
    }

    const headerBottom = document.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
    const elementTop = window.scrollY + element.getBoundingClientRect().top;
    const targetTop = Math.max(0, elementTop - headerBottom - 8);
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  async function readCatalogResponseJson(response) {
    if (!AOZORA_CATALOG_ASSET_PATH.endsWith('.gz')) {
      return response.json();
    }
    if (!('DecompressionStream' in globalThis)) {
      throw new Error('このブラウザは圧縮された作品一覧を展開できません。');
    }

    const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
    if (!stream) {
      throw new Error('圧縮された作品一覧を読み取れませんでした。');
    }

    return new Response(stream).json();
  }

  function buildPreviewFromDecodedText(decoded, sourceMeta = {}) {
    const preview = derivePreviewFromText(decoded.text, decoded.encoding);
    return buildPreviewFromText(preview, sourceMeta);
  }

  function buildPreviewFromText(preview, sourceMeta = {}) {
    if (!preview.fragments?.some((fragment) => fragment.type === 'fragment')) {
      throw new Error('断片を作れませんでした。');
    }

    return {
      ...preview,
      sourceType: String(sourceMeta.sourceType ?? 'text-upload'),
      sourceUrl: String(sourceMeta.sourceUrl ?? sourceMeta.cardUrl ?? ''),
      sourceFileName: String(sourceMeta.sourceFileName ?? ''),
      aozoraWorkId: String(sourceMeta.aozoraWorkId ?? ''),
      textZipUrl: String(sourceMeta.textZipUrl ?? ''),
      cardUrl: String(sourceMeta.cardUrl ?? ''),
      copyrightWarning: Boolean(sourceMeta.copyrightWarning)
    };
  }

  async function handleImportedPreview(preview, sourceMeta, sourceLabel) {
    state.importSheetOpen = true;
    state.importWorkNoticeTone = '';
    state.importWorkStatus = `${sourceLabel} を読み込んでいます。`;
    resetImportPreview();
    renderSearch();

    try {
      state.importPreview = buildPreviewFromText(preview, sourceMeta);
      state.importSheetOpen = false;
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `${sourceLabel} を読み込みました。保存前に内容を確認してください。`;
    } catch (error) {
      console.error(error);
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `${sourceLabel} の取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSearch();
    if (state.importPreview) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollSearchPreviewIntoView();
        });
      });
    }
  }

  async function handleAozoraTextArrayBuffer(arrayBuffer, sourceMeta = {}) {
    const sourceLabel = String(sourceMeta.sourceLabel ?? sourceMeta.sourceFileName ?? 'TXT');
    const decoded = decodeAozoraText(arrayBuffer);
    await handleImportedPreview(derivePreviewFromText(decoded.text, decoded.encoding), sourceMeta, sourceLabel);
  }

  async function handleAozoraZipArrayBuffer(arrayBuffer, sourceMeta = {}) {
    const sourceLabel = String(sourceMeta.sourceLabel ?? 'ZIP');
    state.importSheetOpen = true;
    state.importWorkNoticeTone = '';
    state.importWorkStatus = `${sourceLabel} を読み込んでいます。`;
    resetImportPreview();
    renderSearch();

    try {
      const extracted = await extractAozoraTxtFromZip(arrayBuffer);
      const decoded = decodeAozoraText(extracted.bytes);
      state.importPreview = buildPreviewFromDecodedText(decoded, {
        ...sourceMeta,
        sourceType: String(sourceMeta.sourceType ?? 'zip-upload'),
        sourceFileName: String(sourceMeta.sourceFileName ?? extracted.fileName)
      });
      state.importSheetOpen = false;
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `${extracted.fileName} を読み込みました。保存前に内容を確認してください。`;
    } catch (error) {
      console.error(error);
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `ZIP 取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSearch();
    if (state.importPreview) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollSearchPreviewIntoView();
        });
      });
    }
  }

  async function saveImportedWork() {
    if (!state.importPreview) {
      return;
    }

    const importedAt = new Date().toISOString();
    const workId = `work-${Date.now()}`;
    const workRecord = {
      id: workId,
      sourceType: state.importPreview.sourceType || 'zip-upload',
      aozoraWorkId: state.importPreview.aozoraWorkId || '',
      title: state.importPreview.title,
      author: state.importPreview.author,
      sourceTitleLines: Array.isArray(state.importPreview.sourceTitleLines)
        ? state.importPreview.sourceTitleLines.slice(0, 2)
        : [],
      sourceUrl: state.importPreview.sourceUrl || '',
      sourceFileName: state.importPreview.sourceFileName || '',
      importedAt,
      fragmentCount: state.importPreview.textFragmentCount,
      createdAt: importedAt
    };

    let sequence = 0;
    let textIndex = 0;
    const fragmentRecords = state.importPreview.fragments.map((fragment) => {
      sequence += 1;

      if (fragment.type === 'break') {
        return {
          id: `${workId}-break-${String(sequence).padStart(4, '0')}`,
          workId,
          type: 'break',
          sequence,
          breakCount: fragment.breakCount,
          breakKind: fragment.breakKind ?? '',
          index: sequence,
          plainText: '',
          displayHtml: ''
        };
      }

      textIndex += 1;
      return {
        id: `${workId}-fragment-${String(sequence).padStart(4, '0')}`,
        workId,
        type: 'fragment',
        sequence,
        index: textIndex,
        plainText: fragment.plainText,
        displayHtml: fragment.displayHtml
      };
    });

    const fragmentIdByIndex = new Map(
      fragmentRecords
        .filter((fragment) => fragment.type === 'fragment')
        .map((fragment) => [fragment.index, fragment.id])
    );
    workRecord.outline = (state.importPreview.outline ?? []).map((entry) => ({
      ...entry,
      fragmentId: entry.fragmentIndex ? fragmentIdByIndex.get(entry.fragmentIndex) ?? null : null
    }));

    await putRecord('works', workRecord);
    await putRecords('fragments', fragmentRecords);
    await loadStateFromDb();
    resetCatalogSearchSession();
    state.importWorkNoticeTone = 'success';
    state.importWorkStatus = `${state.importPreview.title} を保存しました。別の作品を探すか、別のファイルを追加してください。`;
    state.importPreview = null;
    state.importSheetOpen = false;
  }

  async function handleAozoraImportFile(file) {
    if (!file) {
      return;
    }

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const lowerName = String(file.name ?? '').toLowerCase();
      if (lowerName.endsWith('.zip') || file.type === 'application/zip') {
        await handleAozoraZipArrayBuffer(arrayBuffer, {
          sourceType: 'zip-upload',
          sourceLabel: file.name || 'ZIP',
          sourceFileName: file.name || ''
        });
        return;
      }

      await handleAozoraTextArrayBuffer(arrayBuffer, {
        sourceType: 'text-upload',
        sourceLabel: file.name || 'TXT',
        sourceFileName: file.name || ''
      });
    } catch (error) {
      console.error(error);
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `ファイル取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
      renderSearch();
    }
  }

  async function loadLatestConverterText(baseUrl) {
    const normalizedBaseUrl = normalizeConverterBaseUrl(baseUrl);
    if (!normalizedBaseUrl) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = 'PCのURLを入力してください。';
      renderSearch();
      return;
    }

    const manifestUrl = buildConverterLatestManifestUrl(normalizedBaseUrl);
    if (isMixedContentBlocked(globalThis.location?.href ?? '', manifestUrl)) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = 'https 版のドパガキ文庫から http のPCへは直接取り込みできません。PC上で http 版を開くか、PC側を https で配信してください。';
      renderSearch();
      return;
    }

    state.importSheetOpen = true;
    state.importWorkNoticeTone = '';
    state.importWorkStatus = 'PCの最新作を読み込んでいます。';
    resetImportPreview();
    renderSearch();

    try {
      await saveConverterBaseUrl(normalizedBaseUrl);
      const manifestResponse = await fetch(`${manifestUrl}?ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!manifestResponse.ok) {
        throw new Error(`latest.json の取得に失敗しました: HTTP ${manifestResponse.status}`);
      }

      const manifest = await manifestResponse.json();
      const textUrl = resolveConverterTextUrl(manifestUrl, manifest);
      if (isMixedContentBlocked(globalThis.location?.href ?? '', textUrl)) {
        throw new Error('https 版のドパガキ文庫から http のTXTへは直接取り込みできません。');
      }

      const textResponse = await fetch(`${textUrl}${textUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!textResponse.ok) {
        throw new Error(`TXT の取得に失敗しました: HTTP ${textResponse.status}`);
      }

      const bytes = await textResponse.arrayBuffer();
      await handleAozoraTextArrayBuffer(bytes, {
        sourceType: 'converter-latest',
        sourceLabel: String(manifest.title ?? manifest.sourceFileName ?? 'PCの最新作'),
        sourceFileName: String(manifest.sourceFileName ?? ''),
        sourceUrl: String(manifest.sourceUrl ?? textUrl),
        textZipUrl: String(manifest.latestZipPath ?? manifest.zipPath ?? ''),
        cardUrl: String(manifest.sourceUrl ?? '')
      });
    } catch (error) {
      console.error(error);
      state.importSheetOpen = true;
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `PC取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
      renderSearch();
    }
  }

  async function loadRemoteImportUrl(url) {
    state.remoteImportUrl = String(url ?? '').trim();
    if (!state.remoteImportUrl) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = 'TXT 公開URLを入力してください。';
      renderSearch();
      return;
    }

    let remoteUrl;
    let parsedRemoteUrl;
    try {
      remoteUrl = new URL(state.remoteImportUrl, globalThis.location?.href ?? 'http://localhost/').toString();
      parsedRemoteUrl = new URL(remoteUrl);
    } catch (error) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `TXT 公開URLが不正です: ${error?.message ?? 'URL を解釈できません。'}`;
      renderSearch();
      return;
    }

    if (parsedRemoteUrl.hostname === '127.0.0.1' || parsedRemoteUrl.hostname === 'localhost') {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = '127.0.0.1 / localhost はこのiPhone自身を指します。PCの LAN IP か https の公開URLを使ってください。';
      renderSearch();
      return;
    }

    if (isMixedContentBlocked(globalThis.location?.href ?? '', remoteUrl)) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = 'https 版のドパガキ文庫から http のTXT URLは直接取り込めません。https の公開URLを使うか、PC上で http 版を開いてください。';
      renderSearch();
      return;
    }

    state.importSheetOpen = true;
    state.importWorkNoticeTone = '';
    state.importWorkStatus = 'TXT 公開URLから読み込んでいます。';
    resetImportPreview();
    renderSearch();

    try {
      await saveRemoteImportUrl(remoteUrl);
      const response = await fetch(`${remoteUrl}${remoteUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const bytes = await response.arrayBuffer();
      await handleAozoraTextArrayBuffer(bytes, {
        sourceType: 'remote-url',
        sourceLabel: '公開TXT',
        sourceUrl: remoteUrl,
        sourceFileName: remoteUrl.split('/').pop() ?? ''
      });
    } catch (error) {
      console.error(error);
      state.importSheetOpen = true;
      state.importWorkNoticeTone = '';
      state.importWorkStatus = `TXT 公開URLの取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
      renderSearch();
    }
  }

  async function previewPastedText(text) {
    state.importTextDraft = String(text ?? '');
    if (!state.importTextDraft.trim()) {
      state.importWorkNoticeTone = '';
      state.importWorkStatus = '貼り付ける TXT を入力してください。';
      renderSearch();
      return;
    }

    await handleImportedPreview(
      derivePreviewFromText(state.importTextDraft, 'pasted-text'),
      {
        sourceType: 'pasted-text',
        sourceLabel: '貼り付けTXT'
      },
      '貼り付けTXT'
    );
  }

  async function refreshAozoraCatalog(options = {}) {
    const shouldRender = options.render !== false;
    if (state.aozoraCatalogLoading) {
      if (shouldRender) {
        renderSearch();
      }
      return;
    }

    state.aozoraCatalogLoading = true;
    state.aozoraCatalogStatus = '同梱の作品一覧を読み直しています。';
    if (shouldRender) {
      renderSearch();
    }

    try {
      const response = await fetch(`${AOZORA_CATALOG_ASSET_PATH}?ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = normalizeAozoraCatalogPayload(await readCatalogResponseJson(response));
      if (payload.records.length === 0) {
        throw new Error('作品一覧を読み取れませんでした。');
      }

      const metaRecord = buildAozoraCatalogMeta(
        payload.records,
        payload.meta.sourceUrl,
        payload.meta.fetchedAt
      );
      await clearStore('aozoraCatalog');
      await putRecords('aozoraCatalog', [...payload.records, metaRecord]);
      state.aozoraCatalogRecords = payload.records;
      state.aozoraCatalogMeta = metaRecord;
      applyCatalogSearchResults(state.aozoraCatalogQuery);
      state.aozoraCatalogStatus = `${payload.records.length}件の同梱作品一覧を読み込みました。`;
    } catch (error) {
      console.error(error);
      state.aozoraCatalogStatus = `作品一覧の更新に失敗しました: ${error?.message ?? '不明なエラー'}`;
    } finally {
      state.aozoraCatalogLoading = false;
    }

    if (shouldRender) {
      renderSearch();
    }
  }

  async function initializeAozoraCatalogState() {
    const records = await getAllRecords('aozoraCatalog');
    const cachedMeta = records.find((record) => record.id === AOZORA_CATALOG_META_ID) ?? null;
    const cachedRecords = records.filter((record) => record.id !== AOZORA_CATALOG_META_ID);
    if (cachedRecords.length > 0 && cachedMeta) {
      state.aozoraCatalogMeta = cachedMeta;
      state.aozoraCatalogRecords = cachedRecords;
      applyCatalogSearchResults(state.aozoraCatalogQuery);
      return;
    }

    await refreshAozoraCatalog({ render: false });
  }

  async function ensureAozoraCatalogReady() {
    if (state.aozoraCatalogRecords.length > 0 || state.aozoraCatalogLoading) {
      return;
    }

    await refreshAozoraCatalog({ render: true });
  }

  function runCatalogSearch(query) {
    const scope = normalizeSearchScope(state.searchScope);
    if (scope === 'aozora' && state.aozoraCatalogRecords.length === 0) {
      state.aozoraCatalogQuery = String(query ?? '');
      state.aozoraCatalogResults = [];
      state.aozoraCatalogStatus = state.aozoraCatalogLoading
        ? '作品一覧を読み込んでいます。少し待ってから検索してください。'
        : '作品一覧を読み込めませんでした。少し待って再度お試しください。';
      renderSearch();
      return;
    }

    applyCatalogSearchResults(query);
    const scopeLabel = scope === 'library' ? '本棚' : '青空文庫';
    state.aozoraCatalogStatus = state.aozoraCatalogResults.length > 0
      ? `${scopeLabel}で${state.aozoraCatalogResults.length}件見つかりました。`
      : `${scopeLabel}で一致する作品が見つかりませんでした。`;
    renderSearch();
  }

  async function handleSearchAction(action, payload = {}) {
    if (payload.remoteImportUrl !== undefined) {
      state.remoteImportUrl = String(payload.remoteImportUrl ?? '').trim();
    }
    if (payload.pastedText !== undefined) {
      state.importTextDraft = String(payload.pastedText ?? '');
    }

    if (action === 'open-import-sheet') {
      state.importWorkNoticeTone = '';
      state.importSheetOpen = true;
      renderSearch();
      return;
    }

    if (action === 'close-import-sheet') {
      state.importSheetOpen = false;
      renderSearch();
      return;
    }

    if (action === 'refresh-aozora-catalog') {
      await refreshAozoraCatalog();
      return;
    }

    if (action === 'load-remote-import-url') {
      await loadRemoteImportUrl(payload.remoteImportUrl ?? state.remoteImportUrl);
      return;
    }

    if (action === 'preview-pasted-text') {
      await previewPastedText(payload.pastedText ?? state.importTextDraft);
      return;
    }

    if (action === 'load-converter-latest') {
      await loadLatestConverterText(payload.baseUrl ?? state.converterBaseUrl);
      return;
    }

    if (action === 'search-aozora-catalog') {
      state.importWorkNoticeTone = '';
      runCatalogSearch(payload.query ?? state.aozoraCatalogQuery);
      return;
    }

    if (action === 'set-search-scope-aozora' || action === 'set-search-scope-library') {
      state.importWorkNoticeTone = '';
      state.searchScope = action === 'set-search-scope-library' ? 'library' : 'aozora';
      applyCatalogSearchResults(payload.query ?? state.aozoraCatalogQuery);
      state.aozoraCatalogStatus = '';
      renderSearch();
      return;
    }

    if (action === 'show-more-aozora-results') {
      state.aozoraCatalogVisibleCount += SEARCH_RESULTS_BATCH_SIZE;
      renderSearch();
      return;
    }

    if (action === 'scroll-search-results-top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'save-imported-work') {
      try {
        await saveImportedWork();
      } catch (error) {
        console.error(error);
        state.importWorkNoticeTone = '';
        state.importWorkStatus = `保存に失敗しました: ${error?.message ?? '不明なエラー'}`;
      }
      renderSearch();
      if (state.importWorkNoticeTone === 'success') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollImportNoticeIntoView();
          });
        });
      }
      return;
    }

    if (action === 'clear-preview') {
      state.importPreview = null;
      state.importWorkNoticeTone = '';
      state.importWorkStatus = '';
      state.importSheetOpen = false;
      renderSearch();
    }
  }

  function applySearchRouteIntent(payload = {}) {
    const remoteImportUrl = String(payload.remoteImportUrl ?? '').trim();
    if (!payload.shouldOpenImportSheet && !remoteImportUrl) {
      return false;
    }

    state.importSheetOpen = Boolean(payload.shouldOpenImportSheet);
    if (remoteImportUrl) {
      state.remoteImportUrl = remoteImportUrl;
    }
    return true;
  }

  return {
    applySearchRouteIntent,
    ensureAozoraCatalogReady,
    handleAozoraImportFile,
    handleAozoraZipArrayBuffer,
    handleSearchAction,
    initializeAozoraCatalogState
  };
}

export function createDetailActions({
  state,
  getFragmentById,
  removeLike,
  saveLike,
  toggleBookmark,
  loadStateFromDb,
  route
}) {
  function confirmLikeRemovalIfNeeded(record) {
    const note = typeof record?.note === 'string' ? record.note.trim() : '';
    if (!note) {
      return true;
    }

    return globalThis.confirm('このふせんを外すとメモも消えます。外しますか。');
  }

  async function handleDetailAction(action, fragmentId) {
    const fragment = getFragmentById(state.fragments, fragmentId);
    if (!fragment) {
      return;
    }

    const currentLikeRecord = state.likeRecords.find((item) => item.fragmentId === fragmentId) ?? null;

    if (action === 'like') {
      if (state.likes.has(fragmentId)) {
        if (!confirmLikeRemovalIfNeeded(currentLikeRecord)) {
          return;
        }
        await removeLike(fragmentId);
        state.likes.delete(fragmentId);
      } else {
        await saveLike(fragmentId, {
          savedAt: currentLikeRecord?.savedAt,
          note: currentLikeRecord?.note ?? ''
        });
        state.likes.add(fragmentId);
      }
    } else if (action === 'bookmark') {
      await toggleBookmark(fragmentId);
      return;
    } else if (action === 'memo') {
      const answer = globalThis.prompt(
        state.likes.has(fragmentId)
          ? 'ふせんメモを編集します。空欄でメモだけ外せます。'
          : 'ふせんメモを入力します。保存するとふせんも付きます。',
        currentLikeRecord?.note ?? ''
      );
      if (answer === null) {
        return;
      }

      const note = String(answer).trim();
      if (!state.likes.has(fragmentId) && !note) {
        return;
      }

      await saveLike(fragmentId, {
        savedAt: currentLikeRecord?.savedAt,
        note
      });
      state.likes.add(fragmentId);
    }

    await loadStateFromDb();
    route();
  }

  return { handleDetailAction, confirmLikeRemovalIfNeeded };
}

export function createCollectionActions({
  state,
  loadStateFromDb,
  renderCollectionPage,
  removeBookmark,
  removeLike,
  saveLike,
  confirmLikeRemovalIfNeeded
}) {
  async function handleCollectionAction(kind, recordId, action = 'remove', options = {}) {
    if (!recordId) {
      return;
    }

    if (kind === 'likes' && action === 'edit-note') {
      const currentLikeRecord = state.likeRecords.find((item) => item.id === recordId || item.fragmentId === recordId) ?? null;
      const answer = globalThis.prompt(
        'ふせんメモを編集します。空欄でメモだけ外せます。',
        currentLikeRecord?.note ?? ''
      );
      if (answer === null) {
        return;
      }

      await saveLike(recordId, {
        savedAt: currentLikeRecord?.savedAt,
        note: String(answer).trim()
      });
      await loadStateFromDb();
      renderCollectionPage(kind, options);
      return;
    }

    if (kind === 'bookmarks') {
      await removeBookmark(recordId);
    } else if (kind === 'likes') {
      const currentLikeRecord = state.likeRecords.find((item) => item.id === recordId || item.fragmentId === recordId) ?? null;
      if (!confirmLikeRemovalIfNeeded(currentLikeRecord)) {
        return;
      }
      await removeLike(recordId);
    } else {
      return;
    }

    await loadStateFromDb();
    renderCollectionPage(kind, options);
  }

  return { handleCollectionAction };
}

export function createSettingsActions({
  state,
  renderSettings,
  downloadExportJson,
  readImportFile,
  importJsonData,
  buildImportSummary,
  loadStateFromDb,
  clearAllStores,
  pickImportInput,
  saveWorkLoadMode
}) {
  async function refreshRelease() {
    state.releaseStatus = '最新版を確認しています。';
    renderSettings();

    const currentVersion = document.documentElement.dataset.releaseVersion || '';

    try {
      const response = await fetch(`./release.json?ts=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const release = await response.json();
      const latestVersion = typeof release?.version === 'string' ? release.version : '';
      if (!latestVersion) {
        throw new Error('release.json に version がありません。');
      }

      if (latestVersion === currentVersion) {
        state.releaseStatus = `この端末ではすでに最新状態です。版: ${latestVersion}`;
        renderSettings();
        return;
      }

      state.releaseStatus = `最新版 ${latestVersion} を読み直します。`;
      renderSettings();

      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set('reload', latestVersion);
      window.location.replace(refreshUrl.toString());
    } catch (error) {
      console.error(error);
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set('reload', String(Date.now()));
      state.releaseStatus = '最新版の確認に失敗したため、このサイトだけ読み直します。';
      renderSettings();
      window.location.replace(refreshUrl.toString());
    }
  }

  async function handleExportJson() {
    state.exportStatus = 'JSONを書き出しています。';
    renderSettings();

    try {
      const result = await downloadExportJson();
      state.exportStatus = `${result.downloadName} を書き出しました。`;
    } catch (error) {
      console.error(error);
      state.exportStatus = `書き出しに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSettings();
  }

  async function handleImportFileSelection(file) {
    if (!file) {
      return;
    }

    state.importStatus = 'JSON を確認しています。';
    state.pendingImport = null;
    renderSettings();

    try {
      const pendingImport = await readImportFile(file);
      state.pendingImport = {
        ...pendingImport,
        summary: buildImportSummary(pendingImport.stores)
      };
      state.importStatus = 'インポート方法を選んでください。';
    } catch (error) {
      console.error(error);
      state.importStatus = `読み込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSettings();
  }

  async function executeImport(mode) {
    if (!state.pendingImport) {
      return;
    }

    state.importStatus = mode === 'replace' ? 'JSON を上書きインポートしています。' : 'JSON を追加インポートしています。';
    renderSettings();

    try {
      await importJsonData(state.pendingImport.stores, mode);
      await loadStateFromDb();
      state.importStatus = mode === 'replace' ? 'JSON を上書きインポートしました。' : 'JSON を追加インポートしました。';
      state.pendingImport = null;
    } catch (error) {
      console.error(error);
      state.importStatus = `インポートに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSettings();
  }

  async function resetAppData() {
    const confirmed = globalThis.confirm('保存した作品、断片、ふせん、しおり、設定を消去して初期状態へ戻します。続行しますか。');
    if (!confirmed) {
      return;
    }

    state.exportStatus = '';
    state.importStatus = 'アプリを初期化しています。';
    state.pendingImport = null;
    state.importWorkStatus = '';
    state.importPreview = null;
    state.importSheetOpen = false;
    renderSettings();

    try {
      await clearAllStores();
      await loadStateFromDb();
      state.importStatus = 'アプリを初期化しました。';
    } catch (error) {
      console.error(error);
      state.importStatus = `初期化に失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSettings();
  }

  async function handleSettingsAction(action) {
    if (action === 'export-json') {
      await handleExportJson();
      return;
    }

    if (action === 'pick-import') {
      pickImportInput();
      return;
    }

    if (action === 'refresh-release') {
      await refreshRelease();
      return;
    }

    if (action === 'set-work-load-mode-auto' || action === 'set-work-load-mode-manual') {
      const mode = action === 'set-work-load-mode-manual' ? 'manual' : 'auto';
      state.workLoadMode = mode;
      try {
        await saveWorkLoadMode(mode);
      } catch (error) {
        console.error(error);
      }
      renderSettings();
      return;
    }

    if (action === 'import-replace') {
      await executeImport('replace');
      return;
    }

    if (action === 'import-append') {
      await executeImport('append');
      return;
    }

    if (action === 'import-cancel') {
      state.pendingImport = null;
      state.importStatus = 'インポートをキャンセルしました。';
      renderSettings();
      return;
    }

    if (action === 'reset-app') {
      await resetAppData();
    }
  }

  return { handleImportFileSelection, handleSettingsAction };
}
