export function parseHashRoute(hash) {
  const value = hash || '#/';
  const [pathPart, queryString = ''] = value.split('?');
  return {
    path: pathPart || '#/',
    params: new URLSearchParams(queryString)
  };
}

export function buildWorkHash(workId, options = {}) {
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

export function buildWorkOutlineHash(workId, outlineEntry, workPageBatchSize) {
  const fragmentId = typeof outlineEntry?.fragmentId === 'string' ? outlineEntry.fragmentId : '';
  const fragmentIndex = Number(outlineEntry?.fragmentIndex);
  if (!workId || !fragmentId || !Number.isFinite(fragmentIndex) || fragmentIndex < 1) {
    return '';
  }

  const visible = Number.isFinite(workPageBatchSize)
    ? Math.max(workPageBatchSize, fragmentIndex)
    : fragmentIndex;
  return buildWorkHash(workId, {
    visible,
    focus: fragmentId
  });
}

export function buildFragmentHash(fragmentId, options = {}) {
  const params = new URLSearchParams();
  if (options.returnTo) {
    params.set('returnTo', options.returnTo);
  }

  const query = params.toString();
  return `#/fragment/${encodeURIComponent(fragmentId)}${query ? `?${query}` : ''}`;
}

export function buildCollectionHash(kind, options = {}) {
  const params = new URLSearchParams();
  if (options.workId) {
    params.set('workId', options.workId);
  }

  const query = params.toString();
  return `#/collection/${encodeURIComponent(kind)}${query ? `?${query}` : ''}`;
}

export function buildLibraryHash(options = {}) {
  const params = new URLSearchParams();
  if (options.tab) {
    params.set('tab', options.tab);
  }

  const query = params.toString();
  return `#/library${query ? `?${query}` : ''}`;
}

export function buildHomeHash(options = {}) {
  const params = new URLSearchParams();
  if (options.focus) {
    params.set('focus', options.focus);
  }

  const query = params.toString();
  return `#/${query ? `?${query}` : ''}`;
}
