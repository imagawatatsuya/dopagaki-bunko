export function normalizeConverterBaseUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const url = new URL(trimmed);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function buildConverterLatestManifestUrl(baseUrl) {
  const normalized = normalizeConverterBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('PCのURLを入力してください。');
  }

  return new URL('./latest.json', `${normalized}/`).toString();
}

export function resolveConverterTextUrl(manifestUrl, manifest) {
  const candidate = String(
    manifest?.latestTxtPath
    ?? manifest?.latestTxtUrl
    ?? manifest?.txtPath
    ?? manifest?.txtUrl
    ?? ''
  ).trim();
  if (!candidate) {
    throw new Error('PC側の latest.json に TXT の場所がありません。');
  }

  return new URL(candidate, manifestUrl).toString();
}

export function isMixedContentBlocked(pageUrl, targetUrl) {
  if (!pageUrl || !targetUrl) {
    return false;
  }

  const page = new URL(pageUrl, globalThis.location?.href ?? 'http://localhost/');
  const target = new URL(targetUrl, page);
  return page.protocol === 'https:' && target.protocol === 'http:';
}
