import { sampleFragments, sampleWorks } from './sample-data.js?v=20260616035949';
import { STORE_NAMES, clearStore, getAllRecords, putRecord, putRecords } from './db.js?v=20260616035949';
import { listLikes, removeLike, saveLike } from './likes.js?v=20260616035949';
import { listBookmarks, removeBookmark, saveBookmark } from './bookmarks.js?v=20260616035949';
import { listQuotes, removeQuote, saveQuote } from './quotes.js?v=20260616035949';
import { downloadExportJson, importJsonData, readImportFile } from './export-import.js?v=20260616035949';
import { readFileAsArrayBuffer } from './file-reader.js?v=20260616035949';
import { extractAozoraTxtFromZip } from './aozora-zip-importer.js?v=20260616035949';
import { decodeAozoraText } from './aozora-text-decoder.js?v=20260616035949';
import { cleanAozoraText } from './aozora-cleaner.js?v=20260616035949';
import { convertAozoraEmphasisToHtml, convertAozoraRubyAndEmphasisToHtml } from './aozora-emphasis.js?v=20260616035949';
import { estimateFragmentOverlayRisk, fragmentText } from './fragmenter.js?v=20260616035949';
import {
  errorBodyMarkup,
  homeBodyMarkup,
  layoutMarkup,
  libraryBodyMarkup,
  loadingBodyMarkup,
  searchBodyMarkup,
  searchPreviewMarkup,
  settingsBodyMarkup,
  settingsPendingImportMarkup
} from './views.js?v=20260616035949';

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
  pendingImport: null,
  importWorkStatus: '',
  importPreview: null,
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

function bindReaderScaleControls() {
  app.querySelectorAll('[data-reader-scale]').forEach((button) => {
    button.addEventListener('click', () => {
      saveReaderFontScale(button.dataset.readerScale);
      route();
    });
  });
}

function normalizeFragmentDisplayHtml(html) {
  return convertAozoraEmphasisToHtml(String(html ?? ''));
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
      <span class="page-header-pill">断片 <span data-work-progress-current>${shownCount}</span> / <span data-work-progress-total>${totalCount}</span></span>
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

function getFirstReadableFragmentForWork(workId) {
  return state.fragments.find((fragment) => {
    return fragment.workId === workId && fragment.type !== 'break';
  }) ?? null;
}

function getFragmentById(fragmentId) {
  return state.fragments.find((item) => item.id === fragmentId) ?? null;
}

function getBookmarkForWork(workId) {
  return state.bookmarkRecords.find((item) => item.workId === workId) ?? null;
}

function normalizeBookmarkRecord(record) {
  const fragment = getFragmentById(record?.fragmentId ?? record?.id);
  if (!fragment) {
    return null;
  }

  const savedAt = String(record?.savedAt ?? record?.createdAt ?? '');
  return {
    id: fragment.workId,
    workId: fragment.workId,
    fragmentId: fragment.id,
    fragmentIndex: fragment.index ?? null,
    savedAt: savedAt || new Date(0).toISOString()
  };
}

function canonicalizeBookmarkRecords(records) {
  const latestByWork = new Map();

  records.forEach((record) => {
    const normalized = normalizeBookmarkRecord(record);
    if (!normalized) {
      return;
    }

    const current = latestByWork.get(normalized.workId);
    if (!current || String(normalized.savedAt).localeCompare(String(current.savedAt)) >= 0) {
      latestByWork.set(normalized.workId, normalized);
    }
  });

  return sortSavedRecords([...latestByWork.values()]);
}

function sameBookmarkRecords(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((record, index) => {
    const other = right[index];
    return record.id === other.id
      && record.workId === other.workId
      && record.fragmentId === other.fragmentId
      && record.fragmentIndex === other.fragmentIndex
      && String(record.savedAt ?? '') === String(other.savedAt ?? '');
  });
}

function getHomeTimelineEvents() {
  const workEvents = state.works
    .map((work) => {
      const fragment = getFirstReadableFragmentForWork(work.id);
      if (!fragment || !work.createdAt) {
        return null;
      }

      return {
        id: `work:${work.id}:${work.createdAt}`,
        fragment,
        workTitle: work.title,
        metaLabel: `作品追加 / 断片 ${fragment.index}`,
        occurredAt: work.createdAt
      };
    })
    .filter(Boolean);

  const bookmarkEvents = state.bookmarkRecords
    .map((record) => {
      const fragment = getFragmentById(record.fragmentId);
      if (!fragment || !record.savedAt) {
        return null;
      }

      return {
        id: `bookmark:${record.fragmentId}:${record.savedAt}`,
        fragment,
        workTitle: findWorkById(fragment.workId)?.title ?? '無題',
        metaLabel: `最新しおり / 断片 ${fragment.index}`,
        occurredAt: record.savedAt
      };
    })
    .filter(Boolean);

  const likeEvents = state.likeRecords
    .map((record) => {
      const fragment = getFragmentById(record.fragmentId);
      if (!fragment || !record.savedAt) {
        return null;
      }

      return {
        id: `like:${record.fragmentId}:${record.savedAt}`,
        fragment,
        workTitle: findWorkById(fragment.workId)?.title ?? '無題',
        metaLabel: `いいね追加 / 断片 ${fragment.index}`,
        occurredAt: record.savedAt
      };
    })
    .filter(Boolean);

  return [...workEvents, ...bookmarkEvents, ...likeEvents].sort((left, right) => {
    const timeCompare = String(right.occurredAt).localeCompare(String(left.occurredAt));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function getReadableFragments() {
  return state.fragments.filter((fragment) => fragment.type !== 'break');
}

function countWorkTextFragments(workId) {
  return state.fragments.filter((fragment) => fragment.workId === workId && fragment.type !== 'break').length;
}

function renderBreakCard() {
  return `
    <article class="fragment-card fragment-card-break">
      <p class="break-label">原文空行</p>
    </article>
  `;
}

function renderTimelineCard(fragment, workTitle, options = {}) {
  const detailHref = options.detailHref ?? `#/fragment/${encodeURIComponent(fragment.id)}`;
  const safeDisplayHtml = normalizeFragmentDisplayHtml(fragment.displayHtml);
  return `
    <article class="fragment-card" data-fragment-id="${escapeHtml(fragment.id)}">
      <a class="fragment-card-link" href="${detailHref}" aria-label="${escapeHtml((workTitle ?? '無題') + ' の断片を開く')}">
        <span class="fragment-card-link-inner">
          <h2 class="fragment-work-title">${escapeHtml(workTitle ?? '無題')}</h2>
          ${options.metaLabel ? `<p class="fragment-meta-label">${escapeHtml(options.metaLabel)}</p>` : ''}
          <p class="fragment-body">${safeDisplayHtml}</p>
        </span>
      </a>
    </article>
  `;
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

function parseHashRoute(hash) {
  const value = hash || '#/';
  const [pathPart, queryString = ''] = value.split('?');
  return {
    path: pathPart || '#/',
    params: new URLSearchParams(queryString)
  };
}

function buildWorkHash(workId, options = {}) {
  const params = new URLSearchParams();
  if (options.visible && Number.isFinite(options.visible)) {
    params.set('visible', String(options.visible));
  }
  if (options.focus) {
    params.set('focus', options.focus);
  }

  const query = params.toString();
  return `#/work/${encodeURIComponent(workId)}${query ? `?${query}` : ''}`;
}

function buildFragmentHash(fragmentId, options = {}) {
  const params = new URLSearchParams();
  if (options.returnTo) {
    params.set('returnTo', options.returnTo);
  }

  const query = params.toString();
  return `#/fragment/${encodeURIComponent(fragmentId)}${query ? `?${query}` : ''}`;
}

function buildCollectionHash(kind) {
  return `#/collection/${encodeURIComponent(kind)}`;
}

function buildHomeHash(options = {}) {
  const params = new URLSearchParams();
  if (options.focus) {
    params.set('focus', options.focus);
  }

  const query = params.toString();
  return `#/${query ? `?${query}` : ''}`;
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
          class="fragment-overlay-bookmark ${bookmarked ? 'is-active' : ''} ${overlayRisk ? 'is-overlay-risk' : ''}"
          data-work-action="bookmark"
          data-fragment-id="${escapeHtml(fragment.id)}"
          data-fragment-index="${fragment.index}"
          aria-label="${bookmarked ? `断片 ${fragment.index} が現在のしおりです` : `断片 ${fragment.index} を現在のしおりにする`}"
          aria-pressed="${bookmarked ? 'true' : 'false'}"
        >断片 ${fragment.index}</button>
      </div>
    </article>
  `;
}

function bindWorkOverlayActions() {
  app.querySelectorAll('[data-work-action="bookmark"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await toggleBookmark(button.dataset.fragmentId, { rerender: false });
      app.querySelectorAll('[data-work-action="bookmark"]').forEach((item) => {
        updateWorkOverlayBookmarkButton(item, state.bookmarks.has(item.dataset.fragmentId));
      });
    });
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

function summarizeFragmentText(text, maxLength = 96) {
  const normalized = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

function sortSavedRecords(records) {
  return [...records].sort((left, right) => {
    const timeCompare = String(right.savedAt ?? '').localeCompare(String(left.savedAt ?? ''));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

function savedCollectionLabel(kind) {
  switch (kind) {
    case 'bookmarks':
      return 'しおり';
    case 'likes':
      return 'いいね';
    case 'quotes':
      return '引用保存';
    default:
      return '保存';
  }
}

function getSavedRecords(kind) {
  switch (kind) {
    case 'bookmarks':
      return state.bookmarkRecords;
    case 'likes':
      return state.likeRecords;
    case 'quotes':
      return state.quoteRecords;
    default:
      return [];
  }
}

function buildSavedItems(kind) {
  return getSavedRecords(kind).map((record) => {
    const fragment = getFragmentById(record.fragmentId);
    const work = findWorkById(record.workId ?? fragment?.workId) ?? null;
    const plainText = record.plainText ?? fragment?.plainText ?? '';
    const fragmentIndex = fragment?.index ?? record.fragmentIndex ?? null;

    return {
      record,
      fragment,
      work,
      fragmentIndex,
      excerpt: summarizeFragmentText(plainText)
    };
  });
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

  return `
    <article class="fragment-card preview-card">
      <h2 class="fragment-work-title">${escapeHtml(item.work?.title ?? '作品不明')}</h2>
      <p class="section-text">${escapeHtml(item.work?.author ?? '')}</p>
      ${savedDate ? `<p class="settings-status settings-status-subtle">${escapeHtml(label)}: ${escapeHtml(savedDate)}</p>` : ''}
      <p class="fragment-body">${escapeHtml(item.excerpt || '本文を参照できません。')}</p>
      ${item.fragmentIndex ? `<p class="fragment-index-label">断片 ${item.fragmentIndex}</p>` : ''}
      <div class="settings-button-grid">
        ${item.fragment ? `<a class="detail-action-button detail-action-link" href="${fragmentLink}">断片を開く</a>` : '<span class="detail-action-button is-disabled" aria-disabled="true">断片が見つかりません</span>'}
        ${item.fragment ? `<a class="detail-action-button detail-action-link" href="${timelineLink}">作品TLで開く</a>` : ''}
        <button type="button" class="detail-action-button" data-collection-action="remove" data-collection-kind="${escapeHtml(kind)}" data-record-id="${escapeHtml(item.record.id)}">${escapeHtml(label)}を外す</button>
      </div>
    </article>
  `;
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
  const timelineEvents = getHomeTimelineEvents();
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
    body: `
      <article class="detail-card">
        <p class="detail-author">${escapeHtml(work?.author ?? '')}</p>
        ${renderReaderScaleControls()}
        <div class="detail-body">${safeDisplayHtml}</div>
      </article>
      <div class="detail-nav-row" aria-label="断片移動">
        ${previousFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(previousFragment.id, { returnTo: options.returnTo })}">前へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">前へ</span>`}
        ${nextFragment ? `<a class="detail-nav-link" href="${buildFragmentHash(nextFragment.id, { returnTo: options.returnTo })}">次へ</a>` : `<span class="detail-nav-link is-disabled" aria-disabled="true">次へ</span>`}
      </div>
      <div class="detail-actions" aria-label="断片の操作">
        <button type="button" class="detail-action-button ${liked ? 'is-active' : ''}" data-action="like" data-fragment-id="${escapeHtml(fragment.id)}">${liked ? 'いいね済み' : 'いいね'}</button>
        <button type="button" class="detail-action-button ${bookmarked ? 'is-active' : ''}" data-action="bookmark" data-fragment-id="${escapeHtml(fragment.id)}">${bookmarked ? '現在のしおり' : 'しおり'}</button>
        <button type="button" class="detail-action-button ${quoted ? 'is-active' : ''}" data-action="quote" data-fragment-id="${escapeHtml(fragment.id)}">${quoted ? '引用保存済み' : '引用保存'}</button>
        <a class="detail-action-button detail-action-link" href="${workHash}">作品TLのこの位置へ</a>
        ${showBackLink ? `<a class="detail-action-button" href="${backToHash}">${backLinkLabel}</a>` : ''}
      </div>
    `
  });

  app.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleDetailAction(button.dataset.action, button.dataset.fragmentId);
    });
  });
  bindReaderScaleControls();
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
    const bookmark = getBookmarkForWork(work.id);
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
  const items = buildSavedItems(kind);
  const label = savedCollectionLabel(kind);
  const subtitle = kind === 'bookmarks' ? '作品ごとの最新しおりをここから開けます。' : '保存した断片へここから戻れます。';
  const description = kind === 'bookmarks'
    ? '作品ごとの現在しおりを新しい順に表示します。'
    : `${label}した断片を新しい順に表示します。`;
  const emptyText = kind === 'bookmarks'
    ? '断片個別ページか作品TLでしおりを付けると、ここから再開できます。'
    : '断片個別ページで保存すると、ここから再アクセスできます。';

  renderLayout({
    current: 'library',
    title: `${label}一覧`,
    subtitle,
    body: `
      <section class="panel-stack">
        <article class="info-panel">
          <h2 class="section-title">${escapeHtml(label)}一覧</h2>
          <p class="section-text">${escapeHtml(description)}</p>
          <p class="settings-status settings-status-subtle">${items.length}件</p>
        </article>
      </section>
      <section class="timeline" aria-label="${escapeHtml(label)}一覧">
        ${items.length > 0 ? items.map((item) => renderSavedItemCard(kind, item)).join('') : `
          <article class="info-panel info-panel-muted">
            <h2 class="section-title">${escapeHtml(label)}はまだありません</h2>
            <p class="section-text">${escapeHtml(emptyText)}</p>
          </article>
        `}
      </section>
    `
  });

  app.querySelectorAll('[data-collection-action="remove"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleCollectionAction(button.dataset.collectionKind, button.dataset.recordId);
    });
  });
}

function renderWorkPage(workId, options = {}) {
  const work = findWorkById(workId);
  const totalTextFragments = countWorkTextFragments(workId);
  const visibleTextCount = Math.min(
    getVisibleCountParam(options.visible, WORK_PAGE_BATCH_SIZE),
    totalTextFragments || WORK_PAGE_BATCH_SIZE
  );
  const { fragments, shownTextCount } = sliceWorkFragmentsForVisibleCount(workId, visibleTextCount);
  const remainingTextCount = Math.max(0, totalTextFragments - shownTextCount);
  const returnToHash = buildWorkHash(workId, { visible: shownTextCount });
  const bookmark = getBookmarkForWork(workId);

  renderLayout({
    current: 'library',
    title: work?.title ?? '作品ページ',
    subtitle: work?.author ?? '著者不明',
    headerMetaHtml: renderWorkHeaderMeta(shownTextCount, totalTextFragments),
    body: `
      <section class="panel-stack">
        <article class="info-panel">
          <h2 class="section-title">${escapeHtml(work?.title ?? '無題')}</h2>
          <p class="section-text">${escapeHtml(work?.author ?? '')}</p>
          <p class="settings-status settings-status-subtle">${totalTextFragments}断片</p>
          <p class="settings-status settings-status-subtle">表示中: ${shownTextCount}断片</p>
          ${bookmark ? `<p class="settings-status settings-status-subtle"><a class="text-link" href="${buildFragmentHash(bookmark.fragmentId, { returnTo: returnToHash })}">しおりの断片 ${bookmark.fragmentIndex} を開く</a></p>` : ''}
          ${renderReaderScaleControls()}
        </article>
      </section>
      <section class="timeline" aria-label="作品断片一覧">
        ${fragments.map((fragment) => fragment.type === 'break' ? renderBreakCard() : renderWorkFragmentCard(fragment, returnToHash)).join('')}
      </section>
      ${remainingTextCount > 0 ? `
        <div class="settings-button-grid">
          <a class="detail-action-button detail-action-link" href="${buildWorkHash(workId, { visible: shownTextCount + WORK_PAGE_BATCH_SIZE })}">もっと読む（残り ${remainingTextCount}断片）</a>
        </div>
      ` : ''}
    `
  });

  if (options.focus) {
    requestAnimationFrame(() => {
      focusTimelineFragment(options.focus);
    });
  }

  bindReaderScaleControls();
  bindWorkHeaderProgress(totalTextFragments);
  bindWorkOverlayActions();
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

  renderLayout({
    current: 'search',
    title: '作品を追加',
    subtitle: '青空文庫のZIPを選ぶだけで、短い断片に分けて読めます。',
    body: searchBodyMarkup(
      state.importWorkStatus ? `<p class="settings-status">${escapeHtml(state.importWorkStatus)}</p>` : '',
      previewMarkup
    )
  });

  const input = app.querySelector('[data-search-input="aozora-zip"]');
  const dropzone = app.querySelector('[data-dropzone="aozora-zip"]');

  if (input) {
    input.addEventListener('change', async (event) => {
      await handleAozoraZipFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });
    dropzone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
      await handleAozoraZipFile(event.dataTransfer?.files?.[0] ?? null);
    });
  }

  app.querySelectorAll('[data-search-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleSearchAction(button.dataset.searchAction);
    });
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
      pendingImportMarkup: pendingImportSummary
    })
  });

  app.querySelectorAll('[data-settings-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await handleSettingsAction(button.dataset.settingsAction);
    });
  });

  const importInput = app.querySelector('[data-settings-input="import-json"]');
  if (importInput) {
    importInput.addEventListener('change', async (event) => {
      await handleImportFileSelection(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }
}

function slugifyTitle(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || `work-${Date.now()}`;
}

function stripInlineAozoraNotation(text) {
  return String(text)
    .replace(/｜/gu, '')
    .replace(/《[^》]+》/gu, '')
    .replace(/[［\[]＃[^］\]]+[］\]]/gu, '')
    .trim();
}

function preserveLeadingFullWidthIndent(html) {
  return String(html).replace(/(^|<br>)(　+)/gu, (_match, prefix, spaces) => {
    return `${prefix}<span class="line-indent">${spaces}</span>`;
  });
}

function trimForMetadata(text) {
  return String(text).replace(/^[\t \u00a0]+|[\t \u00a0]+$/gu, '');
}

function stripBodyDirectiveTokens(text) {
  return String(text)
    .replace(/[［\[]＃[^］\]]+[］\]]/gu, '')
    .replace(/[-―—─－]+/gu, '')
    .replace(/[\t \u00a0]/gu, '');
}

function isDirectiveOnlyLine(line) {
  return stripBodyDirectiveTokens(line) === '';
}

function findBodyStartIndex(lines, authorLineIndex) {
  let index = Math.max(authorLineIndex + 1, 0);

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!trimForMetadata(line) || isDirectiveOnlyLine(line)) {
      index += 1;
      continue;
    }

    break;
  }

  return index;
}

function guessTitle(lines) {
  const candidate = lines.find((line) => trimForMetadata(line)) ?? '';
  return stripInlineAozoraNotation(candidate) || '無題';
}

function guessAuthor(lines) {
  const candidate = lines.slice(1, 6).find((line) => trimForMetadata(line)) ?? '';
  return stripInlineAozoraNotation(candidate) || '著者不明';
}

function derivePreviewFromText(rawText, encoding) {
  const cleanedText = cleanAozoraText(rawText);
  const lines = cleanedText.split('\n');
  const nonEmptyLines = lines.filter((line) => trimForMetadata(line));
  const title = guessTitle(lines);
  const author = guessAuthor(lines);
  const titleLineIndex = lines.findIndex((line) => trimForMetadata(line));
  const authorLineIndex = lines.findIndex((line, index) => {
    return index > titleLineIndex && trimForMetadata(line);
  });
  const bodyStartIndex = findBodyStartIndex(lines, authorLineIndex);
  const fallbackBodyText = nonEmptyLines.slice(Math.max(authorLineIndex, titleLineIndex) + 1).join('\n');
  const bodyText = lines.slice(bodyStartIndex).join('\n') || fallbackBodyText || cleanedText;
  const displayHtml = preserveLeadingFullWidthIndent(convertAozoraRubyAndEmphasisToHtml(bodyText));

  let fragmentIndex = 0;
  const fragments = [];

  for (const fragment of fragmentText(displayHtml)) {
    if (fragment.type === 'break') {
      if (fragments.length > 0) {
        fragments.push({
          type: 'break',
          breakCount: fragment.breakCount
        });
      }
      continue;
    }

    const plainText = fragment.displayHtml
      .replace(/<rt>[\s\S]*?<\/rt>/gu, '')
      .replace(/<[^>]+>/gu, '')
      .trim();

    if (!stripInlineAozoraNotation(plainText)) {
      continue;
    }

    fragmentIndex += 1;
    fragments.push({
      type: 'fragment',
      id: '',
      index: fragmentIndex,
      plainText,
      displayHtml: fragment.displayHtml
    });
  }

  while (fragments.at(-1)?.type === 'break') {
    fragments.pop();
  }

  return {
    title,
    author,
    encoding,
    fragments,
    textFragmentCount: fragmentIndex,
    cleanedText
  };
}

async function handleAozoraZipFile(file) {
  if (!file) {
    return;
  }

  state.importWorkStatus = 'ZIP を読み込んでいます。';
  state.importPreview = null;
  renderSearch();

  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const extracted = await extractAozoraTxtFromZip(arrayBuffer);
    const decoded = decodeAozoraText(extracted.bytes);
    const preview = derivePreviewFromText(decoded.text, decoded.encoding);
    state.importPreview = {
      ...preview,
      sourceFileName: extracted.fileName
    };
    state.importWorkStatus = `${extracted.fileName} を読み込みました。保存前に内容を確認してください。`;
  } catch (error) {
    console.error(error);
    state.importWorkStatus = `ZIP 取り込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  renderSearch();
}

async function saveImportedWork() {
  if (!state.importPreview) {
    return;
  }

  const workId = `work-${Date.now()}`;
  const workRecord = {
    id: workId,
    title: state.importPreview.title,
    author: state.importPreview.author,
    createdAt: new Date().toISOString()
  };

  let sequence = 0;
  let textIndex = 0;
  const fragmentRecords = state.importPreview.fragments.map((fragment) => {
    sequence += 1;

    if (fragment.type === 'break') {
      return {
        id: `${workId}-break-${String(sequence).padStart(4, '0')}`,
        workId,
        type: 'break',
        sequence,
        breakCount: fragment.breakCount,
        index: sequence,
        plainText: '',
        displayHtml: ''
      };
    }

    textIndex += 1;
    return {
      id: `${workId}-fragment-${String(sequence).padStart(4, '0')}`,
      workId,
      type: 'fragment',
      sequence,
      index: textIndex,
      plainText: fragment.plainText,
      displayHtml: fragment.displayHtml
    };
  });

  await putRecord('works', workRecord);
  await putRecords('fragments', fragmentRecords);
  await loadStateFromDb();
  state.importWorkStatus = `${state.importPreview.title} を作品アカウントとして保存しました。`;
  state.importPreview = null;
}

async function handleSearchAction(action) {
  if (action === 'save-imported-work') {
    try {
      await saveImportedWork();
    } catch (error) {
      console.error(error);
      state.importWorkStatus = `保存に失敗しました: ${error?.message ?? '不明なエラー'}`;
    }
    renderSearch();
    return;
  }

  if (action === 'clear-preview') {
    state.importPreview = null;
    state.importWorkStatus = '';
    renderSearch();
  }
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
  const canonicalBookmarks = canonicalizeBookmarkRecords(bookmarkRecords);
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

async function toggleBookmark(fragmentId, options = {}) {
  const fragment = getFragmentById(fragmentId);
  if (!fragment || fragment.type === 'break') {
    return;
  }

  const current = getBookmarkForWork(fragment.workId);
  if (current?.fragmentId === fragment.id) {
    return;
  }

  await saveBookmark(fragment);

  if (options.rerender === false) {
    state.bookmarkRecords = canonicalizeBookmarkRecords(await listBookmarks());
    state.bookmarks = new Set(state.bookmarkRecords.map((item) => item.fragmentId));
    return;
  }

  await loadStateFromDb();
  route();
}

async function handleDetailAction(action, fragmentId) {
  const fragment = state.fragments.find((item) => item.id === fragmentId);
  if (!fragment) {
    return;
  }

  const work = findWorkById(fragment.workId);

  if (action === 'like') {
    if (state.likes.has(fragmentId)) {
      await removeLike(fragmentId);
      state.likes.delete(fragmentId);
    } else {
      await saveLike(fragmentId);
      state.likes.add(fragmentId);
    }
  } else if (action === 'bookmark') {
    await toggleBookmark(fragmentId);
    return;
  } else if (action === 'quote') {
    if (state.quotes.has(fragmentId)) {
      await removeQuote(fragmentId);
      state.quotes.delete(fragmentId);
    } else {
      await saveQuote(fragment, work);
      state.quotes.add(fragmentId);
    }
  }

  await loadStateFromDb();
  route();
}

async function handleCollectionAction(kind, recordId) {
  if (!recordId) {
    return;
  }

  if (kind === 'bookmarks') {
    await removeBookmark(recordId);
  } else if (kind === 'likes') {
    await removeLike(recordId);
  } else if (kind === 'quotes') {
    await removeQuote(recordId);
  } else {
    return;
  }

  await loadStateFromDb();
  renderCollectionPage(kind);
}

async function handleExportJson() {
  state.exportStatus = 'JSONを書き出しています。';
  renderSettings();

  try {
    const result = await downloadExportJson();
    state.exportStatus = `${result.downloadName} を書き出しました。`;
  } catch (error) {
    console.error(error);
    state.exportStatus = `書き出しに失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  renderSettings();
}

async function handleImportFileSelection(file) {
  if (!file) {
    return;
  }

  state.importStatus = 'JSON を確認しています。';
  state.pendingImport = null;
  renderSettings();

  try {
    const pendingImport = await readImportFile(file);
    state.pendingImport = {
      ...pendingImport,
      summary: buildImportSummary(pendingImport.stores)
    };
    state.importStatus = 'インポート方法を選んでください。';
  } catch (error) {
    console.error(error);
    state.importStatus = `読み込みに失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  renderSettings();
}

async function executeImport(mode) {
  if (!state.pendingImport) {
    return;
  }

  state.importStatus = mode === 'replace' ? 'JSON を上書きインポートしています。' : 'JSON を追加インポートしています。';
  renderSettings();

  try {
    await importJsonData(state.pendingImport.stores, mode);
    await loadStateFromDb();
    state.importStatus = mode === 'replace' ? 'JSON を上書きインポートしました。' : 'JSON を追加インポートしました。';
    state.pendingImport = null;
  } catch (error) {
    console.error(error);
    state.importStatus = `インポートに失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  renderSettings();
}

async function resetAppData() {
  const confirmed = globalThis.confirm('保存した作品、断片、いいね、しおり、引用、設定を消去して初期状態へ戻します。続行しますか。');
  if (!confirmed) {
    return;
  }

  state.exportStatus = '';
  state.importStatus = 'アプリを初期化しています。';
  state.pendingImport = null;
  state.importWorkStatus = '';
  state.importPreview = null;
  renderSettings();

  try {
    for (const storeName of STORE_NAMES) {
      await clearStore(storeName);
    }

    await ensureSampleData();
    await loadStateFromDb();
    state.importStatus = 'アプリを初期化しました。初期データを再投入しています。';
  } catch (error) {
    console.error(error);
    state.importStatus = `初期化に失敗しました: ${error?.message ?? '不明なエラー'}`;
  }

  renderSettings();
}

async function handleSettingsAction(action) {
  if (action === 'export-json') {
    await handleExportJson();
    return;
  }

  if (action === 'pick-import') {
    app.querySelector('[data-settings-input="import-json"]')?.click();
    return;
  }

  if (action === 'import-replace') {
    await executeImport('replace');
    return;
  }

  if (action === 'import-append') {
    await executeImport('append');
    return;
  }

  if (action === 'import-cancel') {
    state.pendingImport = null;
    state.importStatus = 'インポートをキャンセルしました。';
    renderSettings();
    return;
  }

  if (action === 'reset-app') {
    await resetAppData();
  }
}

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
    route();
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

window.addEventListener('hashchange', route);
startApp();
