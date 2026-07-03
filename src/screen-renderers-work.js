import {
  countWorkTextFragments,
  getBookmarkForWork,
  getLikeRecordsForWork,
  getReadableWorkFragments,
  getVisibleCountParam,
  sliceWorkFragmentsForVisibleCount
} from './state.js?v=20260703180600';
import {
  buildCollectionHash,
  buildWorkEndHash,
  buildWorkFocusHash,
  buildWorkHash,
  buildWorkOutlineHash
} from './router.js?v=20260703180600';
import {
  bindReaderScaleControls,
  bindWorkAutoLoad,
  bindWorkHeaderActions,
  bindWorkHeaderProgress,
  bindWorkOverlayActions,
  bindWorkStateActions,
  focusFragmentCard,
  updateWorkOverlayButton
} from './ui-bindings.js?v=20260703180600';
import {
  breakCardMarkup,
  readerActionStatusMarkup,
  workBodyMarkup,
  workEndingCardMarkup
} from './views.js?v=20260703180600';
import {
  WORK_END_MARKER_ID,
  calculateRemainingPercent,
  outlineLevelClassName,
  renderWorkHeaderMeta
} from './renderer-shared.js?v=20260703180600';

export function createWorkRenderers({
  app,
  state,
  route,
  renderError,
  renderWorkLayout,
  renderReaderScaleControls,
  ensureWorkMarkedReadingAtIndex,
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

  function clearReaderActionStatus() {
    state.readerActionStatus = '';
    state.readerActionStatusTone = '';
  }

  function setReaderActionError(actionLabel, error) {
    state.readerActionStatusTone = 'error';
    state.readerActionStatus = `${actionLabel}に失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  async function cycleWorkOverlayState(fragmentId) {
    const fragment = state.fragments.find((item) => item.id === fragmentId) ?? null;
    if (!fragment || fragment.type === 'break') {
      return;
    }

    try {
      const overlayState = getWorkOverlayState(fragmentId);
      const previousBookmarkId = getBookmarkForWork(state.bookmarkRecords, fragment.workId)?.fragmentId ?? '';
      if (overlayState === 'bookmark') {
        await removeBookmark(fragment.workId);
        state.bookmarkRecords = state.bookmarkRecords.filter((item) => item.workId !== fragment.workId);
        state.bookmarks.delete(fragmentId);
        if (!state.likes.has(fragmentId)) {
          await saveLike(fragmentId);
          const record = {
            id: fragmentId,
            fragmentId,
            savedAt: new Date().toISOString(),
            note: ''
          };
          state.likeRecords = [record, ...state.likeRecords.filter((item) => item.fragmentId !== fragmentId)];
          state.likes.add(fragmentId);
        }
      } else if (overlayState === 'like') {
        await removeLike(fragmentId);
        state.likeRecords = state.likeRecords.filter((item) => item.fragmentId !== fragmentId);
        state.likes.delete(fragmentId);
      } else {
        await toggleBookmark(fragmentId, { rerender: false });
      }

      clearReaderActionStatus();
      return [...new Set([fragmentId, previousBookmarkId].filter(Boolean))];
    } catch (error) {
      console.error(error);
      setReaderActionError('しおり/ふせん更新', error);
      route();
      return [];
    }
  }

  function renderWorkPage(workId, options = {}) {
    const work = findWorkById(workId);
    if (!work) {
      renderError(new Error('作品が見つかりませんでした。'));
      return;
    }

    const totalTextFragments = countWorkTextFragments(state.fragments, workId);
    const readableWorkFragments = getReadableWorkFragments(state.fragments, workId);
    let visibleTextCount = Math.min(
      getVisibleCountParam(options.visible, workPageBatchSize),
      totalTextFragments || workPageBatchSize
    );
    const fromTextIndex = Math.min(
      getVisibleCountParam(options.from, 1),
      Math.max(1, visibleTextCount)
    );
    const { fragments, shownTextCount: initialShownTextCount, firstShownTextIndex } = sliceWorkFragmentsForVisibleCount(
      state.fragments,
      workId,
      visibleTextCount,
      fromTextIndex
    );
    let shownTextCount = initialShownTextCount;
    const remainingTextCount = Math.max(0, totalTextFragments - shownTextCount);
    const returnToHash = buildWorkHash(workId, { from: fromTextIndex, visible: shownTextCount });
    const bookmark = getBookmarkForWork(state.bookmarkRecords, workId);
    const likeRecords = getLikeRecordsForWork(state.likeRecords, state.fragments, workId);
    const bookmarkJumpHash = bookmark
      ? buildWorkFocusHash(workId, bookmark, workPageBatchSize)
      : '';
    const bookmarkHtml = bookmark
      ? `<p class="settings-status settings-status-subtle"><a class="text-link" data-work-bookmark-jump="${escapeHtml(bookmark.fragmentId)}" href="${bookmarkJumpHash}">しおりの断片 ${bookmark.fragmentIndex} を開く</a></p>`
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
      ? (fragment.breakKind === 'heading' ? '' : breakCardMarkup())
      : renderWorkFragmentCard(fragment, returnToHash)).join('');
    const earlierLinkHtml = firstShownTextIndex > 1
      ? `
        <div class="settings-button-grid">
          <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, {
            from: Math.max(1, firstShownTextIndex - workPageBatchSize),
            visible: shownTextCount
          })}">前の断片を読む</a>
        </div>
      `
      : '';
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
        firstShownTextIndex,
        actionStatusHtml: readerActionStatusMarkup(state.readerActionStatus, state.readerActionStatusTone),
        bookmarkHtml,
        markerHtml,
        outlineHtml,
        readerScaleControlsHtml: renderReaderScaleControls(),
        fragmentsHtml,
        moreLinkHtml: `${earlierLinkHtml}${moreLinkHtml}`,
        endingCardHtml
      })
    });

    if (options.focus) {
      requestAnimationFrame(() => {
        focusFragmentCard(app, options.focus);
      });
    }
    const bookmarkJumpLink = app.querySelector('[data-work-bookmark-jump]');
    bookmarkJumpLink?.addEventListener('click', (event) => {
      if (bookmarkJumpLink.getAttribute('href') !== location.hash) {
        return;
      }

      event.preventDefault();
      route();
    });

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

      location.hash = buildWorkFocusHash(workId, targetFragment, workPageBatchSize);
    });
    state.workHeaderProgressCleanup = bindWorkHeaderProgress(
      app,
      totalTextFragments,
      calculateRemainingPercent,
      (activeIndex) => {
        ensureWorkMarkedReadingAtIndex(workId, activeIndex);
      }
    );
    const handleWorkStateAction = async (action) => {
      if (action !== 'mark-complete') {
        return;
      }

      try {
        await saveWorkReadingState(workId, getWorkReadingStatus(workId) === 'completed' ? 'reading' : 'completed');
        clearReaderActionStatus();
        route();
      } catch (error) {
        console.error(error);
        setReaderActionError('読了切替', error);
        route();
      }
    };
    const handleOverlayCycle = async (fragmentId) => {
      const changedFragmentIds = await cycleWorkOverlayState(fragmentId);
      changedFragmentIds.forEach((changedFragmentId) => {
        const item = app.querySelector(`[data-work-action="cycle-marker"][data-fragment-id="${CSS.escape(changedFragmentId)}"]`);
        if (!item) {
          return;
        }
        const overlayState = getWorkOverlayState(item.dataset.fragmentId);
        const fragmentIndex = Number(item.dataset.fragmentIndex || 0);
        updateWorkOverlayButton(item, overlayState, overlayButtonAriaLabel(fragmentIndex, overlayState));
      });
    };
    const bindAutoLoadForCurrentRange = () => {
      state.workAutoLoadCleanup = bindWorkAutoLoad(app, {
        enabled: state.workLoadMode === 'auto',
        shownTextCount,
        totalTextFragments,
        onIntersect: () => {
          const nextVisibleTextCount = Math.min(totalTextFragments, shownTextCount + workPageBatchSize);
          const nextBatch = sliceWorkFragmentsForVisibleCount(
            state.fragments,
            workId,
            nextVisibleTextCount,
            shownTextCount + 1
          );
          const timeline = app.querySelector('.timeline[aria-label="作品断片一覧"]');
          if (!timeline || nextBatch.fragments.length === 0) {
            return;
          }

          const nextReturnToHash = buildWorkHash(workId, {
            from: fromTextIndex,
            visible: nextVisibleTextCount
          });
          const batchHtml = nextBatch.fragments.map((fragment) => fragment.type === 'break'
            ? (fragment.breakKind === 'heading' ? '' : breakCardMarkup())
            : renderWorkFragmentCard(fragment, nextReturnToHash)).join('');
          const batchContainer = document.createElement('div');
          batchContainer.innerHTML = batchHtml;
          bindWorkOverlayActions(batchContainer, handleOverlayCycle);
          while (batchContainer.firstChild) {
            timeline.append(batchContainer.firstChild);
          }

          shownTextCount = nextVisibleTextCount;
          visibleTextCount = nextVisibleTextCount;
          const shownCountNode = app.querySelector('[data-work-shown-count]');
          if (shownCountNode) {
            shownCountNode.textContent = `${firstShownTextIndex > 1 ? `${firstShownTextIndex}–` : ''}${shownTextCount}`;
          }
          const autoLoadPanel = app.querySelector('[data-work-auto-load-sentinel]');
          const remaining = Math.max(0, totalTextFragments - shownTextCount);
          if (autoLoadPanel) {
            if (remaining > 0) {
              autoLoadPanel.querySelector('p').textContent = `続きを自動で読み込みます。残り ${remaining}断片`;
            } else {
              autoLoadPanel.remove();
            }
          }
          if (shownTextCount >= totalTextFragments) {
            const endingContainer = document.createElement('div');
            endingContainer.innerHTML = workEndingCardMarkup({
              isCompleted: getWorkReadingStatus(workId) === 'completed',
              markerId: WORK_END_MARKER_ID
            });
            bindWorkStateActions(endingContainer, handleWorkStateAction);
            while (endingContainer.firstChild) {
              timeline.append(endingContainer.firstChild);
            }
            return;
          }
          bindAutoLoadForCurrentRange();
        }
      });
    };
    bindAutoLoadForCurrentRange();
    bindWorkStateActions(app, handleWorkStateAction);
    bindWorkOverlayActions(app, handleOverlayCycle);
  }

  return { renderWorkPage };
}
