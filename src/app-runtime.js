import { canonicalizeBookmarkRecords, getBookmarkForWork, getFragmentById } from './state.js?v=20260617184854';
import { ALL_STORE_NAMES, clearStore, deleteRecord, getAllRecords, getRecord, putRecord, putRecords } from './db.js?v=20260617184854';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260617184854';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260617184854';
import {
  createBookmarkActions,
  createCollectionActions,
  createDetailActions,
  createSearchActions,
  createSettingsActions
} from './app-actions.js?v=20260617184854';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260617184854';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260617184854';
import { derivePreviewFromText } from './import-preview.js?v=20260617184854';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260617184854';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260617184854';
import { AOZORA_CATALOG_ASSET_PATH, AOZORA_CATALOG_META_ID, buildAozoraCatalogMeta, normalizeAozoraCatalogPayload } from './aozora-catalog.js?v=20260617184854';
import { searchAozoraCatalog, searchWorkRecords } from './aozora-search.js?v=20260617184854';
import { buildImportSummary, createAppShell } from './app-shell.js?v=20260617184854';
import { createAppData } from './app-data.js?v=20260617184854';
import { createScreenRenderers } from './screen-renderers.js?v=20260617184854';
import { SEARCH_RESULTS_BATCH_SIZE, WORK_LOAD_MODE_SETTING_ID, WORK_PAGE_BATCH_SIZE } from './app-config.js?v=20260617184854';
import { createAppRouter } from './app-router.js?v=20260617184854';
import { createInitialAppState } from './app-state.js?v=20260617184854';

export function createAppRuntime({ app }) {
  const state = createInitialAppState();
  const appShell = createAppShell({ app, state });
  const appData = createAppData({
    state,
    allStoreNames: ALL_STORE_NAMES,
    searchResultsBatchSize: SEARCH_RESULTS_BATCH_SIZE,
    workLoadModeSettingId: WORK_LOAD_MODE_SETTING_ID,
    canonicalizeBookmarkRecords,
    clearStore,
    deleteRecord,
    getAllRecords,
    getRecord,
    listBookmarks,
    listLikes,
    putRecord,
    putRecords
  });

  const {
    clearAllStoresAndResetUi,
    deleteWorkCascade,
    ensureWorkMarkedReading,
    loadStateFromDb,
    normalizeWorkLoadMode,
    saveWorkReadingState
  } = appData;

  let renderers;

  const {
    ensureAozoraCatalogReady,
    handleAozoraZipFile,
    handleSearchAction,
    initializeAozoraCatalogState
  } = createSearchActions({
    state,
    renderSearch: () => renderers.renderSearch(),
    readFileAsArrayBuffer,
    extractAozoraTxtFromZip,
    buildAozoraCatalogMeta,
    normalizeAozoraCatalogPayload,
    decodeAozoraText,
    derivePreviewFromText,
    searchAozoraCatalog,
    searchWorkRecords,
    AOZORA_CATALOG_META_ID,
    AOZORA_CATALOG_ASSET_PATH,
    getAllRecords,
    clearStore,
    putRecord,
    putRecords,
    loadStateFromDb
  });

  const route = createAppRouter({
    getRenderers: () => renderers,
    scrollToPageTop: appShell.scrollToPageTop,
    ensureAozoraCatalogReady
  });

  const { toggleBookmark } = createBookmarkActions({
    state,
    getFragmentById,
    getBookmarkForWork,
    saveBookmark,
    listBookmarks,
    canonicalizeBookmarkRecords,
    loadStateFromDb,
    route
  });

  const { handleDetailAction, confirmLikeRemovalIfNeeded } = createDetailActions({
    state,
    getFragmentById,
    removeLike,
    saveLike,
    toggleBookmark,
    loadStateFromDb,
    route
  });

  const { handleCollectionAction } = createCollectionActions({
    state,
    loadStateFromDb,
    renderCollectionPage: (kind, options) => renderers.renderCollectionPage(kind, options),
    removeBookmark,
    removeLike,
    saveLike,
    confirmLikeRemovalIfNeeded
  });

  const { handleImportFileSelection, handleSettingsAction } = createSettingsActions({
    state,
    renderSettings: () => renderers.renderSettings(),
    downloadExportJson,
    readImportFile,
    importJsonData,
    buildImportSummary,
    loadStateFromDb,
    clearAllStores: clearAllStoresAndResetUi,
    saveWorkLoadMode: async (mode) => {
      await putRecord('settings', {
        id: WORK_LOAD_MODE_SETTING_ID,
        value: normalizeWorkLoadMode(mode),
        updatedAt: new Date().toISOString()
      });
    },
    pickImportInput: () => {
      app.querySelector('[data-settings-input="import-json"]')?.click();
    }
  });

  renderers = createScreenRenderers({
    app,
    appShell,
    state,
    route,
    ensureWorkMarkedReading,
    deleteWorkCascade,
    handleAozoraZipFile,
    handleCollectionAction,
    handleDetailAction,
    handleImportFileSelection,
    handleSearchAction,
    handleSettingsAction,
    loadStateFromDb,
    removeBookmark,
    removeLike,
    saveReaderFontScale: appShell.saveReaderFontScale,
    saveLike,
    saveWorkReadingState,
    toggleBookmark,
    workPageBatchSize: WORK_PAGE_BATCH_SIZE,
    searchResultsBatchSize: SEARCH_RESULTS_BATCH_SIZE
  });

  async function start() {
    renderers.renderLoading();

    try {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      appShell.loadReaderFontScale();
      await loadStateFromDb();
      await initializeAozoraCatalogState();
      route();
    } catch (error) {
      console.error(error);
      renderers.renderError(error);
    }
  }

  return {
    route,
    start
  };
}
