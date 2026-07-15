const IMPORT_PREVIEW_FRAGMENT_LIMIT = 4;

const KANA_TYPE_LABELS = new Map([
  ['新字新仮名', '新字・新かな'],
  ['新字旧仮名', '新字・旧かな'],
  ['旧字新仮名', '旧字・新かな'],
  ['旧字旧仮名', '旧字・旧かな']
]);

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
        <p class="settings-status">本棚が0件に見えても、データは端末に残っている可能性があります。このタブを閉じ、ブラウザで新しいタブを開いてdopagaki-bunkoのURLへ入り直してください。読込不良の復旧に「アプリを初期化する」は使わないでください。</p>
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
  searchScope = 'aozora',
  remoteImportUrl = '',
  importTextDraft = '',
  converterBaseUrl = '',
  catalogStatusHtml = '',
  catalogMetaHtml = '',
  catalogHelpHtml = '',
  catalogResultsMarkup = '',
  importSheetMarkup = '',
  previewMarkup = ''
}) {
  const normalizedScope = searchScope === 'library' ? 'library' : 'aozora';
  return `
    <section class="panel-stack">
      ${importNoticeHtml}
      <article class="info-panel">
        <h2 class="section-title">青空文庫から検索</h2>
        <p class="section-text">同梱の作品一覧から作品名や著者名で探せます。ZIPを開くか図書カードを確認し、保存した ZIP/TXT、公開 TXT URL、貼り付け TXT、または同一Wi-Fi上のPCから追加できます。</p>
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
            ${normalizedScope === 'aozora'
              ? '<button type="button" class="detail-action-button settings-button" data-search-action="refresh-aozora-catalog">一覧を再読込</button>'
              : ''}
          </div>
        </div>
        <div class="search-scope-tabs" role="tablist" aria-label="検索対象">
          <button
            type="button"
            class="search-scope-tab ${normalizedScope === 'aozora' ? 'is-active' : ''}"
            role="tab"
            aria-selected="${normalizedScope === 'aozora' ? 'true' : 'false'}"
            data-search-action="set-search-scope-aozora"
          >青空文庫</button>
          <button
            type="button"
            class="search-scope-tab ${normalizedScope === 'library' ? 'is-active' : ''}"
            role="tab"
            aria-selected="${normalizedScope === 'library' ? 'true' : 'false'}"
            data-search-action="set-search-scope-library"
          >本棚</button>
        </div>
        ${catalogMetaHtml}
        ${catalogStatusHtml}
        ${catalogHelpHtml}
        ${catalogResultsMarkup}
      </article>
      ${previewMarkup}
    </section>
    <div class="search-import-fab-wrap">
      <button type="button" class="detail-action-button search-import-fab" data-search-action="open-import-sheet">作品を取り込む</button>
    </div>
    ${importSheetMarkup}
  `;
}

export function readerActionStatusMarkup(message, tone = '') {
  const text = String(message ?? '').trim();
  if (!text) {
    return '';
  }

  const toneClassName = tone === 'success'
    ? ' settings-status-success'
    : tone === 'error'
      ? ' settings-status-error'
      : '';
  return `<p class="settings-status${toneClassName}">${text}</p>`;
}

export function searchImportSheetMarkup({
  isOpen = false,
  importStatusHtml = '',
  remoteImportUrl = '',
  remoteImportStatusHtml = '',
  importTextDraft = '',
  converterBaseUrl = ''
}) {
  if (!isOpen) {
    return '';
  }

  return `
    <div class="sheet-backdrop" data-search-action="close-import-sheet" aria-hidden="true"></div>
    <section class="bottom-sheet" aria-label="作品取り込み">
      <div class="bottom-sheet-handle" aria-hidden="true"></div>
      <div class="bottom-sheet-body">
        <div class="bottom-sheet-header">
          <div>
            <h2 class="section-title">作品を追加</h2>
            <p class="section-text">読み込み方法を選んで、本文を確認してから保存します。</p>
          </div>
          <button type="button" class="detail-action-button bottom-sheet-close" data-search-action="close-import-sheet">閉じる</button>
        </div>
        <label class="dropzone" data-dropzone="aozora-zip" role="button" tabindex="0">
          <span class="dropzone-title">ZIP または TXT を選ぶ</span>
          <span class="dropzone-text">クリックまたはタップ。ドラッグ&ドロップでも追加できます。</span>
          <input type="file" class="settings-file-input" accept=".zip,.txt,text/plain,application/zip" data-search-input="aozora-file">
        </label>
        <div class="panel-stack">
          <label class="settings-label" for="import-text">TXT を貼り付ける</label>
          <textarea
            id="import-text"
            class="search-input import-textarea"
            rows="8"
            placeholder="ここに青空文庫の TXT 本文を貼り付けます。"
            data-search-input="import-text"
          >${importTextDraft}</textarea>
          <div class="settings-button-grid">
            <button type="button" class="detail-action-button settings-button" data-search-action="preview-pasted-text">貼り付け内容を読む</button>
          </div>
        </div>
        <div class="panel-stack">
          <label class="settings-label" for="remote-import-url">TXT 公開URL</label>
          <input
            id="remote-import-url"
            type="url"
            class="search-input"
            value="${remoteImportUrl}"
            placeholder="https:// ではじまる TXT URL を入力"
            inputmode="url"
            data-search-input="remote-import-url"
          >
          <div class="settings-button-grid">
            <button type="button" class="detail-action-button settings-button" data-search-action="load-remote-import-url">URLのTXTを読む</button>
          </div>
          ${remoteImportStatusHtml}
        </div>
        <div class="panel-stack">
          <label class="settings-label" for="converter-base-url">PCのURL</label>
          <input
            id="converter-base-url"
            type="url"
            class="search-input"
            value="${converterBaseUrl}"
            placeholder="http://192.168.0.10:8765 または /works/作品名.txt"
            inputmode="url"
            data-search-input="converter-base-url"
          >
          <div class="settings-button-grid">
            <button type="button" class="detail-action-button settings-button" data-search-action="open-converter-bridge">PCからプレビューを開く</button>
            <button type="button" class="detail-action-button settings-button" data-search-action="receive-pending-converter-work">未受信作品を受け取る</button>
          </div>
          <p class="settings-status settings-status-subtle import-help-text"><code>PCからプレビューを開く</code> を使うと、PCのURLだけなら作品一覧、<code>/works/作品名.txt</code> まで入れるとその作品を直接開けます。受け取りに失敗した作品は、PC側の配信画面を開いたまま <code>未受信作品を受け取る</code> からもう一度プレビューへ送ります。</p>
        </div>
        ${importStatusHtml}
      </div>
    </section>
  `;
}

function kanaTypeLabelMarkup(kanaType) {
  const source = String(kanaType ?? '').trim();
  if (!source) {
    return '';
  }

  const label = KANA_TYPE_LABELS.get(source) ?? source;
  const className = source === '新字新仮名'
    ? 'aozora-kana-label aozora-kana-label-modern'
    : 'aozora-kana-label';
  return `<span class="${className}">${label}</span>`;
}

export function aozoraSearchResultsMarkup(results, options = {}) {
  const emptyMessage = options.emptyMessage || '作品名または著者名で検索してください。';
  const resultSummaryHtml = options.resultSummaryHtml || '';
  const resultActionsHtml = options.resultActionsHtml || '';

  return `
    <div class="preview-list aozora-results-list" aria-label="青空文庫検索結果">
      ${resultSummaryHtml}
      ${results.length > 0 ? results.map((result) => {
        const href = result.href || result.cardUrl || '#/';
        const targetAttrs = result.openInNewTab ? ' target="_blank" rel="noreferrer"' : '';
        const typeLabel = result.resultType === 'library' ? '本棚' : '';
        const kanaLabelHtml = kanaTypeLabelMarkup(result.kanaType);
        const statusParts = [
          result.author,
          kanaLabelHtml,
          typeLabel,
          result.isImported ? '本棚にあります' : '',
          result.copyrightWarning ? '著作権注意' : ''
        ].filter(Boolean);
        const hasZipButton = result.resultType === 'aozora'
          && !result.copyrightWarning
          && Boolean(result.textZipUrl);
        return `
        <article class="fragment-card aozora-result-card">
          ${result.resultType === 'library' ? `
            <a class="aozora-result-link" href="${href}"${targetAttrs}>
              <h3 class="fragment-work-title aozora-result-title">${result.title}</h3>
              <p class="aozora-result-summary">${statusParts.join('　')}</p>
            </a>
          ` : `
            <div class="aozora-result-copy">
              <h3 class="fragment-work-title aozora-result-title">${result.title}</h3>
              <p class="aozora-result-summary">${statusParts.join('　')}</p>
            </div>
            <div class="aozora-result-actions">
              ${hasZipButton ? `<a class="detail-action-button detail-action-link aozora-result-zip-link" href="${result.textZipUrl}" target="_blank" rel="noopener noreferrer">青空文庫ZIPを開く</a>` : ''}
              <p class="aozora-result-secondary-link-wrap">
                <a class="text-link aozora-result-secondary-link" href="${result.cardUrl}" target="_blank" rel="noopener noreferrer">図書カードを見る</a>
                ${result.copyrightWarning ? '<span class="aozora-result-secondary-note">著作権と公開状況を確認してください。</span>' : ''}
              </p>
            </div>
          `}
        </article>
      `;
      }).join('') : `
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

  const queueRemaining = Math.max(0, Number(preview.bridgeQueueRemaining) || 0);
  const isQueuedBridgeImport = Boolean(preview.bridgeAckUrl);
  const isExistingWorkUpdate = Boolean(preview.isExistingWorkUpdate);
  const isSaving = Boolean(preview.importSaveInProgress);
  const saveButtonLabel = isSaving
    ? (isExistingWorkUpdate ? '更新しています…' : '保存しています…')
    : isQueuedBridgeImport
    ? (
      isExistingWorkUpdate
        ? (queueRemaining > 0 ? '更新して次へ' : '更新して完了')
        : (queueRemaining > 0 ? '保存して次へ' : '保存して完了')
    )
    : (isExistingWorkUpdate ? '既存作品を更新する' : '作品として保存する');
  const queueStatusHtml = isQueuedBridgeImport
    ? `<p class="settings-status settings-status-subtle">${
      queueRemaining > 0
        ? `この作品の${isExistingWorkUpdate ? '更新' : '保存'}後、次の作品を開きます。残り ${queueRemaining}件`
        : `この作品が最後です。${isExistingWorkUpdate ? '更新' : '保存'}後にPC側の配信を終了します。`
    }</p>`
    : '';
  const updateNoticeHtml = isExistingWorkUpdate
    ? `<p class="settings-status settings-status-subtle">この取り込みは既存の「${preview.existingWorkTitle || preview.title}」を更新します。</p>`
    : '';
  const libraryWorkCount = Number(preview.libraryWorkCountAtImport);
  const libraryStateHtml = isQueuedBridgeImport && Number.isFinite(libraryWorkCount)
    ? (
      libraryWorkCount === 0
        ? '<p class="settings-status">このブラウザの本棚は0件です。この作品は既存更新ではなく新規保存になります。以前の作品があるはずなら、保存せずブラウザの保存状態を確認してください。</p>'
        : `<p class="settings-status settings-status-subtle">このブラウザの本棚: ${libraryWorkCount}作品。${isExistingWorkUpdate ? '同じ作品を確認しました。' : '同じ作品は見つからないため新規保存になります。'}</p>`
    )
    : '';

  return `
    <article class="info-panel" data-search-preview tabindex="-1" aria-labelledby="search-preview-title" aria-busy="${isSaving ? 'true' : 'false'}">
      <h2 class="section-title" id="search-preview-title">取り込みプレビュー</h2>
      <p class="section-text">作品名: ${preview.title}<br>著者名: ${preview.author}<br>断片数: ${preview.textFragmentCount}件<br>文字コード: ${preview.encoding}</p>
      ${isSaving
        ? `<p class="settings-status" role="status" aria-live="assertive">${preview.textFragmentCount}断片を${isExistingWorkUpdate ? '更新' : '保存'}しています。画面を閉じたり、もう一度押したりしないでください。</p>`
        : ''}
      ${libraryStateHtml}
      ${queueStatusHtml}
      ${updateNoticeHtml}
      ${preview.copyrightWarning ? '<p class="settings-status">この作品は著作権に注意が必要です。保存や利用前に図書カードを確認してください。</p>' : ''}
      <div class="preview-list">
        ${preview.fragments.slice(0, IMPORT_PREVIEW_FRAGMENT_LIMIT).map((fragment) => {
          if (fragment.type === 'break') {
            return fragment.breakKind === 'heading' ? '' : breakCardMarkup;
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
        <button type="button" class="detail-action-button settings-button" data-search-action="save-imported-work"${isSaving ? ' disabled' : ''}>${saveButtonLabel}</button>
        <button type="button" class="detail-action-button settings-button" data-search-action="clear-preview"${isSaving ? ' disabled' : ''}>プレビューを閉じる</button>
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

export function settingsBodyMarkup({ exportStatusHtml, textExportStatusHtml = '', importStatusHtml, releaseStatusHtml, readingStatusHtml = '', workLoadMode = 'auto', resetConfirmationStep = '', resetStatusHtml = '', pendingImportMarkup }) {
  const resetConfirmationMarkup = resetConfirmationStep === 'backup'
    ? `
      <article class="info-panel settings-confirm-panel" data-settings-reset-confirmation tabindex="-1">
        <h2 class="section-title">初期化前のバックアップ</h2>
        <p class="section-text">初期化すると本棚、しおり、ふせん、設定を削除します。先にJSONバックアップを書き出してください。</p>
        <div class="settings-button-grid">
          <button type="button" class="detail-action-button settings-button" data-settings-action="reset-export-backup">バックアップを書き出す</button>
          <button type="button" class="detail-action-button settings-button" data-settings-action="reset-backup-confirmed">バックアップ済みなので次へ</button>
          <button type="button" class="detail-action-button settings-button" data-settings-action="reset-cancel">初期化を中止する</button>
        </div>
      </article>
    `
    : resetConfirmationStep === 'final'
      ? `
        <article class="info-panel settings-confirm-panel" data-settings-reset-confirmation tabindex="-1">
          <h2 class="section-title">初期化の最終確認</h2>
          <p class="section-text">これは復旧操作ではありません。バックアップから戻せることを確認しましたか。実行すると保存データを消去します。</p>
          <div class="settings-button-grid">
            <button type="button" class="detail-action-button settings-button" data-settings-action="reset-confirm">確認したので初期化する</button>
            <button type="button" class="detail-action-button settings-button" data-settings-action="reset-cancel">初期化を中止する</button>
          </div>
        </article>
      `
      : '';
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <h2 class="section-title">更新反映</h2>
        <p class="section-text">このサイトだけ最新版を確認して読み直します。他サイトのデータやキャッシュには触れません。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="refresh-release">最新状態に更新</button>
        </div>
        ${releaseStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">JSONエクスポート</h2>
        <p class="section-text">作品、しおり、ふせんをまとめてバックアップします。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="export-json">JSONを書き出す</button>
        </div>
        ${exportStatusHtml}
      </article>
      <article class="info-panel">
        <h2 class="section-title">TXT出力</h2>
        <p class="section-text">作品ごとの統合TXTをZIPで書き出します。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="export-text-zip">TXT ZIPを書き出す</button>
        </div>
        ${textExportStatusHtml}
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
        <h2 class="section-title">困ったとき</h2>
        <p class="section-text">「準備中」が長く続く、本棚が突然0件になる、追加画面の表示が変わらない場合は、データを初期化しないでください。</p>
        <ol class="section-text">
          <li>いま開いているdopagaki-bunkoのタブを閉じます。</li>
          <li>ブラウザで新しいタブを開きます。</li>
          <li>dopagaki-bunkoのURLへ入り直します。</li>
        </ol>
        <p class="settings-status settings-status-subtle">本棚データが端末に残っていれば、新しいタブで再び表示されます。</p>
      </article>
      <article class="info-panel">
        <h2 class="section-title">アプリ初期化</h2>
        <p class="section-text">保存した作品、断片、ふせん、しおり、設定を実際に消去します。表示不良や「準備中」の復旧には使わないでください。先に上の「困ったとき」を実行してください。</p>
        <div class="settings-actions">
          <button type="button" class="detail-action-button settings-button" data-settings-action="reset-app">アプリを初期化する</button>
        </div>
        ${resetStatusHtml}
      </article>
      ${resetConfirmationMarkup}
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
  firstShownTextIndex = 1,
  actionStatusHtml = '',
  bookmarkHtml,
  markerHtml,
  outlineHtml = '',
  readerScaleControlsHtml,
  fragmentsHtml,
  moreLinkHtml,
  endingCardHtml = ''
}) {
  return `
    <section class="panel-stack">
      <article class="info-panel">
        <div class="work-summary-header">
          <div class="work-summary-copy">
            <h2 class="section-title">${workTitle}</h2>
            <p class="section-text">${workAuthor}</p>
            <p class="settings-status settings-status-subtle">${totalTextFragments}断片</p>
            <p class="settings-status settings-status-subtle">表示中: <span data-work-shown-count>${firstShownTextIndex > 1 ? `${firstShownTextIndex}–` : ''}${shownTextCount}</span>断片</p>
            ${actionStatusHtml}
            ${bookmarkHtml}
            ${markerHtml}
            ${outlineHtml}
          </div>
          ${readerScaleControlsHtml ? `<div class="work-summary-reader-scale">${readerScaleControlsHtml}</div>` : ''}
        </div>
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

export function workEndingCardMarkup({ isCompleted = false, markerId = 'work-end-marker' }) {
  return `
    <article class="fragment-card fragment-card-break fragment-card-break-action ${isCompleted ? 'is-completed' : ''}" data-fragment-id="${markerId}">
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
  noteHtml,
  fragmentIndexHtml,
  openFragmentHtml,
  openTimelineHtml,
  noteButtonHtml,
  removeButtonHtml
}) {
  return `
    <article class="fragment-card preview-card">
      <h2 class="fragment-work-title">${workTitle}</h2>
      <p class="section-text">${workAuthor}</p>
      ${savedDateHtml}
      <p class="fragment-body">${excerpt}</p>
      ${noteHtml}
      ${fragmentIndexHtml}
      <div class="settings-button-grid">
        ${openFragmentHtml}
        ${openTimelineHtml}
        ${noteButtonHtml}
        ${removeButtonHtml}
      </div>
    </article>
  `;
}

export function fragmentDetailBodyMarkup({
  author,
  displayHtml,
  actionStatusHtml = '',
  inlineToolsHtml = '',
  previousLinkHtml,
  nextLinkHtml,
  likeButtonHtml,
  bookmarkButtonHtml,
  noteButtonHtml = '',
  workLinkHtml = '',
  backLinkHtml = ''
}) {
  return `
    <article class="detail-card">
      <p class="detail-author">${author}</p>
      ${actionStatusHtml}
      <div class="detail-body">${displayHtml}</div>
      ${inlineToolsHtml}
    </article>
    <div class="detail-nav-row" aria-label="断片移動">
      ${previousLinkHtml}
      ${nextLinkHtml}
    </div>
    <div class="detail-actions" aria-label="断片の操作">
      ${likeButtonHtml}
      ${bookmarkButtonHtml}
      ${backLinkHtml}
      ${noteButtonHtml}
      ${workLinkHtml}
    </div>
  `;
}
