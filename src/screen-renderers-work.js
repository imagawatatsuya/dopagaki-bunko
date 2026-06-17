import {
  countWorkTextFragments,
  getBookmarkForWork,
  getLikeRecordsForWork,
  getReadableWorkFragments,
  getVisibleCountParam,
  sliceWorkFragmentsForVisibleCount
} from './state.js?v=20260617191706';
import {
  buildCollectionHash,
  buildWorkEndHash,
  buildWorkHash,
  buildWorkOutlineHash
} from './router.js?v=20260617191706';
import {
  bindReaderScaleControls,
  bindWorkAutoLoad,
  bindWorkHeaderActions,
  bindWorkHeaderProgress,
  bindWorkOverlayActions,
  bindWorkStateActions,
  focusFragmentCard,
  updateWorkOverlayButton
} from './ui-bindings.js?v=20260617191706';
import {
  breakCardMarkup,
  workBodyMarkup,
  workEndingCardMarkup
} from './views.js?v=20260617191706';
import {
  WORK_END_MARKER_ID,
  calculateRemainingPercent,
  outlineLevelClassName,
  renderWorkHeaderMeta
} from './renderer-shared.js?v=20260617191706';

export function createWorkRenderers({
  app,
  state,
  route,
  renderError,
  renderWorkLayout,
  renderReaderScaleControls,
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
}) {
  const {
    escapeHtml,
    findWorkById,
    getWorkOverlayState,
    getWorkReadingStatus,
    overlayButtonAriaLabel,
    renderWorkFragmentCard
  } = helpers;

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

  return { renderWorkPage };
}
