import {
  deriveWorkReadingStatus,
  getReadingStateForWork,
  normalizeHeadingBreakKinds,
  sameBookmarkRecords,
  sortSavedRecords,
  sortUpdatedRecords,
  sortFragments
} from './state.js?v=20260701141942';

function normalizeWorkLoadMode(value) {
  return value === 'manual' ? 'manual' : 'auto';
}

function normalizeConverterBaseUrl(value) {
  return String(value ?? '').trim();
}

export function createAppData({
  state,
  userStoreNames,
  searchResultsBatchSize,
  workLoadModeSettingId,
  converterBaseUrlSettingId,
  canonicalizeBookmarkRecords,
  applyRecordMutations,
  getAllRecords,
  getRecord,
  listBookmarks,
  listLikes,
  putRecord
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
    const [
      works,
      fragmentRecords,
      likeRecords,
      bookmarkRecords,
      readingStateRecords,
      workLoadModeSetting,
      converterBaseUrlSetting
    ] = await Promise.all([
      getAllRecords('works'),
      getAllRecords('fragments'),
      listLikes(),
      listBookmarks(),
      getAllRecords('readingStates'),
      getRecord('settings', workLoadModeSettingId),
      getRecord('settings', converterBaseUrlSettingId)
    ]);
    const fragments = normalizeHeadingBreakKinds(fragmentRecords);
    const canonicalBookmarks = canonicalizeBookmarkRecords(bookmarkRecords, fragments);
    const sortedBookmarkRecords = sortSavedRecords(bookmarkRecords);
    if (!sameBookmarkRecords(sortedBookmarkRecords, canonicalBookmarks)) {
      await applyRecordMutations({
        clearStores: ['bookmarks'],
        putRecords: { bookmarks: canonicalBookmarks }
      });
    }

    state.works = works;
    state.fragments = fragments;
    state.likeRecords = sortSavedRecords(likeRecords);
    state.bookmarkRecords = canonicalBookmarks;
    state.readingStateRecords = sortUpdatedRecords(readingStateRecords);
    state.likes = new Set(state.likeRecords.map((item) => item.fragmentId));
    state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
    state.workLoadMode = normalizeWorkLoadMode(workLoadModeSetting?.value);
    state.converterBaseUrl = normalizeConverterBaseUrl(converterBaseUrlSetting?.value);
  }

  async function deleteWorkCascade(workId) {
    if (!workId) {
      return;
    }

    const workFragments = state.fragments.filter((fragment) => fragment.workId === workId);
    const fragmentIds = workFragments.map((fragment) => fragment.id);

    await applyRecordMutations({
      deleteRecords: {
        works: [workId],
        bookmarks: [workId],
        readingStates: [workId],
        fragments: fragmentIds,
        likes: fragmentIds
      }
    });
  }

  async function resetWorkToUnread(workId) {
    if (!workId) {
      return;
    }

    await applyRecordMutations({
      deleteRecords: {
        readingStates: [workId],
        bookmarks: [workId]
      }
    });
    state.readingStateRecords = state.readingStateRecords.filter((item) => item.workId !== workId);
    state.bookmarkRecords = state.bookmarkRecords.filter((item) => item.workId !== workId);
    state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
  }

  async function clearAllStoresAndResetUi() {
    await applyRecordMutations({ clearStores: userStoreNames });
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
