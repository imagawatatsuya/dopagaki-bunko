import { canonicalizeBookmarkRecords, getBookmarkForWork, getFragmentById } from './state.js?v=20260629112900';
import { STORE_NAMES, applyRecordMutations, getAllRecords, getRecord, putRecord, verifyStoresEmpty } from './db.js?v=20260629112900';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260629112900';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260629112900';
import {
  createBookmarkActions,
  createCollectionActions,
  createDetailActions,
  createSearchActions,
  createSettingsActions
} from './app-actions.js?v=20260629112900';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260629112900';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260629112900';
import { derivePreviewFromText } from './import-preview.js?v=20260629112900';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260629112900';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260629112900';
import { AOZORA_CATALOG_ASSET_PATH, AOZORA_CATALOG_META_ID, buildAozoraCatalogMeta, normalizeAozoraCatalogPayload } from './aozora-catalog.js?v=20260629112900';
import { searchAozoraCatalog, searchWorkRecords } from './aozora-search.js?v=20260629112900';
import { buildImportSummary, createAppShell } from './app-shell.js?v=20260629112900';
import { createAppData } from './app-data.js?v=20260629112900';
import { createScreenRenderers } from './screen-renderers.js?v=20260629112900';
import {
  SEARCH_RESULTS_BATCH_SIZE,
  WORK_LOAD_MODE_SETTING_ID,
  WORK_PAGE_BATCH_SIZE,
  CONVERTER_BASE_URL_SETTING_ID
} from './app-config.js?v=20260629112900';
import { createAppRouter } from './app-router.js?v=20260629112900';
import { createInitialAppState } from './app-state.js?v=20260629112900';
import { normalizeConverterBaseUrl } from './remote-import.js?v=20260629112900';

export function createAppRuntime({ app }) {
  const state = createInitialAppState();
  const appShell = createAppShell({ app, state });
  const appData = createAppData({
    state,
    userStoreNames: STORE_NAMES,
    searchResultsBatchSize: SEARCH_RESULTS_BATCH_SIZE,
    workLoadModeSettingId: WORK_LOAD_MODE_SETTING_ID,
    converterBaseUrlSettingId: CONVERTER_BASE_URL_SETTING_ID,
    canonicalizeBookmarkRecords,
    applyRecordMutations,
    getAllRecords,
    getRecord,
    listBookmarks,
    listLikes,
    putRecord
  });

  const {
    clearAllStoresAndResetUi,
    deleteWorkCascade,
    ensureWorkMarkedReadingAtIndex,
    loadStateFromDb,
    normalizeWorkLoadMode,
    resetWorkToUnread,
    saveWorkReadingState
  } = appData;

  let renderers;

  const {
    applySearchRouteIntent,
    ensureAozoraCatalogReady,
    handleAozoraImportFile,
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
    converterBaseUrlSettingId: CONVERTER_BASE_URL_SETTING_ID,
    normalizeConverterBaseUrl,
    AOZORA_CATALOG_META_ID,
    AOZORA_CATALOG_ASSET_PATH,
    getAllRecords,
    getRecord,
    putRecord,
    applyRecordMutations,
    loadStateFromDb
  });

  const route = createAppRouter({
    getRenderers: () => renderers,
    scrollToPageTop: appShell.scrollToPageTop,
    ensureAozoraCatalogReady,
    applySearchRouteIntent
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
    verifyUserStoresEmpty: () => verifyStoresEmpty(STORE_NAMES),
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
    ensureWorkMarkedReadingAtIndex,
    deleteWorkCascade,
    handleAozoraImportFile,
    handleCollectionAction,
    handleDetailAction,
    handleImportFileSelection,
    handleSearchAction,
    handleSettingsAction,
    loadStateFromDb,
    removeBookmark,
    removeLike,
    resetWorkToUnread,
    saveReaderFontScale: appShell.saveReaderFontScale,
    saveLike,
    saveWorkReadingState,
    toggleBookmark,
    workPageBatchSize: WORK_PAGE_BATCH_SIZE,
    searchResultsBatchSize: SEARCH_RESULTS_BATCH_SIZE
  });

  let resumeRefreshPending = false;
  let suppressResumeRefreshUntil = 0;

  async function refreshAfterResume() {
    if (Date.now() < suppressResumeRefreshUntil) {
      return;
    }

    if (resumeRefreshPending) {
      return;
    }

    resumeRefreshPending = true;
    try {
      await loadStateFromDb();
      state.readerActionStatus = '';
      state.readerActionStatusTone = '';
      route();
    } catch (error) {
      console.error(error);
      state.readerActionStatusTone = 'error';
      state.readerActionStatus = `保存データの再読込に失敗しました: ${error?.message ?? '不明なエラー'}`;
      route();
    } finally {
      resumeRefreshPending = false;
    }
  }

  async function start() {
    renderers.renderLoading();
    const recoveryGuideTimer = globalThis.setTimeout(() => {
      renderers.renderLoading('読み込みに時間がかかっています。この表示が続く場合は、このタブを閉じて新しいタブでdopagaki-bunkoを開き直してください。アプリの初期化はしないでください。');
    }, 12000);

    try {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      appShell.loadReaderFontScale();
      await loadStateFromDb();
      const catalogInitialization = initializeAozoraCatalogState();
      route();
      void catalogInitialization
        .catch((error) => {
          console.error(error);
          state.aozoraCatalogLoading = false;
          state.aozoraCatalogStatus = `作品一覧の準備に失敗しました: ${error?.message ?? '不明なエラー'}`;
        })
        .finally(() => {
          if ((location.hash || '#/').startsWith('#/search')) {
            route();
          }
        });
    } catch (error) {
      console.error(error);
      renderers.renderError(error);
    } finally {
      globalThis.clearTimeout(recoveryGuideTimer);
    }
  }

  function handleBridgeMessage(event) {
    const payload = event?.data;
    if (payload?.type !== 'dopagaki-bridge-import-v1') {
      return;
    }
    suppressResumeRefreshUntil = Date.now() + 5000;
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({
        type: 'dopagaki-bridge-received-v1',
        bridgeImportId: String(payload.bridgeImportId ?? '')
      }, event.origin);
    }
    void handleSearchAction('import-bridge-message', {
      bridgePayload: {
        ...payload,
        bridgeSourceWindow: event.source ?? null
      }
    });
  }

  function focusBridgeImportPreview() {
    if (state.importPreview?.sourceType !== 'bridge-import') {
      return;
    }
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => {
        void handleSearchAction('focus-import-preview');
      });
    });
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      return;
    }

    void refreshAfterResume();
    focusBridgeImportPreview();
  }

  function handlePageShow() {
    void refreshAfterResume();
    focusBridgeImportPreview();
  }

  function handleWindowFocus() {
    void refreshAfterResume();
    focusBridgeImportPreview();
  }

  globalThis.addEventListener('message', handleBridgeMessage);
  globalThis.addEventListener('pageshow', handlePageShow);
  globalThis.addEventListener('focus', handleWindowFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    route,
    start
  };
}
