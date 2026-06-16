export function navMarkup(current) {
  const items = [
    ['home', 'ホーム', '#/'],
    ['library', '本棚', '#/library'],
    ['search', '追加', '#/search'],
    ['settings', '設定', '#/settings']
  ];

  return `<nav class="bottom-nav" aria-label="主要ナビゲーション">${items.map(([key, label, href]) => `
    <a class="bottom-nav-link" href="${href}" ${current === key ? 'aria-current="page"' : ''}>${label}</a>
  `).join('')}</nav>`;
}

export function layoutMarkup({ current, title, subtitle, body, headerMetaHtml = '', headerClassName = '', eyebrowHtml = '' }) {
  return `
    <header class="page-header ${headerClassName}">
      ${eyebrowHtml}
      <h1 class="page-title">${title}</h1>
      <p class="page-subtitle">${subtitle}</p>
      ${headerMetaHtml}
    </header>
    <main class="screen screen-${current}">
      ${body}
    </main>
    ${navMarkup(current)}
  `;
}

export function loadingBodyMarkup(message) {
  return `
    <section class="hero-panel">
      <p class="hero-kicker">Loading</p>
      <h2 class="hero-title">準備中</h2>
      <p class="hero-text">${message}</p>
    </section>
  `;
}

export function errorBodyMarkup(message) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">読み込みエラー</h2>
        <p class="section-text">${message}</p>
      </article>
    </section>
  `;
}

export function homeBodyMarkup(timelineCardsHtml) {
  return `
    <section class="timeline" aria-label="ホームタイムライン">
      ${timelineCardsHtml}
    </section>
  `;
}

export function libraryBodyMarkup({ tabsHtml, activeTabLabel, count, worksHtml, emptyTitle, emptyText, collectionsHtml }) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <div class="library-tab-list" role="tablist" aria-label="本棚の読書状態">
          ${tabsHtml}
        </div>
        <p class="settings-status settings-status-subtle">${activeTabLabel} ${count}件</p>
      </article>
    </section>
    <section class="panel-stack" id="library-works-panel" role="tabpanel" aria-label="${activeTabLabel}の作品一覧">
      ${worksHtml || `
        <article class="info-panel info-panel-muted">
          <h2 class="section-title">${emptyTitle}</h2>
          <p class="section-text">${emptyText}</p>
        </article>
      `}
      ${collectionsHtml}
    </section>
  `;
}

export function searchBodyMarkup({
  importNoticeHtml = '',
  catalogQuery = '',
  catalogStatusHtml = '',
  catalogMetaHtml = '',
  catalogResultsMarkup = '',
  importSheetMarkup = '',
  previewMarkup = ''
}) {
  return `
    <section class="panel-stack">
      ${importNoticeHtml}
      <article class="info-panel">
        <h2 class="section-title">青空文庫から検索</h2>
        <p class="section-text">同梱の作品一覧から作品名や著者名で探せます。項目を開いて図書カードへ進み、ZIPを保存してZIP取り込みから追加してください。</p>
        <div class="search-toolbar">
          <input
            type="search"
            class="search-input"
            value="${catalogQuery}"
            placeholder="作品名または著者名"
            data-search-input="catalog-query"
            enterkeyhint="search"
          >
          <div class="search-toolbar-actions">
            <button type="button" class="detail-action-button settings-button" data-search-action="search-aozora-catalog">検索</button>
            <button type="button" class="detail-action-button settings-button" data-search-action="refresh-aozora-catalog">一覧を再読込</button>
          </div>
        </div>
        ${catalogMetaHtml}
        ${catalogStatusHtml}
        ${catalogResultsMarkup}
      </article>
      ${previewMarkup}
    </section>
    <div class="search-import-fab-wrap">
      <button type="button" class="detail-action-button search-import-fab" data-search-action="open-import-sheet">ZIPを追加</button>
    </div>
    ${importSheetMarkup}
  `;
}

export function searchImportSheetMarkup({ isOpen = false, importStatusHtml = '' }) {
  if (!isOpen) {
    return '';
  }

  return `
    <div class="sheet-backdrop" data-search-action="close-import-sheet" aria-hidden="true"></div>
    <section class="bottom-sheet" aria-label="ZIP取り込み">
      <div class="bottom-sheet-handle" aria-hidden="true"></div>
      <div class="bottom-sheet-body">
        <div class="bottom-sheet-header">
          <div>
            <h2 class="section-title">ZIP取り込み</h2>
            <p class="section-text">保存した青空文庫のZIPを選ぶと、本文を断片へ分けてプレビューできます。</p>
          </div>
          <button type="button" class="detail-action-button bottom-sheet-close" data-search-action="close-import-sheet">閉じる</button>
        </div>
        <div class="settings-button-grid">
          <button type="button" class="detail-action-button settings-button" data-search-action="pick-aozora-zip">ZIPを選ぶ</button>
        </div>
        <label class="dropzone" data-dropzone="aozora-zip">
          <span class="dropzone-title">ZIP をここにドロップ</span>
          <span class="dropzone-text">または上のボタンから選択</span>
          <input type="file" class="settings-file-input" accept=".zip,application/zip" data-search-input="aozora-zip">
        </label>
        ${importStatusHtml}
      </div>
    </section>
  `;
}

export function aozoraSearchResultsMarkup(results, options = {}) {
  const emptyMessage = options.emptyMessage || '作品名または著者名で検索してください。';
  const resultSummaryHtml = options.resultSummaryHtml || '';
  const resultActionsHtml = options.resultActionsHtml || '';

  return `
    <div class="preview-list aozora-results-list" aria-label="青空文庫検索結果">
      ${resultSummaryHtml}
      ${results.length > 0 ? results.map((result) => `
        <article class="fragment-card aozora-result-card">
          <a class="aozora-result-link" href="${result.cardUrl}" target="_blank" rel="noreferrer">
            <h3 class="fragment-work-title aozora-result-title">${result.title}</h3>
            <p class="aozora-result-summary">${result.author}${result.kanaType ? `　${result.kanaType}` : ''}${result.copyrightWarning ? '　著作権注意' : ''}</p>
          </a>
        </article>
      `).join('') : `
        <article class="info-panel info-panel-muted">
          <p class="section-text">${emptyMessage}</p>
        </article>
      `}
      ${resultActionsHtml}
    </div>
  `;
}

export function searchPreviewMarkup(preview, breakCardMarkup) {
  if (!preview) {
    return '';
  }

  return `
    <article class="info-panel" data-search-preview>
      <h2 class="section-title">取り込みプレビュー</h2>
      <p class="section-text">作品名: ${preview.title}<br>著者名: ${preview.author}<br>断片数: ${preview.textFragmentCount}件<br>文字コード: ${preview.encoding}</p>
      ${preview.copyrightWarning ? '<p class="settings-status">この作品は著作権に注意が必要です。保存や利用前に図書カードを確認してください。</p>' : ''}
      <div class="preview-list">
        ${preview.fragments.slice(0, 8).map((fragment) => {
          if (fragment.type === 'break') {
            return breakCardMarkup;
          }

          return `
            <article class="fragment-card preview-card">
              <h3 class="fragment-work-title">断片 ${fragment.index}</h3>
              <div class="fragment-body">${fragment.displayHtml}</div>
            </article>
          `;
        }).join('')}
      </div>
      <div class="settings-button-grid">
        <button type="button" class="detail-action-button settings-button" data-search-action="save-imported-work">作品として保存する</button>
        <button type="button" class="detail-action-button settings-button" data-search-action="clear-preview">プレビューを閉じる</button>
      </div>
    </article>
  `;
}

export function settingsPendingImportMarkup(pendingImport, statusHtml) {
  if (!pendingImport) {
    return '';
  }

  return `
    <article class="info-panel settings-confirm-panel">
      <h2 class="section-title">インポート確認</h2>
      <p class="section-text">${pendingImport.fileName} を読み込みました。既存データを上書きするか、追加するかを選んでください。</p>
      <p class="settings-status settings-status-subtle">${statusHtml}</p>
      <div class="settings-button-grid">
        <button type="button" class="detail-action-button settings-button" data-settings-action="import-replace">上書きする</button>
        <button type="button" class="detail-action-button settings-button" data-settings-action="import-append">追加する</button>
        <button type="button" class="detail-action-button settings-button" data-settings-action="import-cancel">キャンセル</button>
      </div>
    </article>
  `;
}

export function settingsBodyMarkup({ exportStatusHtml, importStatusHtml, releaseStatusHtml, readingStatusHtml = '', workLoadMode = 'auto', pendingImportMarkup }) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">JSONエクスポート</h2>
        <p class="section-text">作品、しおり、いいね、引用保存をまとめてバックアップします。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="export-json">JSONを書き出す</button>
        </div>
        ${exportStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">JSONインポート</h2>
        <p class="section-text">バックアップしたJSONを読み込みます。実行前に、上書きするか追加するかを選べます。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="pick-import">JSONを選ぶ</button>
          <input type="file" class="settings-file-input" accept="application/json,.json" data-settings-input="import-json">
        </div>
        ${importStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">読み進め方</h2>
        <p class="section-text">作品ページの続き読み込み方法を選べます。</p>
        <div class="settings-button-grid">
          <button type="button" class="detail-action-button settings-button ${workLoadMode === 'auto' ? 'is-active' : ''}" data-settings-action="set-work-load-mode-auto">自動で続ける</button>
          <button type="button" class="detail-action-button settings-button ${workLoadMode === 'manual' ? 'is-active' : ''}" data-settings-action="set-work-load-mode-manual">手動で続ける</button>
        </div>
        ${readingStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">更新反映</h2>
        <p class="section-text">このサイトだけ最新版を確認して読み直します。他サイトのデータやキャッシュには触れません。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="refresh-release">最新状態に更新</button>
        </div>
        ${releaseStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">アプリ初期化</h2>
        <p class="section-text">保存した作品、断片、いいね、しおり、引用、設定を消去して最初の状態へ戻します。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="reset-app">アプリを初期化する</button>
        </div>
      </article>
      ${pendingImportMarkup}
    </section>
  `;
}

export function collectionBodyMarkup({ label, description, count, emptyTitle, emptyText, itemsHtml }) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">${label}一覧</h2>
        <p class="section-text">${description}</p>
        <p class="settings-status settings-status-subtle">${count}件</p>
      </article>
    </section>
    <section class="timeline" aria-label="${label}一覧">
      ${itemsHtml || `
        <article class="info-panel info-panel-muted">
          <h2 class="section-title">${emptyTitle}</h2>
          <p class="section-text">${emptyText}</p>
        </article>
      `}
    </section>
  `;
}

export function workBodyMarkup({
  workTitle,
  workAuthor,
  totalTextFragments,
  shownTextCount,
  bookmarkHtml,
  readerScaleControlsHtml,
  fragmentsHtml,
  moreLinkHtml,
  endingCardHtml = ''
}) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">${workTitle}</h2>
        <p class="section-text">${workAuthor}</p>
        <p class="settings-status settings-status-subtle">${totalTextFragments}断片</p>
        <p class="settings-status settings-status-subtle">表示中: ${shownTextCount}断片</p>
        ${bookmarkHtml}
        ${readerScaleControlsHtml}
      </article>
    </section>
    <section class="timeline" aria-label="作品断片一覧">
      ${fragmentsHtml}
      ${endingCardHtml}
    </section>
    ${moreLinkHtml}
  `;
}

export function libraryTabButtonMarkup({ label, href, isActive, panelId, tabId }) {
  return `
    <a
      class="library-tab-button ${isActive ? 'is-active' : ''}"
      href="${href}"
      id="${tabId}"
      role="tab"
      aria-selected="${isActive ? 'true' : 'false'}"
      aria-controls="${panelId}"
      ${isActive ? 'tabindex="0"' : 'tabindex="-1"'}
    >${label}</a>
  `;
}

export function breakCardMarkup(label = '原文空行') {
  return `
    <article class="fragment-card fragment-card-break">
      <p class="break-label">${label}</p>
    </article>
  `;
}

export function workEndingCardMarkup({ isCompleted = false }) {
  return `
    <article class="fragment-card fragment-card-break fragment-card-break-action ${isCompleted ? 'is-completed' : ''}">
      <button
        type="button"
        class="break-action-button"
        data-work-state-action="mark-complete"
        aria-pressed="${isCompleted ? 'true' : 'false'}"
      >${isCompleted ? '読了' : '原文終端'}</button>
    </article>
  `;
}

export function timelineCardMarkup({ fragmentId, detailHref, workTitle, metaLabel, displayHtml, ariaLabel, cardClassName = '', statusLabel = '' }) {
  return `
    <article class="fragment-card ${cardClassName}" data-fragment-id="${fragmentId}">
      <a class="fragment-card-link" href="${detailHref}" aria-label="${ariaLabel}">
        <span class="fragment-card-link-inner">
          <h2 class="fragment-work-title">${workTitle}</h2>
          ${metaLabel ? `<p class="fragment-meta-label">${metaLabel}</p>` : ''}
          ${statusLabel ? `<p class="fragment-state-label">${statusLabel}</p>` : ''}
          <p class="fragment-body">${displayHtml}</p>
        </span>
      </a>
    </article>
  `;
}

export function workFragmentCardMarkup({
  fragmentId,
  fragmentIndex,
  detailHref,
  displayHtml,
  overlayStateClassName,
  overlayRiskClassName,
  ariaLabel,
  ariaPressed
}) {
  return `
    <article class="fragment-card" data-fragment-id="${fragmentId}" data-work-fragment-index="${fragmentIndex}">
      <a class="fragment-card-link" href="${detailHref}">
        <span class="fragment-card-link-inner">
          <div class="fragment-body">
            ${displayHtml}
          </div>
        </span>
      </a>
      <div class="fragment-overlay-meta">
        <button
          type="button"
          class="fragment-overlay-bookmark ${overlayStateClassName} ${overlayRiskClassName}"
          data-work-action="cycle-marker"
          data-fragment-id="${fragmentId}"
          data-fragment-index="${fragmentIndex}"
          aria-label="${ariaLabel}"
          aria-pressed="${ariaPressed}"
        >断片 ${fragmentIndex}</button>
      </div>
    </article>
  `;
}

export function savedItemCardMarkup({
  workTitle,
  workAuthor,
  savedDateHtml,
  excerpt,
  fragmentIndexHtml,
  openFragmentHtml,
  openTimelineHtml,
  removeButtonHtml
}) {
  return `
    <article class="fragment-card preview-card">
      <h2 class="fragment-work-title">${workTitle}</h2>
      <p class="section-text">${workAuthor}</p>
      ${savedDateHtml}
      <p class="fragment-body">${excerpt}</p>
      ${fragmentIndexHtml}
      <div class="settings-button-grid">
        ${openFragmentHtml}
        ${openTimelineHtml}
        ${removeButtonHtml}
      </div>
    </article>
  `;
}

export function fragmentDetailBodyMarkup({
  author,
  readerScaleControlsHtml,
  displayHtml,
  previousLinkHtml,
  nextLinkHtml,
  likeButtonHtml,
  bookmarkButtonHtml,
  quoteButtonHtml,
  workLinkHtml,
  backLinkHtml
}) {
  return `
    <article class="detail-card">
      <p class="detail-author">${author}</p>
      ${readerScaleControlsHtml}
      <div class="detail-body">${displayHtml}</div>
    </article>
    <div class="detail-nav-row" aria-label="断片移動">
      ${previousLinkHtml}
      ${nextLinkHtml}
    </div>
    <div class="detail-actions" aria-label="断片の操作">
      ${likeButtonHtml}
      ${bookmarkButtonHtml}
      ${quoteButtonHtml}
      ${workLinkHtml}
      ${backLinkHtml}
    </div>
  `;
}
