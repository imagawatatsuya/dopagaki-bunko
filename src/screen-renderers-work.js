import {
  calculateAdjacentWorkRange,
  countWorkTextFragments,
  getBookmarkForWork,
  getLikeRecordsForWork,
  getReadableWorkFragments,
  getVisibleCountParam,
  sliceWorkFragmentsForVisibleCount
} from './state.js?v=20260701141942';
import {
  buildCollectionHash,
  buildWorkEndHash,
  buildWorkFocusHash,
  buildWorkHash,
  buildWorkOutlineHash
} from './router.js?v=20260701141942';
import {
  bindReaderScaleControls,
  bindWorkAutoLoad,
  bindWorkHeaderActions,
  bindWorkHeaderProgress,
  bindWorkOverlayActions,
  bindWorkStateActions,
  focusFragmentCard,
  updateWorkOverlayButton
} from './ui-bindings.js?v=20260701141942';
import {
  breakCardMarkup,
  readerActionStatusMarkup,
  workBodyMarkup,
  workEndingCardMarkup
} from './views.js?v=20260701141942';
import {
  WORK_END_MARKER_ID,
  calculateRemainingPercent,
  outlineLevelClassName,
  renderWorkHeaderMeta
} from './renderer-shared.js?v=20260701141942';

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
  workPageMaxRendered,
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
    visibleTextCount = Math.min(
      visibleTextCount,
      fromTextIndex + workPageMaxRendered - 1
    );
    const initialRange = sliceWorkFragmentsForVisibleCount(
      state.fragments,
      workId,
      visibleTextCount,
      fromTextIndex
    );
    const fragments = initialRange.fragments;
    let firstShownTextIndex = initialRange.firstShownTextIndex;
    let shownTextCount = initialRange.shownTextCount;
    const remainingTextCount = Math.max(0, totalTextFragments - shownTextCount);
    const returnToHash = buildWorkHash(workId, { from: fromTextIndex, visible: shownTextCount });
    const bookmark = getBookmarkForWork(state.bookmarkRecords, workId);
    const likeRecords = getLikeRecordsForWork(state.likeRecords, state.fragments, workId);
    const bookmarkJumpHash = bookmark
      ? buildWorkFocusHash(workId, bookmark, workPageBatchSize)
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
      ? (fragment.breakKind === 'heading' ? '' : breakCardMarkup())
      : renderWorkFragmentCard(fragment, returnToHash)).join('');
    const earlierLinkHtml = firstShownTextIndex > 1 && state.workLoadMode === 'manual'
      ? `
        <div class="settings-button-grid">
          <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, {
            from: Math.max(1, firstShownTextIndex - workPageBatchSize),
            visible: Math.min(
              shownTextCount,
              Math.max(1, firstShownTextIndex - workPageBatchSize) + workPageMaxRendered - 1
            )
          })}">前の${Math.min(workPageBatchSize, firstShownTextIndex - 1)}断片を読む</a>
        </div>
      `
      : '';
    const topLoadHtml = firstShownTextIndex > 1 && state.workLoadMode === 'auto'
      ? '<div class="work-auto-load-sentinel work-auto-load-sentinel-top" data-work-auto-load-up-sentinel aria-hidden="true"></div>'
      : '';
    const endingCardHtml = shownTextCount >= totalTextFragments && totalTextFragments > 0
      ? workEndingCardMarkup({ isCompleted: getWorkReadingStatus(workId) === 'completed', markerId: WORK_END_MARKER_ID })
      : '';
    const moreLinkHtml = remainingTextCount > 0
      ? (state.workLoadMode === 'manual'
        ? `
          <div class="settings-button-grid">
            <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, {
              from: Math.max(
                firstShownTextIndex,
                Math.min(totalTextFragments, shownTextCount + workPageBatchSize) - workPageMaxRendered + 1
              ),
              visible: Math.min(totalTextFragments, shownTextCount + workPageBatchSize)
            })}">次の${Math.min(workPageBatchSize, remainingTextCount)}断片を読む</a>
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
        topLoadHtml,
        moreLinkHtml: `${earlierLinkHtml}${moreLinkHtml}`,
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
    const timeline = app.querySelector('.timeline[aria-label="作品断片一覧"]');
    let loadingUp = false;
    let loadingDown = false;

    const createBatchElement = (range, firstIndex, lastIndex) => {
      const element = document.createElement('div');
      element.className = 'work-fragment-batch';
      element.dataset.workFragmentBatch = '';
      element.dataset.firstIndex = String(firstIndex);
      element.dataset.lastIndex = String(lastIndex);
      const batchReturnToHash = buildWorkHash(workId, {
        from: firstShownTextIndex,
        visible: shownTextCount
      });
      element.innerHTML = range.fragments.map((fragment) => fragment.type === 'break'
        ? (fragment.breakKind === 'heading' ? '' : breakCardMarkup())
        : renderWorkFragmentCard(fragment, batchReturnToHash)).join('');
      bindWorkOverlayActions(element, handleOverlayCycle);
      return element;
    };

    const findViewportAnchor = () => {
      const headerBottom = app.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
      return [...app.querySelectorAll('[data-work-fragment-index]')]
        .find((card) => card.getBoundingClientRect().bottom > headerBottom + 8) ?? null;
    };

    const mutateKeepingAnchor = (mutation) => {
      const anchor = findViewportAnchor();
      const beforeTop = anchor?.getBoundingClientRect().top ?? null;
      mutation();
      if (anchor && beforeTop !== null && anchor.isConnected) {
        const restoreAnchor = () => {
          if (!anchor.isConnected) {
            return;
          }
          const delta = anchor.getBoundingClientRect().top - beforeTop;
          if (Math.abs(delta) > 0.5) {
            window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
          }
        };
        restoreAnchor();
        const correctedScrollY = window.scrollY;
        requestAnimationFrame(() => {
          if (Math.abs(window.scrollY - correctedScrollY) < 1) {
            restoreAnchor();
          }
        });
      }
    };

    const removeEndingCard = () => {
      app.querySelector(`[data-work-state-action="mark-complete"]`)?.closest('.fragment-card')?.remove();
    };

    const appendEndingCard = () => {
      if (!timeline || app.querySelector(`[data-work-state-action="mark-complete"]`)) {
        return;
      }
      const endingContainer = document.createElement('div');
      endingContainer.innerHTML = workEndingCardMarkup({
        isCompleted: getWorkReadingStatus(workId) === 'completed',
        markerId: WORK_END_MARKER_ID
      });
      bindWorkStateActions(endingContainer, handleWorkStateAction);
      while (endingContainer.firstChild) {
        timeline.append(endingContainer.firstChild);
      }
    };

    const syncRangeUi = () => {
      const shownCountNode = app.querySelector('[data-work-shown-count]');
      if (shownCountNode) {
        shownCountNode.textContent = `${firstShownTextIndex > 1 ? `${firstShownTextIndex}–` : ''}${shownTextCount}`;
      }
      if (firstShownTextIndex <= 1) {
        app.querySelector('[data-work-auto-load-up-sentinel]')?.remove();
      }
      if (shownTextCount >= totalTextFragments) {
        app.querySelector('[data-work-auto-load-sentinel]')?.remove();
        appendEndingCard();
      } else {
        removeEndingCard();
      }
      history.replaceState(null, '', buildWorkHash(workId, {
        from: firstShownTextIndex,
        visible: shownTextCount
      }));
    };

    const ensureSentinels = () => {
      if (!timeline || state.workLoadMode !== 'auto') {
        return;
      }
      if (firstShownTextIndex > 1 && !app.querySelector('[data-work-auto-load-up-sentinel]')) {
        const panel = document.createElement('div');
        panel.className = 'work-auto-load-sentinel work-auto-load-sentinel-top';
        panel.dataset.workAutoLoadUpSentinel = '';
        panel.setAttribute('aria-hidden', 'true');
        timeline.prepend(panel);
      }
      if (shownTextCount < totalTextFragments && !app.querySelector('[data-work-auto-load-sentinel]')) {
        const panel = document.createElement('div');
        panel.className = 'work-auto-load-panel';
        panel.dataset.workAutoLoadSentinel = '';
        panel.innerHTML = `<p class="settings-status settings-status-subtle">続きを自動で読み込みます。残り ${totalTextFragments - shownTextCount}断片</p>`;
        timeline.insertAdjacentElement('afterend', panel);
      }
    };

    const trimOppositeEdge = (direction) => {
      if (!timeline) {
        return;
      }
      const batches = [...timeline.querySelectorAll('[data-work-fragment-batch]')];
      const renderedCount = batches.reduce((sum, batch) => {
        return sum + Number(batch.dataset.lastIndex) - Number(batch.dataset.firstIndex) + 1;
      }, 0);
      if (renderedCount <= workPageMaxRendered || batches.length < 2) {
        return;
      }
      if (direction === 'down') {
        mutateKeepingAnchor(() => batches[0].remove());
      } else {
        batches.at(-1).remove();
      }
      const remainingBatches = [...timeline.querySelectorAll('[data-work-fragment-batch]')];
      firstShownTextIndex = Number(remainingBatches[0].dataset.firstIndex);
      shownTextCount = Number(remainingBatches.at(-1).dataset.lastIndex);
    };

    const loadDirection = (direction) => {
      if (!timeline || (direction === 'up' ? loadingUp : loadingDown)) {
        return;
      }
      if (direction === 'up' && firstShownTextIndex <= 1) {
        return;
      }
      if (direction === 'down' && shownTextCount >= totalTextFragments) {
        return;
      }

      if (direction === 'up') {
        loadingUp = true;
      } else {
        loadingDown = true;
      }
      const adjacentRange = calculateAdjacentWorkRange({
        direction,
        firstIndex: firstShownTextIndex,
        lastIndex: shownTextCount,
        totalCount: totalTextFragments,
        batchSize: workPageBatchSize
      });
      const nextFirst = adjacentRange.firstIndex;
      const nextLast = adjacentRange.lastIndex;
      const range = sliceWorkFragmentsForVisibleCount(state.fragments, workId, nextLast, nextFirst);
      const batch = createBatchElement(range, nextFirst, nextLast);

      if (direction === 'up') {
        mutateKeepingAnchor(() => {
          const sentinel = timeline.querySelector('[data-work-auto-load-up-sentinel]');
          timeline.insertBefore(batch, sentinel?.nextSibling ?? timeline.firstChild);
        });
        firstShownTextIndex = nextFirst;
      } else {
        timeline.append(batch);
        shownTextCount = nextLast;
      }
      trimOppositeEdge(direction);
      ensureSentinels();
      syncRangeUi();
      if (direction === 'up') {
        loadingUp = false;
      } else {
        loadingDown = false;
      }
      bindAutoLoadForCurrentRange();
    };

    const bindAutoLoadForCurrentRange = () => {
      state.workAutoLoadCleanup?.();
      ensureSentinels();
      const cleanupUp = bindWorkAutoLoad(app, {
        enabled: state.workLoadMode === 'auto' && firstShownTextIndex > 1,
        sentinelSelector: '[data-work-auto-load-up-sentinel]',
        rootMargin: '320px 0px 0px 0px',
        edge: 'up',
        onIntersect: () => loadDirection('up')
      });
      const cleanupDown = bindWorkAutoLoad(app, {
        enabled: state.workLoadMode === 'auto' && shownTextCount < totalTextFragments,
        sentinelSelector: '[data-work-auto-load-sentinel]',
        rootMargin: '0px 0px 320px 0px',
        edge: 'down',
        onIntersect: () => loadDirection('down')
      });
      state.workAutoLoadCleanup = () => {
        cleanupUp?.();
        cleanupDown?.();
      };
    };
    bindAutoLoadForCurrentRange();
    bindWorkStateActions(app, handleWorkStateAction);
    bindWorkOverlayActions(app, handleOverlayCycle);
  }

  return { renderWorkPage };
}
