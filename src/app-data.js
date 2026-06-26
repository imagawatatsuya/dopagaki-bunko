import {
  deriveWorkReadingStatus,
  getReadingStateForWork,
  normalizeHeadingBreakKinds,
  sameBookmarkRecords,
  sortSavedRecords,
  sortUpdatedRecords,
  sortFragments
} from './state.js?v=20260627054349';

function normalizeWorkLoadMode(value) {
  return value === 'manual' ? 'manual' : 'auto';
}

function normalizeConverterBaseUrl(value) {
  return String(value ?? '').trim();
}

export function createAppData({
  state,
  allStoreNames,
  searchResultsBatchSize,
  workLoadModeSettingId,
  converterBaseUrlSettingId,
  canonicalizeBookmarkRecords,
  clearStore,
  deleteRecord,
  getAllRecords,
  getRecord,
  listBookmarks,
  listLikes,
  putRecord,
  putRecords
}) {
  const pendingReadingStartWorkIds = new Set();

  async function saveWorkReadingState(workId, status) {
    const normalizedStatus = status === 'completed' ? 'completed' : 'reading';
    const currentRecord = getReadingStateForWork(state.readingStateRecords, workId);
    const record = {
      id: workId,
      workId,
      status: normalizedStatus,
      updatedAt: new Date().toISOString(),
      createdAt: currentRecord?.createdAt ?? new Date().toISOString()
    };

    await putRecord('readingStates', record);
    const existingIndex = state.readingStateRecords.findIndex((item) => item.workId === workId);
    if (existingIndex >= 0) {
      state.readingStateRecords.splice(existingIndex, 1, record);
    } else {
      state.readingStateRecords = [record, ...state.readingStateRecords];
    }
  }

  function getWorkReadingStatus(workId) {
    return deriveWorkReadingStatus({
      workId,
      readingStateRecords: state.readingStateRecords,
      bookmarkRecords: state.bookmarkRecords
    });
  }

  function ensureWorkMarkedReadingAtIndex(workId, fragmentIndex) {
    const normalizedIndex = Number(fragmentIndex);
    if (!workId || !Number.isFinite(normalizedIndex) || normalizedIndex < 3 || getWorkReadingStatus(workId) !== 'unread' || pendingReadingStartWorkIds.has(workId)) {
      return;
    }

    pendingReadingStartWorkIds.add(workId);
    void saveWorkReadingState(workId, 'reading').finally(() => {
      pendingReadingStartWorkIds.delete(workId);
    });
  }

  async function loadStateFromDb() {
    state.works = await getAllRecords('works');
    state.fragments = normalizeHeadingBreakKinds(await getAllRecords('fragments'));
    state.likeRecords = sortSavedRecords(await listLikes());
    const bookmarkRecords = await listBookmarks();
    const canonicalBookmarks = canonicalizeBookmarkRecords(bookmarkRecords, state.fragments);
    const sortedBookmarkRecords = sortSavedRecords(bookmarkRecords);
    if (!sameBookmarkRecords(sortedBookmarkRecords, canonicalBookmarks)) {
      await clearStore('bookmarks');
      if (canonicalBookmarks.length > 0) {
        await putRecords('bookmarks', canonicalBookmarks);
      }
    }
    state.bookmarkRecords = canonicalBookmarks;
    state.readingStateRecords = sortUpdatedRecords(await getAllRecords('readingStates'));
    state.likes = new Set(state.likeRecords.map((item) => item.fragmentId));
    state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
    const workLoadModeSetting = await getRecord('settings', workLoadModeSettingId);
    state.workLoadMode = normalizeWorkLoadMode(workLoadModeSetting?.value);
    const converterBaseUrlSetting = await getRecord('settings', converterBaseUrlSettingId);
    state.converterBaseUrl = normalizeConverterBaseUrl(converterBaseUrlSetting?.value);
  }

  async function deleteWorkCascade(workId) {
    if (!workId) {
      return;
    }

    const workFragments = state.fragments.filter((fragment) => fragment.workId === workId);
    const fragmentIds = workFragments.map((fragment) => fragment.id);

    await deleteRecord('works', workId);
    await deleteRecord('bookmarks', workId);
    await deleteRecord('readingStates', workId);

    for (const fragmentId of fragmentIds) {
      await deleteRecord('fragments', fragmentId);
      await deleteRecord('likes', fragmentId);
    }
  }

  async function resetWorkToUnread(workId) {
    if (!workId) {
      return;
    }

    await deleteRecord('readingStates', workId);
    await deleteRecord('bookmarks', workId);
    state.readingStateRecords = state.readingStateRecords.filter((item) => item.workId !== workId);
    state.bookmarkRecords = state.bookmarkRecords.filter((item) => item.workId !== workId);
    state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
  }

  async function clearAllStoresAndResetUi() {
    for (const storeName of allStoreNames) {
      await clearStore(storeName);
    }
    state.aozoraCatalogQuery = '';
    state.aozoraCatalogStatus = '';
    state.aozoraCatalogLoading = false;
    state.aozoraCatalogMeta = null;
    state.aozoraCatalogRecords = [];
    state.aozoraCatalogResults = [];
    state.aozoraCatalogVisibleCount = searchResultsBatchSize;
    state.searchScope = 'aozora';
    state.remoteImportUrl = '';
    state.importTextDraft = '';
    state.importTextLastImported = '';
    state.converterBaseUrl = '';
    state.importSheetOpen = false;
  }

  return {
    clearAllStoresAndResetUi,
    resetWorkToUnread,
    deleteWorkCascade,
    ensureWorkMarkedReadingAtIndex,
    loadStateFromDb,
    normalizeWorkLoadMode,
    saveWorkReadingState
  };
}
