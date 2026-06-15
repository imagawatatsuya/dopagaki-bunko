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

export function layoutMarkup({ current, title, subtitle, body, headerMetaHtml = '' }) {
  return `
    <header class="page-header">
      <p class="page-eyebrow">縦スクロール読書</p>
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
    <section class="hero-panel">
      <p class="hero-kicker">Timeline</p>
      <h2 class="hero-title">作品名と本文だけを流す。</h2>
      <p class="hero-text">読みかけの作品、気に入った断片、追加した作品がここに流れます。まずは気になった断片を開いて読んでください。</p>
    </section>
    <section class="timeline" aria-label="ホームタイムライン">
      ${timelineCardsHtml}
    </section>
  `;
}

export function libraryBodyMarkup(worksHtml, collectionsHtml) {
  return `
    <section class="panel-stack">
      ${worksHtml}
      ${collectionsHtml}
    </section>
  `;
}

export function searchBodyMarkup(statusHtml, previewMarkup) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">ZIP取り込み</h2>
        <p class="section-text">青空文庫のZIPを選ぶだけで、本文を読みやすい短い断片に分けます。保存前にプレビューで確認できます。</p>
        <label class="dropzone" data-dropzone="aozora-zip">
          <span class="dropzone-title">ZIP をここにドロップ</span>
          <span class="dropzone-text">またはクリックしてファイルを選択</span>
          <input type="file" class="settings-file-input" accept=".zip,application/zip" data-search-input="aozora-zip">
        </label>
        ${statusHtml}
      </article>
      ${previewMarkup}
    </section>
  `;
}

export function searchPreviewMarkup(preview, breakCardMarkup) {
  if (!preview) {
    return '';
  }

  return `
    <article class="info-panel">
      <h2 class="section-title">取り込みプレビュー</h2>
      <p class="section-text">作品名: ${preview.title}<br>著者名: ${preview.author}<br>断片数: ${preview.textFragmentCount}件<br>文字コード: ${preview.encoding}</p>
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

export function settingsBodyMarkup({ exportStatusHtml, importStatusHtml, pendingImportMarkup }) {
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
  moreLinkHtml
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
    </section>
    ${moreLinkHtml}
  `;
}

export function breakCardMarkup() {
  return `
    <article class="fragment-card fragment-card-break">
      <p class="break-label">原文空行</p>
    </article>
  `;
}

export function timelineCardMarkup({ fragmentId, detailHref, workTitle, metaLabel, displayHtml, ariaLabel }) {
  return `
    <article class="fragment-card" data-fragment-id="${fragmentId}">
      <a class="fragment-card-link" href="${detailHref}" aria-label="${ariaLabel}">
        <span class="fragment-card-link-inner">
          <h2 class="fragment-work-title">${workTitle}</h2>
          ${metaLabel ? `<p class="fragment-meta-label">${metaLabel}</p>` : ''}
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
  bookmarkedClassName,
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
          class="fragment-overlay-bookmark ${bookmarkedClassName} ${overlayRiskClassName}"
          data-work-action="bookmark"
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
