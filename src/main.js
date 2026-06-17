import { canonicalizeBookmarkRecords, getBookmarkForWork, getFragmentById } from './state.js?v=20260617150327';
import { ALL_STORE_NAMES, clearStore, deleteRecord, getAllRecords, getRecord, putRecord, putRecords } from './db.js?v=20260617150327';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260617150327';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260617150327';
import {
  createBookmarkActions,
  createCollectionActions,
  createDetailActions,
  createSearchActions,
  createSettingsActions
} from './app-actions.js?v=20260617150327';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260617150327';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260617150327';
import { derivePreviewFromText } from './import-preview.js?v=20260617150327';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260617150327';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260617150327';
import { parseHashRoute } from './router.js?v=20260617150327';
import { AOZORA_CATALOG_ASSET_PATH, AOZORA_CATALOG_META_ID, buildAozoraCatalogMeta, normalizeAozoraCatalogPayload } from './aozora-catalog.js?v=20260617150327';
import { searchAozoraCatalog } from './aozora-search.js?v=20260617150327';
import { buildImportSummary, createAppShell } from './app-shell.js?v=20260617150327';
import { createAppData } from './app-data.js?v=20260617150327';
import { createScreenRenderers } from './screen-renderers.js?v=20260617150327';

const app = document.querySelector('#app');
const WORK_PAGE_BATCH_SIZE = 24;
const SEARCH_RESULTS_BATCH_SIZE = 25;
const WORK_LOAD_MODE_SETTING_ID = 'setting:work-load-mode';

const state = {
  works: [],
  fragments: [],
  likes: new Set(),
  bookmarks: new Set(),
  likeRecords: [],
  bookmarkRecords: [],
  readingStateRecords: [],
  exportStatus: '',
  importStatus: '',
  releaseStatus: '',
  pendingImport: null,
  importWorkStatus: '',
  importWorkNoticeTone: '',
  importPreview: null,
  importSheetOpen: false,
  aozoraCatalogQuery: '',
  aozoraCatalogStatus: '',
  aozoraCatalogLoading: false,
  aozoraCatalogMeta: null,
  aozoraCatalogRecords: [],
  aozoraCatalogResults: [],
  aozoraCatalogVisibleCount: SEARCH_RESULTS_BATCH_SIZE,
  workLoadMode: 'auto',
  readerFontScale: 1,
  libraryWorkActionsCleanup: null,
  workHeaderProgressCleanup: null,
  workAutoLoadCleanup: null
};

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

function route() {
  const hash = location.hash || '#/';
  const routeState = parseHashRoute(hash);

  if (routeState.path.startsWith('#/fragment/')) {
    renderers.renderFragment(decodeURIComponent(routeState.path.replace('#/fragment/', '')), {
      returnTo: routeState.params.get('returnTo') || ''
    });
    return;
  }

  if (routeState.path.startsWith('#/work/')) {
    renderers.renderWorkPage(decodeURIComponent(routeState.path.replace('#/work/', '')), {
      visible: routeState.params.get('visible'),
      focus: routeState.params.get('focus') || ''
    });
    return;
  }

  if (routeState.path.startsWith('#/collection/')) {
    renderers.renderCollectionPage(decodeURIComponent(routeState.path.replace('#/collection/', '')), {
      workId: routeState.params.get('workId') || ''
    });
    return;
  }

  switch (routeState.path) {
    case '#/library':
      appShell.scrollToPageTop();
      renderers.renderLibrary({
        tab: routeState.params.get('tab') || ''
      });
      break;
    case '#/search':
      appShell.scrollToPageTop();
      renderers.renderSearch();
      void ensureAozoraCatalogReady();
      break;
    case '#/settings':
      appShell.scrollToPageTop();
      renderers.renderSettings();
      break;
    case '#/':
    default:
      if (!routeState.params.get('focus')) {
        appShell.scrollToPageTop();
      }
      renderers.renderHome({
        focusFragmentId: routeState.params.get('focus') || ''
      });
      break;
  }
}

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
  AOZORA_CATALOG_META_ID,
  AOZORA_CATALOG_ASSET_PATH,
  getAllRecords,
  clearStore,
  putRecord,
  putRecords,
  loadStateFromDb
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

async function startApp() {
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

window.addEventListener('hashchange', route);
startApp();
