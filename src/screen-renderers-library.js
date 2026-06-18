import {
  buildLibraryWorksByStatus,
  buildSavedItems,
  countWorkTextFragments,
  getBookmarkForWork,
  getLikeRecordsForWork,
  savedCollectionLabel
} from './state.js?v=20260619034024';
import {
  buildCollectionHash,
  buildLibraryHash
} from './router.js?v=20260619034024';
import {
  bindCollectionActions,
  bindLibraryWorkActions
} from './ui-bindings.js?v=20260619034024';
import {
  collectionBodyMarkup,
  libraryBodyMarkup,
  libraryTabButtonMarkup
} from './views.js?v=20260619034024';
import {
  LIBRARY_TAB_ORDER,
  libraryDeleteScopeLabel,
  normalizeLibraryTab,
  readingStatusLabel
} from './renderer-shared.js?v=20260619034024';

export function createLibraryRenderers({
  app,
  state,
  renderLayout,
  deleteWorkCascade,
  handleCollectionAction,
  loadStateFromDb,
  helpers
}) {
  const {
    escapeHtml,
    findWorkById,
    renderSavedItemCard
  } = helpers;

  function renderLibrary(options = {}) {
    const activeTab = normalizeLibraryTab(options.tab);
    const worksByStatus = buildLibraryWorksByStatus({
      works: state.works,
      bookmarkRecords: state.bookmarkRecords,
      readingStateRecords: state.readingStateRecords
    });
    const visibleWorks = worksByStatus[activeTab] ?? [];
    const worksHtml = visibleWorks.map((work) => {
      const bookmark = getBookmarkForWork(state.bookmarkRecords, work.id);
      const likeCount = getLikeRecordsForWork(state.likeRecords, state.fragments, work.id).length;
      const workSummaryHtml = `
        <h2 class="section-title library-work-title">${escapeHtml(work.title)}</h2>
        <p class="section-text library-work-author">${escapeHtml(work.author ?? '')}</p>
        <p class="settings-status settings-status-subtle">${countWorkTextFragments(state.fragments, work.id)}断片</p>
        ${bookmark ? `<p class="settings-status settings-status-subtle">しおり: 断片 ${bookmark.fragmentIndex}</p>` : ''}
        ${likeCount > 0 ? `<p class="settings-status settings-status-subtle">ふせん: ${likeCount}枚</p>` : ''}
      `;

      return `
        <article class="info-panel info-panel-library-work info-panel-library-work-with-menu" data-library-menu>
          <button
            type="button"
            class="library-menu-button"
            data-library-action="toggle-menu"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label="${escapeHtml(work.title)} の操作を開く"
          >…</button>
          <div class="library-inline-menu" role="menu" aria-label="${escapeHtml(work.title)} の操作">
            <button type="button" class="library-delete-button" data-library-action="delete-work" data-work-id="${escapeHtml(work.id)}" role="menuitem">削除</button>
          </div>
          <a class="panel-link panel-link-library-work" href="#/work/${encodeURIComponent(work.id)}">
            ${workSummaryHtml}
          </a>
        </article>
      `;
    }).join('');
    const collectionsHtml = `
      <article class="info-panel">
        <h2 class="section-title">保存一覧</h2>
        <p class="settings-status settings-status-subtle">しおり ${state.bookmarkRecords.length}件 / ふせん ${state.likeRecords.length}件</p>
        <div class="settings-button-grid">
          <a class="detail-action-button detail-action-link" href="${buildCollectionHash('bookmarks')}">しおり一覧を開く</a>
          <a class="detail-action-button detail-action-link" href="${buildCollectionHash('likes')}">ふせん一覧を開く</a>
        </div>
      </article>
    `;

    renderLayout({
      current: 'library',
      title: '本棚',
      subtitle: '保存した作品をここで読み継ぎます。',
      body: libraryBodyMarkup({
        tabsHtml: LIBRARY_TAB_ORDER.map((tab) => libraryTabButtonMarkup({
          label: `${readingStatusLabel(tab)} ${worksByStatus[tab]?.length ?? 0}`,
          href: buildLibraryHash({ tab }),
          isActive: tab === activeTab,
          panelId: 'library-works-panel',
          tabId: `library-tab-${tab}`
        })).join(''),
        activeTabLabel: readingStatusLabel(activeTab),
        count: visibleWorks.length,
        worksHtml,
        emptyTitle: `${readingStatusLabel(activeTab)}の作品はまだありません`,
        emptyText: activeTab === 'reading'
          ? '読み始めた作品はここに並びます。'
          : activeTab === 'unread'
            ? '追加した作品のうち、まだ開いていないものがここに並びます。'
            : '原文終端を押した作品がここに並びます。',
        collectionsHtml
      })
    });

    state.libraryWorkActionsCleanup = bindLibraryWorkActions(app, async (workId) => {
      const work = findWorkById(workId);
      if (!work) {
        return;
      }

      const confirmed = window.confirm(`「${work.title}」を${libraryDeleteScopeLabel(activeTab)}から削除します。よろしいですか。`);
      if (!confirmed) {
        return;
      }

      await deleteWorkCascade(workId);
      await loadStateFromDb();
      renderLibrary({ tab: activeTab });
    });
  }

  function renderCollectionPage(kind, options = {}) {
    const workId = options.workId || '';
    const work = workId ? findWorkById(workId) : null;
    const collectionHash = buildCollectionHash(kind, workId ? { workId } : {});
    const allItems = buildSavedItems({
      kind,
      bookmarkRecords: state.bookmarkRecords,
      likeRecords: state.likeRecords,
      fragments: state.fragments,
      findWorkById
    });
    const items = workId ? allItems.filter((item) => item.fragment?.workId === workId) : allItems;
    const label = savedCollectionLabel(kind);
    const titleLabel = kind === 'likes' ? 'ふせん' : label;
    const subtitle = work
      ? `「${work.title}」の${titleLabel}だけをここから開けます。`
      : kind === 'bookmarks'
        ? '作品ごとの最新しおりをここから開けます。'
        : '保存した断片へここから戻れます。';
    const description = work
      ? `この作品で付けた${titleLabel}を新しい順に表示します。`
      : kind === 'bookmarks'
        ? '作品ごとの現在しおりを新しい順に表示します。'
        : `${titleLabel}した断片を新しい順に表示します。`;
    const emptyText = kind === 'bookmarks'
      ? '断片個別ページか作品TLでしおりを付けると、ここから再開できます。'
      : work
        ? `この作品で${titleLabel}を付けた断片はまだありません。`
        : '断片個別ページで保存すると、ここから再アクセスできます。';
    const itemsHtml = items.map((item) => renderSavedItemCard(kind, item, { collectionHash })).join('');

    renderLayout({
      current: 'library',
      title: `${titleLabel}一覧`,
      subtitle,
      body: collectionBodyMarkup({
        label: escapeHtml(titleLabel),
        description: escapeHtml(description),
        count: items.length,
        emptyTitle: `${escapeHtml(titleLabel)}はまだありません`,
        emptyText: escapeHtml(emptyText),
        itemsHtml
      })
    });

    bindCollectionActions(app, async (targetKind, recordId, action) => {
      await handleCollectionAction(targetKind, recordId, action, { workId });
    });
  }

  return {
    renderCollectionPage,
    renderLibrary
  };
}
