import {
  buildHomeTimelineEvents,
  buildLibraryWorksByStatus,
  buildSavedItems,
  countWorkTextFragments,
  deriveWorkReadingStatus,
  getBookmarkForWork,
  getReadableFragments,
  getReadableWorkFragments,
  getVisibleCountParam,
  getLikeRecordsForWork,
  sliceWorkFragmentsForVisibleCount,
  savedCollectionLabel
} from './state.js?v=20260617152050';
import {
  buildCollectionHash,
  buildFragmentHash,
  buildLibraryHash,
  buildWorkEndHash,
  buildWorkOutlineHash,
  buildWorkHash,
  parseHashRoute
} from './router.js?v=20260617152050';
import {
  bindCollectionActions,
  bindDetailActions,
  bindLibraryWorkActions,
  bindReaderScaleControls,
  bindSearchInteractions,
  bindSettingsInteractions,
  bindWorkAutoLoad,
  bindWorkHeaderActions,
  bindWorkHeaderProgress,
  bindWorkOverlayActions,
  bindWorkStateActions,
  focusFragmentCard,
  updateWorkOverlayButton
} from './ui-bindings.js?v=20260617152050';
import {
  aozoraSearchResultsMarkup,
  breakCardMarkup,
  collectionBodyMarkup,
  errorBodyMarkup,
  fragmentDetailBodyMarkup,
  homeBodyMarkup,
  libraryBodyMarkup,
  libraryTabButtonMarkup,
  loadingBodyMarkup,
  savedItemCardMarkup,
  searchBodyMarkup,
  searchImportSheetMarkup,
  searchPreviewMarkup,
  settingsBodyMarkup,
  settingsPendingImportMarkup,
  timelineCardMarkup,
  workBodyMarkup,
  workEndingCardMarkup
} from './views.js?v=20260617152050';
import { estimateFragmentOverlayRisk } from './fragmenter.js?v=20260617152050';

const LIBRARY_TAB_ORDER = ['reading', 'unread', 'completed'];
const LIBRARY_TAB_LABELS = {
  reading: '読書中',
  unread: '未読',
  completed: '読了'
};
const WORK_END_MARKER_ID = 'work-end-marker';

function calculateRemainingPercent(shownCount, totalCount) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return 0;
  }

  const progressPercent = Math.round((shownCount / totalCount) * 100);
  return Math.max(0, 100 - progressPercent);
}

function renderWorkHeaderMeta(shownCount, totalCount) {
  return `
    <div class="page-header-meta" aria-label="作品進捗">
      <button type="button" class="page-header-pill page-header-pill-button" data-work-header-action="jump-to-fragment">断片 <span data-work-progress-current>${shownCount}</span> / <span data-work-progress-total>${totalCount}</span></button>
      <span class="page-header-pill page-header-pill-subtle">残り <span data-work-progress-remaining>${calculateRemainingPercent(shownCount, totalCount)}</span>%</span>
    </div>
  `;
}

function normalizeLibraryTab(value) {
  return LIBRARY_TAB_ORDER.includes(value) ? value : 'reading';
}

function readingStatusLabel(status) {
  return LIBRARY_TAB_LABELS[normalizeLibraryTab(status)] ?? LIBRARY_TAB_LABELS.reading;
}

function returnLinkLabel(returnTo) {
  if (!returnTo) {
    return '一覧へ戻る';
  }

  const { path } = parseHashRoute(returnTo);
  if (path === '#/') {
    return 'ホームTLへ戻る';
  }
  if (path.startsWith('#/collection/')) {
    if (path === '#/collection/likes') {
      return 'ふせん一覧へ戻る';
    }
    if (path === '#/collection/bookmarks') {
      return 'しおり一覧へ戻る';
    }
    return '保存一覧へ戻る';
  }
  if (path.startsWith('#/work/')) {
    return '作品TLへ戻る';
  }

  return '一覧へ戻る';
}

function outlineLevelClassName(level) {
  if (level === 1) {
    return 'is-level-1';
  }
  if (level === 2) {
    return 'is-level-2';
  }
  return 'is-level-3';
}

export function createScreenRenderers({
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
  saveReaderFontScale,
  saveLike,
  saveWorkReadingState,
  toggleBookmark,
  workPageBatchSize,
  searchResultsBatchSize
}) {
  const {
    escapeHtml,
    normalizeFragmentDisplayHtml,
    renderLayout,
    renderReaderScaleControls,
    renderWorkLayout
  } = appShell;

  function findWorkById(workId) {
    return state.works.find((item) => item.id === workId) ?? null;
  }

  function getWorkReadingStatus(workId) {
    return deriveWorkReadingStatus({
      workId,
      readingStateRecords: state.readingStateRecords,
      bookmarkRecords: state.bookmarkRecords
    });
  }

  function buildHomeCardTitle(workTitle, fragment) {
    const work = findWorkById(fragment?.workId);
    const sourceTitleLines = Array.isArray(work?.sourceTitleLines)
      ? work.sourceTitleLines.map((line) => String(line ?? '').trim()).filter(Boolean).slice(0, 2)
      : [];

    if (sourceTitleLines.length > 0) {
      return sourceTitleLines.join('　');
    }

    return String(workTitle ?? '無題');
  }

  function renderTimelineCard(fragment, workTitle, options = {}) {
    const detailHref = options.detailHref ?? `#/fragment/${encodeURIComponent(fragment.id)}`;
    const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
    return timelineCardMarkup({
      fragmentId: escapeHtml(fragment.id),
      detailHref,
      workTitle: escapeHtml(options.titleText ?? workTitle ?? '無題'),
      metaLabel: options.metaLabel ? escapeHtml(options.metaLabel) : '',
      statusLabel: options.statusLabel ? escapeHtml(options.statusLabel) : '',
      cardClassName: options.cardClassName ? escapeHtml(options.cardClassName) : '',
      displayHtml: safeDisplayHtml,
      ariaLabel: escapeHtml((workTitle ?? '無題') + ' の断片を開く')
    });
  }

  function getWorkOverlayState(fragmentId) {
    if (state.bookmarks.has(fragmentId)) {
      return 'bookmark';
    }
    if (state.likes.has(fragmentId)) {
      return 'like';
    }
    return 'idle';
  }

  function overlayButtonAriaLabel(fragmentIndex, overlayState) {
    if (overlayState === 'bookmark') {
      return `断片 ${fragmentIndex} は現在のしおりです。もう一度押すとしおりを外してふせんにします`;
    }
    if (overlayState === 'like') {
      return `断片 ${fragmentIndex} はふせん済みです。もう一度押すと何もない状態に戻します`;
    }
    return `断片 ${fragmentIndex} を現在のしおりにする`;
  }

  function renderWorkFragmentCard(fragment, returnToHash) {
    const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
    const overlayState = getWorkOverlayState(fragment.id);
    const overlayRisk = estimateFragmentOverlayRisk(safeDisplayHtml);

    return `
      <article class="fragment-card" data-fragment-id="${escapeHtml(fragment.id)}" data-work-fragment-index="${fragment.index}">
        <a class="fragment-card-link" href="${buildFragmentHash(fragment.id, { returnTo: returnToHash })}">
          <span class="fragment-card-link-inner">
            <div class="fragment-body">
              ${safeDisplayHtml}
            </div>
          </span>
        </a>
        <div class="fragment-overlay-meta">
          <button
            type="button"
            class="fragment-overlay-bookmark is-${overlayState} ${overlayRisk ? 'is-overlay-risk' : ''}"
            data-work-action="cycle-marker"
            data-fragment-id="${escapeHtml(fragment.id)}"
            data-fragment-index="${fragment.index}"
            aria-label="${escapeHtml(overlayButtonAriaLabel(fragment.index, overlayState))}"
            aria-pressed="${overlayState === 'idle' ? 'false' : 'true'}"
          >断片 ${fragment.index}</button>
        </div>
      </article>
    `;
  }

  function renderSavedItemCard(kind, item, options = {}) {
    const label = savedCollectionLabel(kind);
    const collectionHash = options.collectionHash || buildCollectionHash(kind);
    const fragmentLink = item.fragment
      ? buildFragmentHash(item.fragment.id, { returnTo: collectionHash })
      : '';
    const timelineLink = item.fragment
      ? buildWorkHash(item.fragment.workId, {
          visible: Math.max(workPageBatchSize, item.fragment.index ?? workPageBatchSize),
          focus: item.fragment.id
        })
      : '';
    const savedDate = item.record.savedAt ? new Date(item.record.savedAt).toLocaleString('ja-JP') : '';

    return savedItemCardMarkup({
      workTitle: escapeHtml(item.work?.title ?? '作品不明'),
      workAuthor: escapeHtml(item.work?.author ?? ''),
      savedDateHtml: savedDate ? `<p class="settings-status settings-status-subtle">${escapeHtml(label)}: ${escapeHtml(savedDate)}</p>` : '',
      excerpt: escapeHtml(item.excerpt || '本文を参照できません。'),
      noteHtml: kind === 'likes' && item.note
        ? `<p class="settings-status">メモ: ${escapeHtml(item.note)}</p>`
        : '',
      fragmentIndexHtml: item.fragmentIndex ? `<p class="fragment-index-label">断片 ${item.fragmentIndex}</p>` : '',
      openFragmentHtml: item.fragment ? `<a class="detail-action-button detail-action-link" href="${fragmentLink}">断片を開く</a>` : '<span class="detail-action-button is-disabled" aria-disabled="true">断片が見つかりません</span>',
      openTimelineHtml: item.fragment ? `<a class="detail-action-button detail-action-link" href="${timelineLink}">作品TLで開く</a>` : '',
      noteButtonHtml: kind === 'likes'
        ? `<button type="button" class="detail-action-button" data-collection-action="edit-note" data-collection-kind="${escapeHtml(kind)}" data-record-id="${escapeHtml(item.record.id)}">${item.note ? 'メモ編集' : 'メモ'}</button>`
        : '',
      removeButtonHtml: `<button type="button" class="detail-action-button" data-collection-action="remove" data-collection-kind="${escapeHtml(kind)}" data-record-id="${escapeHtml(item.record.id)}">${escapeHtml(label)}を外す</button>`
    });
  }

  async function cycleWorkOverlayState(fragmentId) {
    const fragment = state.fragments.find((item) => item.id === fragmentId) ?? null;
    if (!fragment || fragment.type === 'break') {
      return;
    }

    const overlayState = getWorkOverlayState(fragmentId);
    if (overlayState === 'bookmark') {
      await removeBookmark(fragment.workId);
      if (!state.likes.has(fragmentId)) {
        await saveLike(fragmentId);
      }
    } else if (overlayState === 'like') {
      await removeLike(fragmentId);
    } else {
      await toggleBookmark(fragmentId, { rerender: false });
    }

    await loadStateFromDb();
  }

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

  function renderHome(options = {}) {
    const timelineEvents = buildHomeTimelineEvents({
      works: state.works,
      fragments: state.fragments,
      bookmarkRecords: state.bookmarkRecords,
      likeRecords: state.likeRecords,
      findWorkById
    });
    const timelineCardsHtml = timelineEvents.map((event) => {
      const eventTargetsWorkPosition = event.id.startsWith('bookmark:') || event.id.startsWith('like:');
      const detailHref = eventTargetsWorkPosition
        ? buildWorkHash(event.fragment.workId, {
            visible: Math.max(workPageBatchSize, Number(event.fragment.index) || workPageBatchSize),
            focus: event.fragment.id
          })
        : buildWorkHash(event.fragment.workId, {
            visible: workPageBatchSize
          });
      const readingStatus = getWorkReadingStatus(event.fragment.workId);

      return renderTimelineCard(event.fragment, event.workTitle, {
        titleText: buildHomeCardTitle(event.workTitle, event.fragment),
        metaLabel: event.metaLabel,
        statusLabel: readingStatus === 'completed' ? '読了' : '',
        cardClassName: readingStatus === 'completed' ? 'is-completed-home' : '',
        detailHref
      });
    }).join('');

    renderLayout({
      current: 'home',
      title: 'ホームTL',
      subtitle: options.focusFragmentId ? '指定した断片へジャンプしました。' : '読みかけの作品や気に入った断片がここに流れます。',
      body: homeBodyMarkup(timelineCardsHtml)
    });

    if (options.focusFragmentId) {
      requestAnimationFrame(() => {
        focusFragmentCard(app, options.focusFragmentId);
      });
    }
  }

  function renderFragment(fragmentId, options = {}) {
    const readableFragments = getReadableFragments(state.fragments);
    const currentIndex = readableFragments.findIndex((item) => item.id === fragmentId);
    const fragment = currentIndex >= 0 ? readableFragments[currentIndex] : readableFragments[0];
    if (!fragment) {
      renderLoading('断片データを読み込んでいます。');
      return;
    }

    const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
    const work = findWorkById(fragment.workId);
    const previousFragment = readableFragments[resolvedIndex - 1] ?? null;
    const nextFragment = readableFragments[resolvedIndex + 1] ?? null;
    const liked = state.likes.has(fragment.id);
    const bookmarked = state.bookmarks.has(fragment.id);
    const likeRecord = state.likeRecords.find((item) => item.fragmentId === fragment.id) ?? null;
    const noteText = typeof likeRecord?.note === 'string' ? likeRecord.note.trim() : '';
      const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
      const workHash = buildWorkHash(fragment.workId, {
        visible: Math.max(workPageBatchSize, fragment.index ?? workPageBatchSize),
        focus: fragment.id
      });
      const backToHash = options.returnTo || workHash;
      const showBackLink = Boolean(options.returnTo && options.returnTo !== workHash);
      const noteButtonLabel = noteText ? `メモ: ${escapeHtml(noteText)}` : 'メモを追加';
      const inlineReturnLinkHtml = `<a class="detail-inline-tool detail-inline-tool-link" href="${workHash}">TLのこの位置へ戻る</a>`;

      renderLayout({
        current: 'detail',
        title: work?.title ?? '断片個別ページ',
        subtitle: '断片の前後移動と保存操作はここで行います。',
        body: fragmentDetailBodyMarkup({
          author: escapeHtml(work?.author ?? ''),
          displayHtml: safeDisplayHtml,
          inlineToolsHtml: `
            <div class="detail-inline-tools" aria-label="本文まわりの操作">
              <button type="button" class="detail-inline-tool detail-inline-tool-note ${noteText ? 'has-note' : ''}" data-action="memo" data-fragment-id="${escapeHtml(fragment.id)}">${noteButtonLabel}</button>
              ${inlineReturnLinkHtml}
            </div>
          `,
          previousLinkHtml: previousFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(previousFragment.id, { returnTo: options.returnTo })}">前へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">前へ</span>`,
          nextLinkHtml: nextFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(nextFragment.id, { returnTo: options.returnTo })}">次へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">次へ</span>`,
          likeButtonHtml: `<button type="button" class="detail-action-button ${liked ? 'is-active' : ''}" data-action="like" data-fragment-id="${escapeHtml(fragment.id)}">${liked ? 'ふせん済み' : 'ふせん'}</button>`,
          bookmarkButtonHtml: `<button type="button" class="detail-action-button ${bookmarked ? 'is-active' : ''}" data-action="bookmark" data-fragment-id="${escapeHtml(fragment.id)}">${bookmarked ? '現在のしおり' : 'しおり'}</button>`,
          backLinkHtml: showBackLink ? `<a class="detail-action-button" href="${backToHash}">${returnLinkLabel(options.returnTo)}</a>` : ''
        })
      });

      bindDetailActions(app, async (action, targetFragmentId) => {
        await handleDetailAction(action, targetFragmentId);
      });

      ensureWorkMarkedReading(fragment.workId);
    }

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

      if (activeTab !== 'unread') {
        return `
          <article class="info-panel info-panel-library-work">
            <a class="panel-link panel-link-library-work" href="#/work/${encodeURIComponent(work.id)}">
              ${workSummaryHtml}
            </a>
          </article>
        `;
      }

      return `
        <article class="info-panel info-panel-library-work info-panel-library-work-unread" data-library-menu>
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

    if (activeTab === 'unread') {
      state.libraryWorkActionsCleanup = bindLibraryWorkActions(app, async (workId) => {
        const work = findWorkById(workId);
        if (!work) {
          return;
        }

        const confirmed = window.confirm(`「${work.title}」を未読一覧から削除します。よろしいですか。`);
        if (!confirmed) {
          return;
        }

        await deleteWorkCascade(workId);
        await loadStateFromDb();
        renderLibrary({ tab: 'unread' });
      });
    }
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

  function renderWorkPage(workId, options = {}) {
    const work = findWorkById(workId);
    if (!work) {
      renderError(new Error('作品が見つかりませんでした。'));
      return;
    }

    const totalTextFragments = countWorkTextFragments(state.fragments, workId);
    const readableWorkFragments = getReadableWorkFragments(state.fragments, workId);
    const visibleTextCount = Math.min(
      getVisibleCountParam(options.visible, workPageBatchSize),
      totalTextFragments || workPageBatchSize
    );
    const { fragments, shownTextCount } = sliceWorkFragmentsForVisibleCount(state.fragments, workId, visibleTextCount);
    const remainingTextCount = Math.max(0, totalTextFragments - shownTextCount);
    const returnToHash = buildWorkHash(workId, { visible: shownTextCount });
    const bookmark = getBookmarkForWork(state.bookmarkRecords, workId);
    const likeRecords = getLikeRecordsForWork(state.likeRecords, state.fragments, workId);
    const bookmarkJumpHash = bookmark
      ? buildWorkHash(workId, {
          visible: Math.max(workPageBatchSize, Number(bookmark.fragmentIndex) || workPageBatchSize),
          focus: bookmark.fragmentId
        })
      : '';
    const bookmarkHtml = bookmark
      ? `<p class="settings-status settings-status-subtle"><a class="text-link" href="${bookmarkJumpHash}">しおりの断片 ${bookmark.fragmentIndex} を開く</a></p>`
      : '';
    const markerHtml = likeRecords.length > 0
      ? `<p class="settings-status settings-status-subtle"><a class="text-link" href="${buildCollectionHash('likes', { workId })}">ふせん ${likeRecords.length}枚を開く</a></p>`
      : '';
      const outlineEntries = Array.isArray(work.outline)
        ? work.outline
        .map((entry) => {
          const title = String(entry?.title ?? '').trim();
          const href = buildWorkOutlineHash(workId, entry, workPageBatchSize);
          const level = Number(entry?.level);
          if (!title || !href) {
            return null;
          }

          return {
            href,
            title,
            level: Number.isFinite(level) ? Math.max(1, Math.min(3, level)) : 3
          };
          })
          .filter(Boolean)
        : [];
      const workEndHash = buildWorkEndHash(workId, totalTextFragments, workPageBatchSize, WORK_END_MARKER_ID);
      const outlineHtml = outlineEntries.length > 0
        ? `
        <section class="work-outline" aria-label="目次">
          <details class="work-outline-disclosure">
            <summary class="settings-status settings-status-subtle work-outline-summary">目次 ${outlineEntries.length}件</summary>
            <ol class="work-outline-list">
              ${outlineEntries.map((entry) => `
                <li class="work-outline-item">
                  <a class="work-outline-link ${outlineLevelClassName(entry.level)}" href="${entry.href}">${escapeHtml(entry.title)}</a>
                </li>
              `).join('')}
              ${workEndHash ? `
                <li class="work-outline-item">
                  <a class="work-outline-link work-outline-link-terminal" href="${workEndHash}">終端</a>
                </li>
              ` : ''}
            </ol>
          </details>
        </section>
      `
        : '';
    const fragmentsHtml = fragments.map((fragment) => fragment.type === 'break'
      ? breakCardMarkup()
      : renderWorkFragmentCard(fragment, returnToHash)).join('');
      const endingCardHtml = shownTextCount >= totalTextFragments && totalTextFragments > 0
        ? workEndingCardMarkup({ isCompleted: getWorkReadingStatus(workId) === 'completed', markerId: WORK_END_MARKER_ID })
        : '';
    const moreLinkHtml = remainingTextCount > 0
      ? (state.workLoadMode === 'manual'
        ? `
          <div class="settings-button-grid">
            <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, { visible: shownTextCount + workPageBatchSize })}">もっと読む（残り ${remainingTextCount}断片）</a>
          </div>
        `
        : `
          <div class="work-auto-load-panel" data-work-auto-load-sentinel>
            <p class="settings-status settings-status-subtle">続きを自動で読み込みます。残り ${remainingTextCount}断片</p>
          </div>
        `)
      : '';

    renderWorkLayout({
      title: work.title ?? '作品ページ',
      subtitle: work.author ?? '著者不明',
      headerMetaHtml: renderWorkHeaderMeta(shownTextCount, totalTextFragments),
      body: workBodyMarkup({
        workTitle: escapeHtml(work.title ?? '無題'),
        workAuthor: escapeHtml(work.author ?? ''),
        totalTextFragments,
        shownTextCount,
        bookmarkHtml,
        markerHtml,
        outlineHtml,
        readerScaleControlsHtml: renderReaderScaleControls(),
        fragmentsHtml,
        moreLinkHtml,
        endingCardHtml
      })
    });

    if (options.focus) {
      requestAnimationFrame(() => {
        focusFragmentCard(app, options.focus);
      });
    }

    bindReaderScaleControls(app, (value) => {
      saveReaderFontScale(value);
      route();
    });
    bindWorkHeaderActions(app, async (action) => {
      if (action !== 'jump-to-fragment' || totalTextFragments <= 0) {
        return;
      }

      const answer = window.prompt(`断片番号を入力してください。1 から ${totalTextFragments} まで指定できます。`, String(shownTextCount));
      if (answer === null) {
        return;
      }

      const targetIndex = Number.parseInt(answer, 10);
      if (!Number.isFinite(targetIndex) || targetIndex < 1 || targetIndex > totalTextFragments) {
        window.alert(`1 から ${totalTextFragments} の整数を入力してください。`);
        return;
      }

      const targetFragment = readableWorkFragments[targetIndex - 1];
      if (!targetFragment) {
        window.alert('指定した断片が見つかりませんでした。');
        return;
      }

      location.hash = buildWorkHash(workId, {
        visible: Math.max(workPageBatchSize, targetIndex),
        focus: targetFragment.id
      });
    });
    state.workHeaderProgressCleanup = bindWorkHeaderProgress(app, totalTextFragments, calculateRemainingPercent);
    state.workAutoLoadCleanup = bindWorkAutoLoad(app, {
      enabled: state.workLoadMode === 'auto',
      shownTextCount,
      totalTextFragments,
      onIntersect: () => {
        location.replace(buildWorkHash(workId, {
          visible: shownTextCount + workPageBatchSize
        }));
      }
    });
    bindWorkStateActions(app, async (action) => {
      if (action !== 'mark-complete') {
        return;
      }

      await saveWorkReadingState(workId, getWorkReadingStatus(workId) === 'completed' ? 'reading' : 'completed');
      route();
    });
    bindWorkOverlayActions(app, async (fragmentId) => {
      await cycleWorkOverlayState(fragmentId);
      app.querySelectorAll('[data-work-action="cycle-marker"]').forEach((item) => {
        const overlayState = getWorkOverlayState(item.dataset.fragmentId);
        const fragmentIndex = Number(item.dataset.fragmentIndex || 0);
        updateWorkOverlayButton(item, overlayState, overlayButtonAriaLabel(fragmentIndex, overlayState));
      });
    });

    ensureWorkMarkedReading(workId);
  }

  function renderSearch() {
    const preview = state.importPreview;
    const totalResultCount = state.aozoraCatalogResults.length;
    const shownResultCount = Math.min(state.aozoraCatalogVisibleCount, totalResultCount);
    const visibleResults = state.aozoraCatalogResults.slice(0, shownResultCount);
    const previewMarkup = searchPreviewMarkup(preview ? {
      ...preview,
      title: escapeHtml(preview.title),
      author: escapeHtml(preview.author),
      encoding: escapeHtml(preview.encoding)
    } : null, `
      <article class="fragment-card fragment-card-break preview-card">
        <p class="break-label">原文空行</p>
      </article>
    `);
    const fetchedAt = state.aozoraCatalogMeta?.fetchedAt
      ? new Date(state.aozoraCatalogMeta.fetchedAt).toLocaleString('ja-JP')
      : '';
    const catalogMetaHtml = fetchedAt
      ? `<p class="settings-status settings-status-subtle">最終更新: ${escapeHtml(fetchedAt)} / ${escapeHtml(String(state.aozoraCatalogMeta?.recordCount ?? 0))}件</p>`
      : `<p class="settings-status settings-status-subtle">${state.aozoraCatalogLoading ? '作品一覧を読み込んでいます。' : '作品一覧を準備しています。'}</p>`;
    const emptyMessage = state.aozoraCatalogQuery
      ? '一致する作品が見つかりませんでした。'
      : (state.aozoraCatalogRecords.length > 0
        ? '作品名または著者名で検索してください。'
        : (state.aozoraCatalogLoading ? '作品一覧を読み込んでいます。' : '作品一覧を準備しています。'));
    const catalogResultsMarkup = aozoraSearchResultsMarkup(
      visibleResults.map((result) => ({
        ...result,
        title: escapeHtml(result.title),
        author: escapeHtml(result.author),
        kanaType: escapeHtml(result.kanaType),
        workId: escapeHtml(result.workId),
        cardUrl: escapeHtml(result.cardUrl)
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
      importStatusHtml: state.importWorkStatus ? `<p class="settings-status">${escapeHtml(state.importWorkStatus)}</p>` : ''
    });
    const importNoticeHtml = state.importWorkNoticeTone === 'success' && state.importWorkStatus
      ? `
        <article class="info-panel search-import-notice search-import-notice-success" data-search-import-notice aria-live="polite">
          <h2 class="section-title">取り込み完了</h2>
          <p class="section-text">${escapeHtml(state.importWorkStatus)}</p>
        </article>
      `
      : '';

    renderLayout({
      current: 'search',
      title: '作品を追加',
      subtitle: '青空文庫で作品を探し、保存したZIPをここへ追加できます。',
      body: searchBodyMarkup({
        importNoticeHtml,
        catalogQuery: escapeHtml(state.aozoraCatalogQuery),
        catalogStatusHtml: state.aozoraCatalogStatus ? `<p class="settings-status">${escapeHtml(state.aozoraCatalogStatus)}</p>` : '',
        catalogMetaHtml,
        catalogResultsMarkup,
        importSheetMarkup,
        previewMarkup
      })
    });

    bindSearchInteractions(app, {
      onSelectFile: handleAozoraZipFile,
      onDropFile: handleAozoraZipFile,
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
    renderCollectionPage,
    renderError,
    renderFragment,
    renderHome,
    renderLibrary,
    renderLoading,
    renderSearch,
    renderSettings,
    renderWorkPage
  };
}
