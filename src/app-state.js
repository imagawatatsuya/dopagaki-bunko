import { SEARCH_RESULTS_BATCH_SIZE } from './app-config.js?v=20260620003650';

export function createInitialAppState() {
  return {
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
    searchScope: 'aozora',
    remoteImportUrl: '',
    importTextDraft: '',
    converterBaseUrl: '',
    workLoadMode: 'auto',
    readerFontScale: 1,
    libraryWorkActionsCleanup: null,
    workHeaderProgressCleanup: null,
    workAutoLoadCleanup: null
  };
}
