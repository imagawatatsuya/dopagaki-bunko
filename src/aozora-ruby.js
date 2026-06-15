function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function convertRubyNotation(text) {
  return text.replace(/｜([^《\n\r]+)《([^》\n\r]+)》/gu, (_match, base, ruby) => {
    return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
  });
}

function convertImplicitRubyNotation(text) {
  return text.replace(/([一-龠々]+)《([^》\n\r]+)》/gu, (_match, base, ruby) => {
    return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
  });
}

function preserveLineBreaks(text) {
  return text.replace(/\n/gu, '<br>');
}

export function convertAozoraRubyToHtml(text) {
  const escaped = escapeHtml(text);
  const explicitConverted = convertRubyNotation(escaped);
  const implicitConverted = convertImplicitRubyNotation(explicitConverted);
  return preserveLineBreaks(implicitConverted);
}
