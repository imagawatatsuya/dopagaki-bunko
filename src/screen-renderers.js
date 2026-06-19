import {
  errorBodyMarkup,
  loadingBodyMarkup
} from './views.js?v=20260620042258';
import { createRendererHelpers } from './renderer-shared.js?v=20260620042258';
import { createHomeDetailRenderers } from './screen-renderers-home-detail.js?v=20260620042258';
import { createLibraryRenderers } from './screen-renderers-library.js?v=20260620042258';
import { createSearchSettingsRenderers } from './screen-renderers-search-settings.js?v=20260620042258';
import { createWorkRenderers } from './screen-renderers-work.js?v=20260620042258';

export function createScreenRenderers({
  app,
  appShell,
  state,
  route,
  ensureWorkMarkedReading,
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
  saveReaderFontScale,
  saveLike,
  saveWorkReadingState,
  toggleBookmark,
  workPageBatchSize,
  searchResultsBatchSize
}) {
  const {
    escapeHtml,
    renderLayout,
    renderWorkLayout
  } = appShell;
  const helpers = createRendererHelpers({
    state,
    appShell,
    workPageBatchSize
  });

  function renderLoading(message = '読書データを準備しています。') {
    renderLayout({
      current: 'home',
      title: 'ホームTL',
      subtitle: '初回データを確認しています。',
      body: loadingBodyMarkup(escapeHtml(message))
    });
  }

  function renderError(error) {
    renderLayout({
      current: 'home',
      title: 'ホームTL',
      subtitle: 'データの読み込みに失敗しました。',
      body: errorBodyMarkup(escapeHtml(error?.message ?? '不明なエラーが発生しました。'))
    });
  }

  const homeDetailRenderers = createHomeDetailRenderers({
    app,
    state,
    renderLayout,
    renderLoading,
    handleDetailAction,
    ensureWorkMarkedReading,
    workPageBatchSize,
    helpers
  });
  const libraryRenderers = createLibraryRenderers({
    app,
    state,
    renderLayout,
    deleteWorkCascade,
    handleCollectionAction,
    loadStateFromDb,
    helpers
  });
  const workRenderers = createWorkRenderers({
    app,
    state,
    route,
    renderError,
    renderWorkLayout,
    renderReaderScaleControls: appShell.renderReaderScaleControls,
    ensureWorkMarkedReading,
    loadStateFromDb,
    removeBookmark,
    removeLike,
    saveLike,
    saveReaderFontScale,
    saveWorkReadingState,
    toggleBookmark,
    workPageBatchSize,
    helpers
  });
  const searchSettingsRenderers = createSearchSettingsRenderers({
    app,
    state,
    renderLayout,
    handleAozoraImportFile,
    handleSearchAction,
    handleSettingsAction,
    handleImportFileSelection,
    searchResultsBatchSize,
    helpers
  });

  return {
    renderCollectionPage: libraryRenderers.renderCollectionPage,
    renderError,
    renderFragment: homeDetailRenderers.renderFragment,
    renderHome: homeDetailRenderers.renderHome,
    renderLibrary: libraryRenderers.renderLibrary,
    renderLoading,
    renderSearch: searchSettingsRenderers.renderSearch,
    renderSettings: searchSettingsRenderers.renderSettings,
    renderWorkPage: workRenderers.renderWorkPage
  };
}
