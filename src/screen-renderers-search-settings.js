import { bindSearchInteractions, bindSettingsInteractions } from './ui-bindings.js?v=20260630135044';
import {
  aozoraSearchResultsMarkup,
  searchBodyMarkup,
  searchImportSheetMarkup,
  searchPreviewMarkup,
  settingsBodyMarkup,
  settingsPendingImportMarkup
} from './views.js?v=20260630135044';

export function createSearchSettingsRenderers({
  app,
  state,
  renderLayout,
  handleAozoraImportFile,
  handleSearchAction,
  handleSettingsAction,
  handleImportFileSelection,
  searchResultsBatchSize,
  helpers
}) {
  const { escapeHtml } = helpers;

  function renderSearch() {
    const preview = state.importPreview;
    const totalResultCount = state.aozoraCatalogResults.length;
    const shownResultCount = Math.min(state.aozoraCatalogVisibleCount, totalResultCount);
    const visibleResults = state.aozoraCatalogResults.slice(0, shownResultCount);
    const previewMarkup = searchPreviewMarkup(preview ? {
      ...preview,
      title: escapeHtml(preview.title),
      author: escapeHtml(preview.author),
      encoding: escapeHtml(preview.encoding),
      existingWorkTitle: escapeHtml(preview.existingWorkTitle ?? ''),
      importSaveInProgress: state.importSaveInProgress
    } : null, `
      <article class="fragment-card fragment-card-break preview-card">
        <p class="break-label">原文空行</p>
      </article>
    `);
    const fetchedAt = state.aozoraCatalogMeta?.fetchedAt
      ? new Date(state.aozoraCatalogMeta.fetchedAt).toLocaleString('ja-JP')
      : '';
    const isLibraryScope = state.searchScope === 'library';
    const catalogMetaHtml = isLibraryScope
      ? `<p class="settings-status settings-status-subtle">本棚 ${escapeHtml(String(state.works.length))}件</p>`
      : (fetchedAt
        ? `<p class="settings-status settings-status-subtle">最終更新: ${escapeHtml(fetchedAt)} / ${escapeHtml(String(state.aozoraCatalogMeta?.recordCount ?? 0))}件</p>`
        : `<p class="settings-status settings-status-subtle">${state.aozoraCatalogLoading ? '作品一覧を読み込んでいます。' : '作品一覧を準備しています。'}</p>`);
    const emptyMessage = state.aozoraCatalogQuery
      ? '一致する作品が見つかりませんでした。'
      : (isLibraryScope
        ? (state.works.length > 0 ? '作品名または著者名で本棚を検索してください。' : '本棚に作品はまだありません。')
        : (state.aozoraCatalogRecords.length > 0
          ? '作品名または著者名で検索してください。'
          : (state.aozoraCatalogLoading ? '作品一覧を読み込んでいます。' : '作品一覧を準備しています。')));
    const catalogResultsMarkup = aozoraSearchResultsMarkup(
      visibleResults.map((result) => ({
        ...result,
        title: escapeHtml(result.title),
        author: escapeHtml(result.author),
        kanaType: escapeHtml(result.kanaType),
        workId: escapeHtml(result.workId),
        href: escapeHtml(result.href ?? result.cardUrl ?? ''),
        cardUrl: escapeHtml(result.cardUrl ?? ''),
        textZipUrl: escapeHtml(result.textZipUrl ?? ''),
        resultType: escapeHtml(result.resultType ?? 'aozora'),
        isImported: Boolean(result.isImported),
        openInNewTab: Boolean(result.openInNewTab),
        copyrightWarning: Boolean(result.copyrightWarning)
      })),
      {
        emptyMessage: escapeHtml(emptyMessage),
        resultSummaryHtml: totalResultCount > 0
          ? `<p class="settings-status settings-status-subtle">全 ${escapeHtml(String(totalResultCount))} 件中 ${escapeHtml(String(shownResultCount))} 件を表示</p>`
          : '',
        resultActionsHtml: totalResultCount > 0
          ? `
            <div class="settings-button-grid">
              ${totalResultCount > shownResultCount
                ? `<button type="button" class="detail-action-button settings-button" data-search-action="show-more-aozora-results">さらに${searchResultsBatchSize}件表示</button>`
                : ''}
              ${shownResultCount > searchResultsBatchSize
                ? '<button type="button" class="detail-action-button settings-button" data-search-action="scroll-search-results-top">先頭へ戻る</button>'
                : ''}
            </div>
          `
          : ''
      }
    );
    const importSheetMarkup = searchImportSheetMarkup({
      isOpen: state.importSheetOpen,
      remoteImportUrl: escapeHtml(state.remoteImportUrl),
      remoteImportStatusHtml: state.importWorkStatus
        ? `<p class="settings-status">${escapeHtml(state.importWorkStatus)}</p>`
        : '',
      importTextDraft: escapeHtml(state.importTextDraft),
      converterBaseUrl: escapeHtml(state.converterBaseUrl),
      importStatusHtml: ''
    });
    const importNoticeHtml = state.importWorkNoticeTone === 'success' && state.importWorkStatus
      ? `
        <article class="info-panel search-import-notice search-import-notice-success" data-search-import-notice aria-live="polite">
          <h2 class="section-title">${state.pendingBridgeAck ? '作品は更新済みです' : '取り込み完了'}</h2>
          <p class="section-text">${escapeHtml(state.importWorkStatus)}</p>
          ${state.pendingBridgeAck
            ? `<div class="settings-button-grid">
                <button type="button" class="detail-action-button settings-button" data-search-action="retry-bridge-ack">${
                  state.pendingBridgeAck.queueRemaining > 0 ? '送信リストを更新して次へ' : '送信リストを更新して完了'
                }</button>
              </div>`
            : ''}
        </article>
      `
      : '';

    renderLayout({
      current: 'search',
      title: '作品を追加',
      subtitle: '青空文庫で作品を探し、公開TXT URL、貼り付けTXT、ZIP/TXT、同一Wi-Fi上のPCから追加できます。',
      body: searchBodyMarkup({
        importNoticeHtml,
        catalogQuery: escapeHtml(state.aozoraCatalogQuery),
        searchScope: state.searchScope,
        remoteImportUrl: escapeHtml(state.remoteImportUrl),
        importTextDraft: escapeHtml(state.importTextDraft),
        converterBaseUrl: escapeHtml(state.converterBaseUrl),
        catalogStatusHtml: state.aozoraCatalogStatus ? `<p class="settings-status">${escapeHtml(state.aozoraCatalogStatus)}</p>` : '',
        catalogMetaHtml,
        catalogHelpHtml: !isLibraryScope
          ? '<p class="settings-status settings-status-subtle">ZIPを保存したら、下の「作品を取り込む」から選んでください。</p>'
          : '',
        catalogResultsMarkup,
        importSheetMarkup,
        previewMarkup
      })
    });

    bindSearchInteractions(app, {
      onSelectFile: handleAozoraImportFile,
      onDropFile: handleAozoraImportFile,
      onAction: async (action, payload) => {
        await handleSearchAction(action, payload);
      }
    });
  }

  function renderSettings() {
    const pendingImportSummary = settingsPendingImportMarkup(state.pendingImport ? {
      ...state.pendingImport,
      fileName: escapeHtml(state.pendingImport.fileName)
    } : null, escapeHtml(state.pendingImport?.summary ?? ''));

    renderLayout({
      current: 'settings',
      title: '設定',
      subtitle: 'バックアップや読み込みはここで扱えます。',
      body: settingsBodyMarkup({
        exportStatusHtml: state.exportStatus ? `<p class="settings-status">${escapeHtml(state.exportStatus)}</p>` : '',
        importStatusHtml: state.importStatus ? `<p class="settings-status">${escapeHtml(state.importStatus)}</p>` : '',
        readingStatusHtml: `<p class="settings-status settings-status-subtle">現在: ${escapeHtml(state.workLoadMode === 'auto' ? '自動で続ける' : '手動で続ける')}</p>`,
        workLoadMode: state.workLoadMode,
        releaseStatusHtml: state.releaseStatus ? `<p class="settings-status">${escapeHtml(state.releaseStatus)}</p>` : '',
        resetConfirmationStep: state.resetConfirmationStep,
        resetStatusHtml: state.resetStatus ? `<p class="settings-status">${escapeHtml(state.resetStatus)}</p>` : '',
        pendingImportMarkup: pendingImportSummary
      })
    });

    bindSettingsInteractions(app, {
      onAction: async (action) => {
        await handleSettingsAction(action);
      },
      onImportFile: handleImportFileSelection
    });
  }

  return {
    renderSearch,
    renderSettings
  };
}
