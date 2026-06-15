import { sampleFragments, sampleWorks } from './sample-data.js?v=20260616081111';
import {
  buildHomeTimelineEvents,
  buildSavedItems,
  canonicalizeBookmarkRecords,
  getBookmarkForWork,
  getFirstReadableFragmentForWork,
  getFragmentById,
  sameBookmarkRecords,
  savedCollectionLabel,
  sortSavedRecords
} from './state.js?v=20260616081111';
import { ALL_STORE_NAMES, STORE_NAMES, clearStore, getAllRecords, putRecord, putRecords } from './db.js?v=20260616081111';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260616081111';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260616081111';
import { listQuotes, removeQuote, saveQuote } from './quotes.js?v=20260616081111';
import {
  createBookmarkActions,
  createCollectionActions,
  createDetailActions,
  createSearchActions,
  createSettingsActions
} from './app-actions.js?v=20260616081111';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260616081111';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260616081111';
import { derivePreviewFromText } from './import-preview.js?v=20260616081111';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260616081111';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260616081111';
import { repairAozoraHeadingNotesInHtml } from './aozora-headings.js?v=20260616081111';
import { convertAozoraEmphasisToHtml } from './aozora-emphasis.js?v=20260616081111';
import { repairAozoraLegacyRubyHtml } from './aozora-ruby.js?v=20260616081111';
import { estimateFragmentOverlayRisk, fragmentText } from './fragmenter.js?v=20260616081111';
import { buildCollectionHash, buildFragmentHash, buildHomeHash, buildWorkHash, parseHashRoute } from './router.js?v=20260616081111';
import { AOZORA_CATALOG_ASSET_PATH, AOZORA_CATALOG_META_ID, buildAozoraCatalogMeta, normalizeAozoraCatalogPayload } from './aozora-catalog.js?v=20260616081111';
import { searchAozoraCatalog } from './aozora-search.js?v=20260616081111';
import {
  bindCollectionActions,
  bindDetailActions,
  bindReaderScaleControls,
  bindSearchInteractions,
  bindSettingsInteractions,
  bindWorkHeaderActions,
  bindWorkOverlayActions
} from './ui-bindings.js?v=20260616081111';
import {
  aozoraSearchResultsMarkup,
  breakCardMarkup,
  collectionBodyMarkup,
  errorBodyMarkup,
  fragmentDetailBodyMarkup,
  homeBodyMarkup,
  layoutMarkup,
  libraryBodyMarkup,
  loadingBodyMarkup,
  savedItemCardMarkup,
  searchBodyMarkup,
  searchPreviewMarkup,
  settingsBodyMarkup,
  settingsPendingImportMarkup,
  timelineCardMarkup,
  workFragmentCardMarkup,
  workBodyMarkup
} from './views.js?v=20260616081111';

const app = document.querySelector('#app');
const WORK_PAGE_BATCH_SIZE = 24;
const READER_FONT_SCALE_STORAGE_KEY = 'dopagaki-reader-font-scale';
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
  exportStatus: '',
  importStatus: '',
  releaseStatus: '',
  pendingImport: null,
  importWorkStatus: '',
  importPreview: null,
  aozoraCatalogQuery: '',
  aozoraCatalogStatus: '',
  aozoraCatalogMeta: null,
  aozoraCatalogRecords: [],
  aozoraCatalogResults: [],
  readerFontScale: 1,
  workHeaderProgressCleanup: null
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
      repairAozoraHeadingNotesInHtml(String(html ?? ''))
    )
  );
}

function renderLayout({ current, title, subtitle, body, headerMetaHtml = '' }) {
  if (typeof state.workHeaderProgressCleanup === 'function') {
    state.workHeaderProgressCleanup();
    state.workHeaderProgressCleanup = null;
  }

  app.innerHTML = layoutMarkup({
    current: escapeHtml(current),
    title: escapeHtml(title),
    subtitle: escapeHtml(subtitle),
    body,
    headerMetaHtml
  });
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

function renderTimelineCard(fragment, workTitle, options = {}) {
  const detailHref = options.detailHref ?? `#/fragment/${encodeURIComponent(fragment.id)}`;
  const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
  return timelineCardMarkup({
    fragmentId: escapeHtml(fragment.id),
    detailHref,
    workTitle: escapeHtml(workTitle ?? '無題'),
    metaLabel: options.metaLabel ? escapeHtml(options.metaLabel) : '',
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
  const overlayRisk = estimateFragmentOverlayRisk(safeDisplayHtml);
  return workFragmentCardMarkup({
    fragmentId: escapeHtml(fragment.id),
    fragmentIndex: fragment.index,
    detailHref: buildFragmentHash(fragment.id, { returnTo: returnToHash }),
    displayHtml: safeDisplayHtml,
    bookmarkedClassName: bookmarked ? 'is-active' : '',
    overlayRiskClassName: overlayRisk ? 'is-overlay-risk' : '',
    ariaLabel: bookmarked ? `断片 ${fragment.index} が現在のしおりです` : `断片 ${fragment.index} を現在のしおりにする`,
    ariaPressed: bookmarked ? 'true' : 'false'
  });
}

function updateWorkOverlayBookmarkButton(button, bookmarked) {
  const fragmentIndex = Number(button.dataset.fragmentIndex || 0);
  button.classList.toggle('is-active', bookmarked);
  button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
  button.setAttribute(
    'aria-label',
    bookmarked ? `断片 ${fragmentIndex} が現在のしおりです` : `断片 ${fragmentIndex} を現在のしおりにする`
  );
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
    return renderTimelineCard(event.fragment, event.workTitle, {
      metaLabel: event.metaLabel,
      detailHref: buildFragmentHash(event.fragment.id, {
        returnTo: buildHomeHash({ focus: event.fragment.id })
      })
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
}

function buildImportSummary(stores) {
  return [
    `works ${stores.works.length}件`,
    `fragments ${stores.fragments.length}件`,
    `likes ${stores.likes.length}件`,
    `bookmarks ${stores.bookmarks.length}件`,
    `quotes ${stores.quotes.length}件`,
    `settings ${stores.settings.length}件`
  ].join(' / ');
}

function renderLibrary() {
  const worksHtml = state.works.map((work) => {
    const bookmark = getBookmarkForWork(state.bookmarkRecords, work.id);
    return `
      <article class="info-panel">
        <a class="panel-link" href="#/work/${encodeURIComponent(work.id)}">
          <h2 class="section-title">${escapeHtml(work.title)}</h2>
          <p class="section-text">${escapeHtml(work.author ?? '')}</p>
          <p class="settings-status settings-status-subtle">${countWorkTextFragments(work.id)}断片</p>
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
    body: libraryBodyMarkup(worksHtml, collectionsHtml)
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
  const bookmarkHtml = bookmark
    ? `<p class="settings-status settings-status-subtle"><a class="text-link" href="${buildFragmentHash(bookmark.fragmentId, { returnTo: returnToHash })}">しおりの断片 ${bookmark.fragmentIndex} を開く</a></p>`
    : '';
  const fragmentsHtml = fragments.map((fragment) => fragment.type === 'break' ? renderBreakCard() : renderWorkFragmentCard(fragment, returnToHash)).join('');
  const moreLinkHtml = remainingTextCount > 0 ? `
    <div class="settings-button-grid">
      <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, { visible: shownTextCount + WORK_PAGE_BATCH_SIZE })}">もっと読む（残り ${remainingTextCount}断片）</a>
    </div>
  ` : '';

  renderLayout({
    current: 'library',
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
      moreLinkHtml
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
  bindWorkOverlayActions(app, async (fragmentId) => {
    await toggleBookmark(fragmentId, { rerender: false });
    app.querySelectorAll('[data-work-action="bookmark"]').forEach((item) => {
      updateWorkOverlayBookmarkButton(item, state.bookmarks.has(item.dataset.fragmentId));
    });
  });
}

function renderSearch() {
  const preview = state.importPreview;
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
    : '<p class="settings-status settings-status-subtle">作品一覧はまだ取得していません。</p>';
  const emptyMessage = state.aozoraCatalogQuery
    ? '一致する作品が見つかりませんでした。'
    : (state.aozoraCatalogRecords.length > 0 ? '作品名または著者名で検索してください。' : '先に作品一覧を更新してください。');
  const catalogResultsMarkup = aozoraSearchResultsMarkup(
    state.aozoraCatalogResults.map((result) => ({
      ...result,
      title: escapeHtml(result.title),
      author: escapeHtml(result.author),
      kanaType: escapeHtml(result.kanaType),
      workId: escapeHtml(result.workId),
      cardUrl: escapeHtml(result.cardUrl)
    })),
    {
      emptyMessage: escapeHtml(emptyMessage)
    }
  );

  renderLayout({
    current: 'search',
    title: '作品を追加',
    subtitle: '青空文庫で作品を探し、保存したZIPをここへ追加できます。',
    body: searchBodyMarkup({
      catalogQuery: escapeHtml(state.aozoraCatalogQuery),
      catalogStatusHtml: state.aozoraCatalogStatus ? `<p class="settings-status">${escapeHtml(state.aozoraCatalogStatus)}</p>` : '',
      catalogMetaHtml,
      catalogResultsMarkup,
      importStatusHtml: state.importWorkStatus ? `<p class="settings-status">${escapeHtml(state.importWorkStatus)}</p>` : '',
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
  state.likes = new Set(state.likeRecords.map((item) => item.fragmentId));
  state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
  state.quotes = new Set(state.quoteRecords.map((item) => item.fragmentId));
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
    state.aozoraCatalogMeta = null;
    state.aozoraCatalogRecords = [];
    state.aozoraCatalogResults = [];
  },
  ensureSampleData,
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
      renderLibrary();
      break;
    case '#/search':
      renderSearch();
      break;
    case '#/settings':
      renderSettings();
      break;
    case '#/':
    default:
      renderHome({
        focusFragmentId: routeState.params.get('focus') || ''
      });
      break;
  }
}

async function startApp() {
  renderLoading();

  try {
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
