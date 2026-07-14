import { repairAozoraHeadingNotesInHtml, repairAozoraLayoutNotesInHtml } from './aozora-headings.js?v=20260714232323';
import { convertAozoraEmphasisToHtml } from './aozora-emphasis.js?v=20260714232323';
import { repairAozoraLegacyRubyHtml } from './aozora-ruby.js?v=20260714232323';
import { layoutMarkup } from './views.js?v=20260714232323';

const READER_FONT_SCALE_STORAGE_KEY = 'dopagaki-reader-font-scale';
const READER_FONT_SCALES = [
  { value: 0.92, label: 'A-' },
  { value: 1, label: '標準' },
  { value: 1.1, label: 'A+' }
];

export function escapeHtml(value) {
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

function cleanupRenderState(state) {
  if (typeof state.libraryWorkActionsCleanup === 'function') {
    state.libraryWorkActionsCleanup();
    state.libraryWorkActionsCleanup = null;
  }
  if (typeof state.workHeaderProgressCleanup === 'function') {
    state.workHeaderProgressCleanup();
    state.workHeaderProgressCleanup = null;
  }
  if (typeof state.workAutoLoadCleanup === 'function') {
    state.workAutoLoadCleanup();
    state.workAutoLoadCleanup = null;
  }
}

export function createAppShell({ app, state }) {
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
    cleanupRenderState(state);
    app.innerHTML = layoutMarkup({
      current: escapeHtml(current),
      title: escapeHtml(title),
      subtitle: escapeHtml(subtitle),
      body,
      headerMetaHtml
    });
  }

  function renderWorkLayout({ title, subtitle, body, headerMetaHtml = '' }) {
    cleanupRenderState(state);
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

  function scrollToPageTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  return {
    escapeHtml,
    loadReaderFontScale,
    normalizeFragmentDisplayHtml,
    renderLayout,
    renderReaderScaleControls,
    renderWorkLayout,
    saveReaderFontScale,
    scrollToPageTop
  };
}

export function buildImportSummary(stores) {
  return [
    `works ${stores.works.length}件`,
    `fragments ${stores.fragments.length}件`,
    `likes ${stores.likes.length}件`,
    `bookmarks ${stores.bookmarks.length}件`,
    `readingStates ${stores.readingStates.length}件`,
    `settings ${stores.settings.length}件`
  ].join(' / ');
}
