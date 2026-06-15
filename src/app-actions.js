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
  decodeAozoraText,
  derivePreviewFromText,
  putRecord,
  putRecords,
  loadStateFromDb
}) {
  async function saveImportedWork() {
    if (!state.importPreview) {
      return;
    }

    const workId = `work-${Date.now()}`;
    const workRecord = {
      id: workId,
      title: state.importPreview.title,
      author: state.importPreview.author,
      createdAt: new Date().toISOString()
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
    state.importWorkStatus = `${state.importPreview.title} を作品アカウントとして保存しました。`;
    state.importPreview = null;
  }

  async function handleAozoraZipFile(file) {
    if (!file) {
      return;
    }

    state.importWorkStatus = 'ZIP を読み込んでいます。';
    state.importPreview = null;
    renderSearch();

    try {
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const extracted = await extractAozoraTxtFromZip(arrayBuffer);
      const decoded = decodeAozoraText(extracted.bytes);
      const preview = derivePreviewFromText(decoded.text, decoded.encoding);
      state.importPreview = {
        ...preview,
        sourceFileName: extracted.fileName
      };
      state.importWorkStatus = `${extracted.fileName} を読み込みました。保存前に内容を確認してください。`;
    } catch (error) {
      console.error(error);
      state.importWorkStatus = `ZIP 取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
    }

    renderSearch();
  }

  async function handleSearchAction(action) {
    if (action === 'save-imported-work') {
      try {
        await saveImportedWork();
      } catch (error) {
        console.error(error);
        state.importWorkStatus = `保存に失敗しました: ${error?.message ?? '不明なエラー'}`;
      }
      renderSearch();
      return;
    }

    if (action === 'clear-preview') {
      state.importPreview = null;
      state.importWorkStatus = '';
      renderSearch();
    }
  }

  return { handleAozoraZipFile, handleSearchAction };
}

export function createDetailActions({
  state,
  getFragmentById,
  findWorkById,
  removeLike,
  saveLike,
  removeQuote,
  saveQuote,
  toggleBookmark,
  loadStateFromDb,
  route
}) {
  async function handleDetailAction(action, fragmentId) {
    const fragment = getFragmentById(state.fragments, fragmentId);
    if (!fragment) {
      return;
    }

    const work = findWorkById(fragment.workId);

    if (action === 'like') {
      if (state.likes.has(fragmentId)) {
        await removeLike(fragmentId);
        state.likes.delete(fragmentId);
      } else {
        await saveLike(fragmentId);
        state.likes.add(fragmentId);
      }
    } else if (action === 'bookmark') {
      await toggleBookmark(fragmentId);
      return;
    } else if (action === 'quote') {
      if (state.quotes.has(fragmentId)) {
        await removeQuote(fragmentId);
        state.quotes.delete(fragmentId);
      } else {
        await saveQuote(fragment, work);
        state.quotes.add(fragmentId);
      }
    }

    await loadStateFromDb();
    route();
  }

  return { handleDetailAction };
}

export function createCollectionActions({
  loadStateFromDb,
  renderCollectionPage,
  removeBookmark,
  removeLike,
  removeQuote
}) {
  async function handleCollectionAction(kind, recordId) {
    if (!recordId) {
      return;
    }

    if (kind === 'bookmarks') {
      await removeBookmark(recordId);
    } else if (kind === 'likes') {
      await removeLike(recordId);
    } else if (kind === 'quotes') {
      await removeQuote(recordId);
    } else {
      return;
    }

    await loadStateFromDb();
    renderCollectionPage(kind);
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
  ensureSampleData,
  pickImportInput
}) {
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
    const confirmed = globalThis.confirm('保存した作品、断片、いいね、しおり、引用、設定を消去して初期状態へ戻します。続行しますか。');
    if (!confirmed) {
      return;
    }

    state.exportStatus = '';
    state.importStatus = 'アプリを初期化しています。';
    state.pendingImport = null;
    state.importWorkStatus = '';
    state.importPreview = null;
    renderSettings();

    try {
      await clearAllStores();
      await ensureSampleData();
      await loadStateFromDb();
      state.importStatus = 'アプリを初期化しました。初期データを再投入しています。';
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
