import {
  buildCollectionHash,
  buildFragmentHash,
  buildWorkHash,
  parseHashRoute
} from './router.js?v=20260627130014';
import {
  savedCollectionLabel,
  deriveWorkReadingStatus
} from './state.js?v=20260627130014';
import {
  timelineCardMarkup,
  savedItemCardMarkup,
  workFragmentCardMarkup
} from './views.js?v=20260627130014';
import { estimateFragmentOverlayRisk } from './fragmenter.js?v=20260627130014';

export const LIBRARY_TAB_ORDER = ['reading', 'unread', 'completed'];
const LIBRARY_TAB_LABELS = {
  reading: '読書中',
  unread: '未読',
  completed: '読了'
};
export const WORK_END_MARKER_ID = 'work-end-marker';

export function calculateRemainingPercent(shownCount, totalCount) {
  if (!Number.isFinite(totalCount) || totalCount <= 0) {
    return 0;
  }

  const progressPercent = Math.round((shownCount / totalCount) * 100);
  return Math.max(0, 100 - progressPercent);
}

export function renderWorkHeaderMeta(shownCount, totalCount) {
  return `
    <div class="page-header-meta" aria-label="作品進捗">
      <button type="button" class="page-header-pill page-header-pill-button" data-work-header-action="jump-to-fragment">断片 <span data-work-progress-current>${shownCount}</span> / <span data-work-progress-total>${totalCount}</span></button>
      <span class="page-header-pill page-header-pill-subtle">残り <span data-work-progress-remaining>${calculateRemainingPercent(shownCount, totalCount)}</span>%</span>
    </div>
  `;
}

export function normalizeLibraryTab(value) {
  return LIBRARY_TAB_ORDER.includes(value) ? value : 'reading';
}

export function readingStatusLabel(status) {
  return LIBRARY_TAB_LABELS[normalizeLibraryTab(status)] ?? LIBRARY_TAB_LABELS.reading;
}

export function libraryDeleteScopeLabel(status) {
  return `${readingStatusLabel(status)}一覧`;
}

export function returnLinkLabel(returnTo) {
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

export function outlineLevelClassName(level) {
  if (level === 1) {
    return 'is-level-1';
  }
  if (level === 2) {
    return 'is-level-2';
  }
  return 'is-level-3';
}

export function createRendererHelpers({ state, appShell, workPageBatchSize }) {
  const {
    escapeHtml,
    normalizeFragmentDisplayHtml
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

    return workFragmentCardMarkup({
      fragmentId: escapeHtml(fragment.id),
      fragmentIndex: fragment.index,
      detailHref: buildFragmentHash(fragment.id, { returnTo: returnToHash }),
      displayHtml: safeDisplayHtml,
      overlayStateClassName: `is-${overlayState}`,
      overlayRiskClassName: overlayRisk ? 'is-overlay-risk' : '',
      ariaLabel: escapeHtml(overlayButtonAriaLabel(fragment.index, overlayState)),
      ariaPressed: overlayState === 'idle' ? 'false' : 'true'
    });
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

  return {
    buildHomeCardTitle,
    escapeHtml,
    findWorkById,
    getWorkOverlayState,
    getWorkReadingStatus,
    normalizeFragmentDisplayHtml,
    overlayButtonAriaLabel,
    renderSavedItemCard,
    renderTimelineCard,
    renderWorkFragmentCard
  };
}
