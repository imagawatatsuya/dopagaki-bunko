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
