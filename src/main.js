import { sampleFragments, sampleWorks } from './sample-data.js?v=20260617045446';
import {
  buildHomeTimelineEvents,
  buildLibraryWorksByStatus,
  buildSavedItems,
  canonicalizeBookmarkRecords,
  deriveWorkReadingStatus,
  getBookmarkForWork,
  getFirstReadableFragmentForWork,
  getFragmentById,
  getReadingStateForWork,
  sameBookmarkRecords,
  savedCollectionLabel,
  sortSavedRecords,
  sortUpdatedRecords
} from './state.js?v=20260617045446';
import { ALL_STORE_NAMES, STORE_NAMES, clearStore, getAllRecords, getRecord, putRecord, putRecords } from './db.js?v=20260617045446';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260617045446';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260617045446';
import { listQuotes, removeQuote, saveQuote } from './quotes.js?v=20260617045446';
import {
  createBookmarkActions,
  createCollectionActions,
  createDetailActions,
  createSearchActions,
  createSettingsActions
} from './app-actions.js?v=20260617045446';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260617045446';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260617045446';
import { derivePreviewFromText } from './import-preview.js?v=20260617045446';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260617045446';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260617045446';
import { repairAozoraHeadingNotesInHtml, repairAozoraLayoutNotesInHtml } from './aozora-headings.js?v=20260617045446';
import { convertAozoraEmphasisToHtml } from './aozora-emphasis.js?v=20260617045446';
import { repairAozoraLegacyRubyHtml } from './aozora-ruby.js?v=20260617045446';
import { estimateFragmentOverlayRisk, fragmentText } from './fragmenter.js?v=20260617045446';
import { buildCollectionHash, buildFragmentHash, buildHomeHash, buildLibraryHash, buildWorkHash, parseHashRoute } from './router.js?v=20260617045446';
import { AOZORA_CATALOG_ASSET_PATH, AOZORA_CATALOG_META_ID, buildAozoraCatalogMeta, normalizeAozoraCatalogPayload } from './aozora-catalog.js?v=20260617045446';
import { searchAozoraCatalog } from './aozora-search.js?v=20260617045446';
import {
  bindCollectionActions,
  bindDetailActions,
  bindReaderScaleControls,
  bindSearchInteractions,
  bindSettingsInteractions,
  bindWorkHeaderActions,
  bindWorkStateActions,
  bindWorkOverlayActions
} from './ui-bindings.js?v=20260617045446';
import {
  aozoraSearchResultsMarkup,
  breakCardMarkup,
  collectionBodyMarkup,
  errorBodyMarkup,
  fragmentDetailBodyMarkup,
  homeBodyMarkup,
  libraryTabButtonMarkup,
  layoutMarkup,
  libraryBodyMarkup,
  loadingBodyMarkup,
  savedItemCardMarkup,
  searchBodyMarkup,
  searchImportSheetMarkup,
  searchPreviewMarkup,
  settingsBodyMarkup,
  settingsPendingImportMarkup,
  timelineCardMarkup,
  workEndingCardMarkup,
  workFragmentCardMarkup,
  workBodyMarkup
} from './views.js?v=20260617045446';

const app = document.querySelector('#app');
const WORK_PAGE_BATCH_SIZE = 24;
const SEARCH_RESULTS_BATCH_SIZE = 25;
const READER_FONT_SCALE_STORAGE_KEY = 'dopagaki-reader-font-scale';
const WORK_LOAD_MODE_SETTING_ID = 'setting:work-load-mode';
const LIBRARY_TAB_ORDER = ['reading', 'unread', 'completed'];
const LIBRARY_TAB_LABELS = {
  reading: '読書中',
  unread: '未読',
  completed: '読了'
};
const READER_FONT_SCALES = [
  { value: 0.92, label: 'A-' },
  { value: 1, label: '標準' },
  { value: 1.1, label: 'A+' }
];
const state = {
  works: [],
  fragments: [],
  likes: new Set(),
  bookmarks: new Set(),
  quotes: new Set(),
  likeRecords: [],
  bookmarkRecords: [],
  quoteRecords: [],
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
  workLoadMode: 'auto',
  readerFontScale: 1,
  workHeaderProgressCleanup: null,
  workAutoLoadCleanup: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeReaderFontScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return READER_FONT_SCALES.find((item) => item.value === parsed)?.value ?? 1;
}

function applyReaderFontScale(value) {
  const normalized = normalizeReaderFontScale(value);
  state.readerFontScale = normalized;
  document.documentElement.style.setProperty('--reader-scale', String(normalized));
}

function loadReaderFontScale() {
  try {
    applyReaderFontScale(localStorage.getItem(READER_FONT_SCALE_STORAGE_KEY));
  } catch (_error) {
    applyReaderFontScale(1);
  }
}

function saveReaderFontScale(value) {
  const normalized = normalizeReaderFontScale(value);
  applyReaderFontScale(normalized);

  try {
    localStorage.setItem(READER_FONT_SCALE_STORAGE_KEY, String(normalized));
  } catch (_error) {
    // Ignore storage errors and keep the current in-memory scale.
  }
}

function renderReaderScaleControls() {
  return `
    <div class="reader-scale-controls" aria-label="本文サイズ">
      ${READER_FONT_SCALES.map((option) => `
        <button
          type="button"
          class="reader-scale-button ${state.readerFontScale === option.value ? 'is-active' : ''}"
          data-reader-scale="${option.value}"
          aria-pressed="${state.readerFontScale === option.value ? 'true' : 'false'}"
        >${option.label}</button>
      `).join('')}
    </div>
  `;
}

function normalizeFragmentDisplayHtml(html) {
  return convertAozoraEmphasisToHtml(
    repairAozoraLegacyRubyHtml(
      repairAozoraLayoutNotesInHtml(
        repairAozoraHeadingNotesInHtml(String(html ?? ''))
      )
    )
  );
}

function renderLayout({ current, title, subtitle, body, headerMetaHtml = '' }) {
  if (typeof state.workHeaderProgressCleanup === 'function') {
    state.workHeaderProgressCleanup();
    state.workHeaderProgressCleanup = null;
  }
  if (typeof state.workAutoLoadCleanup === 'function') {
    state.workAutoLoadCleanup();
    state.workAutoLoadCleanup = null;
  }

  app.innerHTML = layoutMarkup({
    current: escapeHtml(current),
    title: escapeHtml(title),
    subtitle: escapeHtml(subtitle),
    body,
    headerMetaHtml
  });
}

function renderWorkLayout({ title, subtitle, body, headerMetaHtml = '' }) {
  if (typeof state.workHeaderProgressCleanup === 'function') {
    state.workHeaderProgressCleanup();
    state.workHeaderProgressCleanup = null;
  }
  if (typeof state.workAutoLoadCleanup === 'function') {
    state.workAutoLoadCleanup();
    state.workAutoLoadCleanup = null;
  }

  app.innerHTML = layoutMarkup({
    current: 'library',
    title: escapeHtml(title),
    subtitle: escapeHtml(subtitle),
    body,
    headerMetaHtml,
    headerClassName: 'page-header-compact',
    eyebrowHtml: ''
  });
}

function normalizeWorkLoadMode(value) {
  return value === 'manual' ? 'manual' : 'auto';
}

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

function findWorkById(workId) {
  return state.works.find((item) => item.id === workId) ?? null;
}

function normalizeLibraryTab(value) {
  return LIBRARY_TAB_ORDER.includes(value) ? value : 'reading';
}

function readingStatusLabel(status) {
  return LIBRARY_TAB_LABELS[normalizeLibraryTab(status)] ?? LIBRARY_TAB_LABELS.reading;
}

function getWorkReadingStatus(workId) {
  return deriveWorkReadingStatus({
    workId,
    readingStateRecords: state.readingStateRecords,
    bookmarkRecords: state.bookmarkRecords
  });
}

async function saveWorkReadingState(workId, status) {
  const normalizedStatus = status === 'completed' ? 'completed' : 'reading';
  const currentRecord = getReadingStateForWork(state.readingStateRecords, workId);
  const record = {
    id: workId,
    workId,
    status: normalizedStatus,
    updatedAt: new Date().toISOString(),
    createdAt: currentRecord?.createdAt ?? new Date().toISOString()
  };

  await putRecord('readingStates', record);
  const existingIndex = state.readingStateRecords.findIndex((item) => item.workId === workId);
  if (existingIndex >= 0) {
    state.readingStateRecords.splice(existingIndex, 1, record);
  } else {
    state.readingStateRecords = [record, ...state.readingStateRecords];
  }
}

function ensureWorkMarkedReading(workId) {
  if (!workId || getWorkReadingStatus(workId) !== 'unread') {
    return;
  }

  void saveWorkReadingState(workId, 'reading');
}

function fragmentSequenceOf(fragment) {
  if (Number.isFinite(fragment?.sequence)) {
    return fragment.sequence;
  }

  const suffix = String(fragment?.id ?? '').match(/-(\d{4,})$/u);
  if (suffix) {
    return Number(suffix[1]);
  }

  return Number.isFinite(fragment?.index) ? fragment.index : 0;
}

function sortFragments(records) {
  return [...records].sort((left, right) => {
    const workCompare = String(left.workId ?? '').localeCompare(String(right.workId ?? ''));
    if (workCompare !== 0) {
      return workCompare;
    }

    const sequenceCompare = fragmentSequenceOf(left) - fragmentSequenceOf(right);
    if (sequenceCompare !== 0) {
      return sequenceCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

function workCreatedAtValue(work) {
  const value = Date.parse(String(work?.createdAt ?? ''));
  return Number.isFinite(value) ? value : 0;
}

function getReadableFragments() {
  return state.fragments.filter((fragment) => fragment.type !== 'break');
}

function countWorkTextFragments(workId) {
  return state.fragments.filter((fragment) => fragment.workId === workId && fragment.type !== 'break').length;
}

function getReadableWorkFragments(workId) {
  return state.fragments.filter((fragment) => fragment.workId === workId && fragment.type !== 'break');
}

function renderBreakCard() {
  return breakCardMarkup();
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

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

function focusTimelineFragment(fragmentId) {
  if (!fragmentId) {
    return;
  }

  const selector = `[data-fragment-id="${CSS.escape(fragmentId)}"]`;
  const element = app.querySelector(selector);
  if (!element) {
    return;
  }

  element.scrollIntoView({ block: 'start', behavior: 'auto' });
  element.classList.add('is-focused-fragment');
  setTimeout(() => {
    element.classList.remove('is-focused-fragment');
  }, 1800);
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
    return '保存一覧へ戻る';
  }
  if (path.startsWith('#/work/')) {
    return '作品TLへ戻る';
  }

  return '一覧へ戻る';
}

function getVisibleCountParam(value, fallback = WORK_PAGE_BATCH_SIZE) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function sliceWorkFragmentsForVisibleCount(workId, visibleTextCount) {
  const workFragments = state.fragments.filter((fragment) => fragment.workId === workId);
  const limited = [];
  let textCount = 0;

  for (const fragment of workFragments) {
    if (fragment.type === 'break') {
      if (limited.length > 0) {
        limited.push(fragment);
      }
      continue;
    }

    if (textCount >= visibleTextCount) {
      break;
    }

    limited.push(fragment);
    textCount += 1;
  }

  while (limited.at(-1)?.type === 'break') {
    limited.pop();
  }

  return {
    fragments: limited,
    shownTextCount: textCount
  };
}

function renderWorkFragmentCard(fragment, returnToHash) {
  const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
  const bookmarked = state.bookmarks.has(fragment.id);
  const liked = state.likes.has(fragment.id);
  const overlayRisk = estimateFragmentOverlayRisk(safeDisplayHtml);
  const overlayState = bookmarked ? 'bookmark' : liked ? 'like' : 'idle';
  return workFragmentCardMarkup({
    fragmentId: escapeHtml(fragment.id),
    fragmentIndex: fragment.index,
    detailHref: buildFragmentHash(fragment.id, { returnTo: returnToHash }),
    displayHtml: safeDisplayHtml,
    overlayStateClassName: `is-${overlayState}`,
    overlayRiskClassName: overlayRisk ? 'is-overlay-risk' : '',
    ariaLabel: overlayButtonAriaLabel(fragment.index, overlayState),
    ariaPressed: overlayState === 'idle' ? 'false' : 'true'
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
    return `断片 ${fragmentIndex} は現在のしおりです。もう一度押すとしおりを外していいねにします`;
  }
  if (overlayState === 'like') {
    return `断片 ${fragmentIndex} はいいね済みです。もう一度押すと何もない状態に戻します`;
  }
  return `断片 ${fragmentIndex} を現在のしおりにする`;
}

function updateWorkOverlayButton(button, overlayState) {
  const fragmentIndex = Number(button.dataset.fragmentIndex || 0);
  button.classList.remove('is-idle', 'is-bookmark', 'is-like');
  button.classList.add(`is-${overlayState}`);
  button.setAttribute('aria-pressed', overlayState === 'idle' ? 'false' : 'true');
  button.setAttribute('aria-label', overlayButtonAriaLabel(fragmentIndex, overlayState));
}

async function cycleWorkOverlayState(fragmentId) {
  const fragment = getFragmentById(state.fragments, fragmentId);
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
    await saveBookmark(fragment);
  }

  await loadStateFromDb();
}

function bindWorkHeaderProgress(totalTextFragments) {
  const currentNode = app.querySelector('[data-work-progress-current]');
  const totalNode = app.querySelector('[data-work-progress-total]');
  const remainingNode = app.querySelector('[data-work-progress-remaining]');
  const cards = [...app.querySelectorAll('[data-work-fragment-index]')];

  if (!currentNode || !totalNode || !remainingNode || cards.length === 0) {
    return;
  }

  totalNode.textContent = String(totalTextFragments);

  const readCurrentIndex = () => {
    const headerBottom = app.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
    let activeIndex = Number(cards[0].dataset.workFragmentIndex || 1);

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const index = Number(card.dataset.workFragmentIndex || activeIndex);

      if (rect.top <= headerBottom + 12) {
        activeIndex = index;
        continue;
      }

      const distance = rect.top - (headerBottom + 12);
      if (distance < Math.max(rect.height * 0.5, 80)) {
        activeIndex = index;
      }
      break;
    }

    currentNode.textContent = String(activeIndex);
    remainingNode.textContent = String(calculateRemainingPercent(activeIndex, totalTextFragments));
  };

  let frameRequested = false;
  const scheduleUpdate = () => {
    if (frameRequested) {
      return;
    }
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      readCurrentIndex();
    });
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  scheduleUpdate();

  state.workHeaderProgressCleanup = () => {
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
  };
}

function bindWorkAutoLoad(workId, shownTextCount, totalTextFragments) {
  if (state.workLoadMode !== 'auto' || shownTextCount >= totalTextFragments) {
    return;
  }

  const sentinel = app.querySelector('[data-work-auto-load-sentinel]');
  if (!sentinel || typeof IntersectionObserver !== 'function') {
    return;
  }

  let triggered = false;
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting || triggered) {
      return;
    }

    triggered = true;
    observer.disconnect();
    location.replace(buildWorkHash(workId, {
      visible: shownTextCount + WORK_PAGE_BATCH_SIZE
    }));
  }, {
    root: null,
    rootMargin: '0px 0px 320px 0px',
    threshold: 0.01
  });

  observer.observe(sentinel);
  state.workAutoLoadCleanup = () => {
    observer.disconnect();
  };
}

function renderSavedItemCard(kind, item) {
  const label = savedCollectionLabel(kind);
  const collectionHash = buildCollectionHash(kind);
  const fragmentLink = item.fragment
    ? buildFragmentHash(item.fragment.id, { returnTo: collectionHash })
    : '';
  const timelineLink = item.fragment
    ? buildWorkHash(item.fragment.workId, {
        visible: Math.max(WORK_PAGE_BATCH_SIZE, item.fragment.index ?? WORK_PAGE_BATCH_SIZE),
        focus: item.fragment.id
      })
    : '';
  const savedDate = item.record.savedAt ? new Date(item.record.savedAt).toLocaleString('ja-JP') : '';

  return savedItemCardMarkup({
    workTitle: escapeHtml(item.work?.title ?? '作品不明'),
    workAuthor: escapeHtml(item.work?.author ?? ''),
    savedDateHtml: savedDate ? `<p class="settings-status settings-status-subtle">${escapeHtml(label)}: ${escapeHtml(savedDate)}</p>` : '',
    excerpt: escapeHtml(item.excerpt || '本文を参照できません。'),
    fragmentIndexHtml: item.fragmentIndex ? `<p class="fragment-index-label">断片 ${item.fragmentIndex}</p>` : '',
    openFragmentHtml: item.fragment ? `<a class="detail-action-button detail-action-link" href="${fragmentLink}">断片を開く</a>` : '<span class="detail-action-button is-disabled" aria-disabled="true">断片が見つかりません</span>',
    openTimelineHtml: item.fragment ? `<a class="detail-action-button detail-action-link" href="${timelineLink}">作品TLで開く</a>` : '',
    removeButtonHtml: `<button type="button" class="detail-action-button" data-collection-action="remove" data-collection-kind="${escapeHtml(kind)}" data-record-id="${escapeHtml(item.record.id)}">${escapeHtml(label)}を外す</button>`
  });
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
          visible: Math.max(WORK_PAGE_BATCH_SIZE, Number(event.fragment.index) || WORK_PAGE_BATCH_SIZE),
          focus: event.fragment.id
        })
      : buildWorkHash(event.fragment.workId, {
          visible: WORK_PAGE_BATCH_SIZE
        });
    return renderTimelineCard(event.fragment, event.workTitle, {
      titleText: buildHomeCardTitle(event.workTitle, event.fragment),
      metaLabel: event.metaLabel,
      statusLabel: getWorkReadingStatus(event.fragment.workId) === 'completed' ? '読了' : '',
      cardClassName: getWorkReadingStatus(event.fragment.workId) === 'completed' ? 'is-completed-home' : '',
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
      focusTimelineFragment(options.focusFragmentId);
    });
  }
}

function renderFragment(fragmentId, options = {}) {
  const readableFragments = getReadableFragments();
  const currentIndex = readableFragments.findIndex((item) => item.id === fragmentId);
  const fragment = currentIndex >= 0 ? readableFragments[currentIndex] : readableFragments[0];
  if (!fragment) {
    renderLoading('断片データを読み込んでいます。');
    return;
  }
  const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
  const work = findWorkById(fragment?.workId);
  const previousFragment = readableFragments[resolvedIndex - 1] ?? null;
  const nextFragment = readableFragments[resolvedIndex + 1] ?? null;
  const liked = state.likes.has(fragment.id);
  const bookmarked = state.bookmarks.has(fragment.id);
  const quoted = state.quotes.has(fragment.id);
  const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
  const workHash = buildWorkHash(fragment.workId, {
    visible: Math.max(WORK_PAGE_BATCH_SIZE, fragment.index ?? WORK_PAGE_BATCH_SIZE),
    focus: fragment.id
  });
  const backToHash = options.returnTo || workHash;
  const showBackLink = Boolean(options.returnTo && options.returnTo !== workHash);
  const backLinkLabel = returnLinkLabel(options.returnTo);

  renderLayout({
    current: 'home',
    title: work?.title ?? '断片個別ページ',
    subtitle: '断片の前後移動と保存操作はここで行います。',
    body: fragmentDetailBodyMarkup({
      author: escapeHtml(work?.author ?? ''),
      readerScaleControlsHtml: renderReaderScaleControls(),
      displayHtml: safeDisplayHtml,
      previousLinkHtml: previousFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(previousFragment.id, { returnTo: options.returnTo })}">前へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">前へ</span>`,
      nextLinkHtml: nextFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(nextFragment.id, { returnTo: options.returnTo })}">次へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">次へ</span>`,
      likeButtonHtml: `<button type="button" class="detail-action-button ${liked ? 'is-active' : ''}" data-action="like" data-fragment-id="${escapeHtml(fragment.id)}">${liked ? 'いいね済み' : 'いいね'}</button>`,
      bookmarkButtonHtml: `<button type="button" class="detail-action-button ${bookmarked ? 'is-active' : ''}" data-action="bookmark" data-fragment-id="${escapeHtml(fragment.id)}">${bookmarked ? '現在のしおり' : 'しおり'}</button>`,
      quoteButtonHtml: `<button type="button" class="detail-action-button ${quoted ? 'is-active' : ''}" data-action="quote" data-fragment-id="${escapeHtml(fragment.id)}">${quoted ? '引用保存済み' : '引用保存'}</button>`,
      workLinkHtml: `<a class="detail-action-button detail-action-link" href="${workHash}">作品TLのこの位置へ</a>`,
      backLinkHtml: showBackLink ? `<a class="detail-action-button" href="${backToHash}">${backLinkLabel}</a>` : ''
    })
  });

  bindDetailActions(app, async (action, fragmentId) => {
    await handleDetailAction(action, fragmentId);
  });
  bindReaderScaleControls(app, (value) => {
    saveReaderFontScale(value);
    route();
  });

  ensureWorkMarkedReading(fragment.workId);
}

function buildImportSummary(stores) {
  return [
    `works ${stores.works.length}件`,
    `fragments ${stores.fragments.length}件`,
    `likes ${stores.likes.length}件`,
    `bookmarks ${stores.bookmarks.length}件`,
    `quotes ${stores.quotes.length}件`,
    `readingStates ${stores.readingStates.length}件`,
    `settings ${stores.settings.length}件`
  ].join(' / ');
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
    const readingStatus = getWorkReadingStatus(work.id);
    return `
      <article class="info-panel info-panel-library-work">
        <a class="panel-link panel-link-library-work" href="#/work/${encodeURIComponent(work.id)}">
          <h2 class="section-title library-work-title">${escapeHtml(work.title)}</h2>
          <p class="section-text library-work-author">${escapeHtml(work.author ?? '')}</p>
          <p class="settings-status settings-status-subtle">${countWorkTextFragments(work.id)}断片</p>
          <p class="settings-status settings-status-subtle">${escapeHtml(readingStatusLabel(readingStatus))}</p>
          ${bookmark ? `<p class="settings-status settings-status-subtle">しおり: 断片 ${bookmark.fragmentIndex}</p>` : ''}
        </a>
      </article>
    `;
  }).join('');
  const collectionsHtml = `
    <article class="info-panel">
      <h2 class="section-title">保存一覧</h2>
      <p class="settings-status settings-status-subtle">しおり ${state.bookmarkRecords.length}件 / いいね ${state.likeRecords.length}件 / 引用保存 ${state.quoteRecords.length}件</p>
      <div class="settings-button-grid">
        <a class="detail-action-button detail-action-link" href="${buildCollectionHash('bookmarks')}">しおり一覧を開く</a>
        <a class="detail-action-button detail-action-link" href="${buildCollectionHash('likes')}">いいね一覧を開く</a>
        <a class="detail-action-button detail-action-link" href="${buildCollectionHash('quotes')}">引用保存一覧を開く</a>
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
}

function renderCollectionPage(kind) {
  const items = buildSavedItems({
    kind,
    bookmarkRecords: state.bookmarkRecords,
    likeRecords: state.likeRecords,
    quoteRecords: state.quoteRecords,
    fragments: state.fragments,
    findWorkById
  });
  const label = savedCollectionLabel(kind);
  const subtitle = kind === 'bookmarks' ? '作品ごとの最新しおりをここから開けます。' : '保存した断片へここから戻れます。';
  const description = kind === 'bookmarks'
    ? '作品ごとの現在しおりを新しい順に表示します。'
    : `${label}した断片を新しい順に表示します。`;
  const emptyText = kind === 'bookmarks'
    ? '断片個別ページか作品TLでしおりを付けると、ここから再開できます。'
    : '断片個別ページで保存すると、ここから再アクセスできます。';
  const itemsHtml = items.map((item) => renderSavedItemCard(kind, item)).join('');

  renderLayout({
    current: 'library',
    title: `${label}一覧`,
    subtitle,
    body: collectionBodyMarkup({
      label: escapeHtml(label),
      description: escapeHtml(description),
      count: items.length,
      emptyTitle: `${escapeHtml(label)}はまだありません`,
      emptyText: escapeHtml(emptyText),
      itemsHtml
    })
  });

  bindCollectionActions(app, async (kind, recordId) => {
    await handleCollectionAction(kind, recordId);
  });
}

function renderWorkPage(workId, options = {}) {
  const work = findWorkById(workId);
  if (!work) {
    renderError(new Error('作品が見つかりませんでした。'));
    return;
  }
  const totalTextFragments = countWorkTextFragments(workId);
  const readableWorkFragments = getReadableWorkFragments(workId);
  const visibleTextCount = Math.min(
    getVisibleCountParam(options.visible, WORK_PAGE_BATCH_SIZE),
    totalTextFragments || WORK_PAGE_BATCH_SIZE
  );
  const { fragments, shownTextCount } = sliceWorkFragmentsForVisibleCount(workId, visibleTextCount);
  const remainingTextCount = Math.max(0, totalTextFragments - shownTextCount);
  const returnToHash = buildWorkHash(workId, { visible: shownTextCount });
  const bookmark = getBookmarkForWork(state.bookmarkRecords, workId);
  const bookmarkJumpHash = bookmark
    ? buildWorkHash(workId, {
        visible: Math.max(WORK_PAGE_BATCH_SIZE, Number(bookmark.fragmentIndex) || WORK_PAGE_BATCH_SIZE),
        focus: bookmark.fragmentId
      })
    : '';
  const bookmarkHtml = bookmark
    ? `<p class="settings-status settings-status-subtle"><a class="text-link" href="${bookmarkJumpHash}">しおりの断片 ${bookmark.fragmentIndex} を開く</a></p>`
    : '';
  const fragmentsHtml = fragments.map((fragment) => fragment.type === 'break' ? renderBreakCard() : renderWorkFragmentCard(fragment, returnToHash)).join('');
  const endingCardHtml = shownTextCount >= totalTextFragments && totalTextFragments > 0
    ? workEndingCardMarkup({ isCompleted: getWorkReadingStatus(workId) === 'completed' })
    : '';
  const moreLinkHtml = remainingTextCount > 0
    ? (state.workLoadMode === 'manual'
      ? `
        <div class="settings-button-grid">
          <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, { visible: shownTextCount + WORK_PAGE_BATCH_SIZE })}">もっと読む（残り ${remainingTextCount}断片）</a>
        </div>
      `
      : `
        <div class="work-auto-load-panel" data-work-auto-load-sentinel>
          <p class="settings-status settings-status-subtle">続きを自動で読み込みます。残り ${remainingTextCount}断片</p>
        </div>
      `)
    : '';

  renderWorkLayout({
    title: work?.title ?? '作品ページ',
    subtitle: work?.author ?? '著者不明',
    headerMetaHtml: renderWorkHeaderMeta(shownTextCount, totalTextFragments),
    body: workBodyMarkup({
      workTitle: escapeHtml(work?.title ?? '無題'),
      workAuthor: escapeHtml(work?.author ?? ''),
      totalTextFragments,
      shownTextCount,
      bookmarkHtml,
      readerScaleControlsHtml: renderReaderScaleControls(),
      fragmentsHtml,
      moreLinkHtml,
      endingCardHtml
    })
  });

  if (options.focus) {
    requestAnimationFrame(() => {
      focusTimelineFragment(options.focus);
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
      visible: Math.max(WORK_PAGE_BATCH_SIZE, targetIndex),
      focus: targetFragment.id
    });
  });
  bindWorkHeaderProgress(totalTextFragments);
  bindWorkAutoLoad(workId, shownTextCount, totalTextFragments);
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
      updateWorkOverlayButton(item, getWorkOverlayState(item.dataset.fragmentId));
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
              ? `<button type="button" class="detail-action-button settings-button" data-search-action="show-more-aozora-results">さらに${SEARCH_RESULTS_BATCH_SIZE}件表示</button>`
              : ''}
            ${shownResultCount > SEARCH_RESULTS_BATCH_SIZE
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

async function ensureSampleData() {
  const existingWorks = await getAllRecords('works');
  if (existingWorks.length > 0) {
    return;
  }

  await putRecords('works', sampleWorks);
  await putRecords('fragments', sampleFragments);
}

async function loadStateFromDb() {
  state.works = await getAllRecords('works');
  state.fragments = sortFragments(await getAllRecords('fragments'));
  state.likeRecords = sortSavedRecords(await listLikes());
  const bookmarkRecords = await listBookmarks();
  const canonicalBookmarks = canonicalizeBookmarkRecords(bookmarkRecords, state.fragments);
  const sortedBookmarkRecords = sortSavedRecords(bookmarkRecords);
  if (!sameBookmarkRecords(sortedBookmarkRecords, canonicalBookmarks)) {
    await clearStore('bookmarks');
    if (canonicalBookmarks.length > 0) {
      await putRecords('bookmarks', canonicalBookmarks);
    }
  }
  state.bookmarkRecords = canonicalBookmarks;
  state.quoteRecords = sortSavedRecords(await listQuotes());
  state.readingStateRecords = sortUpdatedRecords(await getAllRecords('readingStates'));
  state.likes = new Set(state.likeRecords.map((item) => item.fragmentId));
  state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
  state.quotes = new Set(state.quoteRecords.map((item) => item.fragmentId));
  const workLoadModeSetting = await getRecord('settings', WORK_LOAD_MODE_SETTING_ID);
  state.workLoadMode = normalizeWorkLoadMode(workLoadModeSetting?.value);
}

const { toggleBookmark } = createBookmarkActions({
  state,
  getFragmentById,
  getBookmarkForWork,
  saveBookmark,
  listBookmarks,
  canonicalizeBookmarkRecords,
  loadStateFromDb,
  route
});

const { handleDetailAction } = createDetailActions({
  state,
  getFragmentById,
  findWorkById,
  removeLike,
  saveLike,
  removeQuote,
  saveQuote,
  toggleBookmark,
  loadStateFromDb,
  route
});

const { handleCollectionAction } = createCollectionActions({
  loadStateFromDb,
  renderCollectionPage,
  removeBookmark,
  removeLike,
  removeQuote
});

const {
  ensureAozoraCatalogReady,
  handleAozoraZipFile,
  handleSearchAction,
  initializeAozoraCatalogState
} = createSearchActions({
  state,
  renderSearch,
  readFileAsArrayBuffer,
  extractAozoraTxtFromZip,
  buildAozoraCatalogMeta,
  normalizeAozoraCatalogPayload,
  decodeAozoraText,
  derivePreviewFromText,
  searchAozoraCatalog,
  AOZORA_CATALOG_META_ID,
  AOZORA_CATALOG_ASSET_PATH,
  getAllRecords,
  clearStore,
  putRecord,
  putRecords,
  loadStateFromDb
});

const { handleImportFileSelection, handleSettingsAction } = createSettingsActions({
  state,
  renderSettings,
  downloadExportJson,
  readImportFile,
  importJsonData,
  buildImportSummary,
  loadStateFromDb,
  clearAllStores: async () => {
    for (const storeName of ALL_STORE_NAMES) {
      await clearStore(storeName);
    }
    state.aozoraCatalogQuery = '';
    state.aozoraCatalogStatus = '';
    state.aozoraCatalogLoading = false;
    state.aozoraCatalogMeta = null;
    state.aozoraCatalogRecords = [];
    state.aozoraCatalogResults = [];
    state.aozoraCatalogVisibleCount = SEARCH_RESULTS_BATCH_SIZE;
    state.importSheetOpen = false;
  },
  ensureSampleData,
  saveWorkLoadMode: async (mode) => {
    await putRecord('settings', {
      id: WORK_LOAD_MODE_SETTING_ID,
      value: normalizeWorkLoadMode(mode),
      updatedAt: new Date().toISOString()
    });
  },
  pickImportInput: () => {
    app.querySelector('[data-settings-input="import-json"]')?.click();
  }
});

function route() {
  const hash = location.hash || '#/';
  const routeState = parseHashRoute(hash);

  if (routeState.path.startsWith('#/fragment/')) {
    if (getReadableFragments().length === 0) {
      renderLoading('断片データを読み込んでいます。');
      return;
    }
    renderFragment(decodeURIComponent(routeState.path.replace('#/fragment/', '')), {
      returnTo: routeState.params.get('returnTo') || ''
    });
    return;
  }

  if (routeState.path.startsWith('#/work/')) {
    renderWorkPage(decodeURIComponent(routeState.path.replace('#/work/', '')), {
      visible: routeState.params.get('visible'),
      focus: routeState.params.get('focus') || ''
    });
    return;
  }

  if (routeState.path.startsWith('#/collection/')) {
    renderCollectionPage(decodeURIComponent(routeState.path.replace('#/collection/', '')));
    return;
  }

  switch (routeState.path) {
    case '#/library':
      scrollToPageTop();
      renderLibrary({
        tab: routeState.params.get('tab') || ''
      });
      break;
    case '#/search':
      scrollToPageTop();
      renderSearch();
      void ensureAozoraCatalogReady();
      break;
    case '#/settings':
      scrollToPageTop();
      renderSettings();
      break;
    case '#/':
    default:
      if (!routeState.params.get('focus')) {
        scrollToPageTop();
      }
      renderHome({
        focusFragmentId: routeState.params.get('focus') || ''
      });
      break;
  }
}

async function startApp() {
  renderLoading();

  try {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    loadReaderFontScale();
    await ensureSampleData();
    await loadStateFromDb();
    await initializeAozoraCatalogState();
    route();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

window.addEventListener('hashchange', route);
startApp();
