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

export function buildFragmentHash(fragmentId, options = {}) {
  const params = new URLSearchParams();
  if (options.returnTo) {
    params.set('returnTo', options.returnTo);
  }

  const query = params.toString();
  return `#/fragment/${encodeURIComponent(fragmentId)}${query ? `?${query}` : ''}`;
}

export function buildCollectionHash(kind) {
  return `#/collection/${encodeURIComponent(kind)}`;
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
