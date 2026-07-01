export function parseHashRoute(hash) {
  const value = hash || '#/';
  const [pathPart, queryString = ''] = value.split('?');
  return {
    path: pathPart || '#/',
    params: new URLSearchParams(queryString)
  };
}

export function parseSearchRouteIntent(hash) {
  const routeState = parseHashRoute(hash);
  if (routeState.path !== '#/search') {
    return {
      path: routeState.path,
      params: routeState.params,
      shouldOpenImportSheet: false,
      remoteImportUrl: '',
      shouldConsumeWindowNameImport: false
    };
  }

  return {
    path: routeState.path,
    params: routeState.params,
    shouldOpenImportSheet: routeState.params.has('remoteImportUrl'),
    remoteImportUrl: routeState.params.get('remoteImportUrl') || '',
    shouldConsumeWindowNameImport: routeState.params.get('windowNameImport') === '1'
  };
}

export function buildWorkHash(workId, options = {}) {
  const params = new URLSearchParams();
  if (options.from && Number.isFinite(options.from) && options.from > 1) {
    params.set('from', String(options.from));
  }
  if (options.visible && Number.isFinite(options.visible)) {
    params.set('visible', String(options.visible));
  }
  if (options.focus) {
    params.set('focus', options.focus);
  }
  if (options.stable) {
    params.set('stable', '1');
  }

  const query = params.toString();
  return `#/work/${encodeURIComponent(workId)}${query ? `?${query}` : ''}`;
}

export function buildWorkFocusHash(workId, fragmentEntry, workPageBatchSize) {
  const fragmentId = typeof fragmentEntry?.fragmentId === 'string'
    ? fragmentEntry.fragmentId
    : (typeof fragmentEntry?.id === 'string' ? fragmentEntry.id : '');
  const fragmentIndex = Number(fragmentEntry?.fragmentIndex ?? fragmentEntry?.index);
  if (!workId || !fragmentId || !Number.isFinite(fragmentIndex) || fragmentIndex < 1) {
    return '';
  }

  const batchSize = Number.isFinite(workPageBatchSize) ? Math.max(1, workPageBatchSize) : 1;
  const from = Math.max(1, fragmentIndex - Math.min(4, batchSize - 1));
  const visible = from + batchSize - 1;
  return buildWorkHash(workId, {
    from,
    visible,
    focus: fragmentId,
    stable: true
  });
}

export function buildWorkOutlineHash(workId, outlineEntry, workPageBatchSize) {
  return buildWorkFocusHash(workId, outlineEntry, workPageBatchSize);
}

export function buildWorkEndHash(workId, totalTextFragments, workPageBatchSize, endMarkerId = 'work-end-marker') {
  const totalCount = Number(totalTextFragments);
  if (!workId || !Number.isFinite(totalCount) || totalCount < 1) {
    return '';
  }

  const batchSize = Number.isFinite(workPageBatchSize) ? Math.max(1, workPageBatchSize) : totalCount;
  const from = Math.max(1, totalCount - batchSize + 1);
  return buildWorkHash(workId, {
    from,
    visible: totalCount,
    focus: endMarkerId,
    stable: true
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
