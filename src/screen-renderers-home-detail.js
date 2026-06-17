import {
  buildHomeTimelineEvents,
  getReadableFragments
} from './state.js?v=20260617180204';
import {
  buildFragmentHash,
  buildWorkHash
} from './router.js?v=20260617180204';
import {
  bindDetailActions,
  focusFragmentCard
} from './ui-bindings.js?v=20260617180204';
import {
  fragmentDetailBodyMarkup,
  homeBodyMarkup
} from './views.js?v=20260617180204';
import { returnLinkLabel } from './renderer-shared.js?v=20260617180204';

export function createHomeDetailRenderers({
  app,
  state,
  renderLayout,
  renderLoading,
  handleDetailAction,
  ensureWorkMarkedReading,
  workPageBatchSize,
  helpers
}) {
  const {
    buildHomeCardTitle,
    escapeHtml,
    findWorkById,
    getWorkReadingStatus,
    normalizeFragmentDisplayHtml,
    renderTimelineCard
  } = helpers;

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

  return {
    renderFragment,
    renderHome
  };
}
