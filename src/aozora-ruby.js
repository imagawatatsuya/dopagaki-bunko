function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const LINEAGE_PREFIXES = [
  '耳孫',
  '雲孫',
  '仍孫',
  '昆孫',
  '来孫',
  '玄孫',
  '曾孫',
  '曽孫',
  '孫',
  '子'
];
const IMPLICIT_RUBY_BASE_PATTERN = /([一-龠々〻仝〆〇ヶ]+)《([^》\n\r]+)》/gu;

function splitImplicitRubyBase(base) {
  for (const prefix of LINEAGE_PREFIXES) {
    if (!base.startsWith(prefix)) {
      continue;
    }

    const remainder = base.slice(prefix.length);
    if (remainder.length >= 2) {
      return {
        plainPrefix: prefix,
        rubyBase: remainder
      };
    }
  }

  return {
    plainPrefix: '',
    rubyBase: base
  };
}

function convertRubyNotation(text) {
  return text.replace(/｜([^《\n\r]+)《([^》\n\r]+)》/gu, (_match, base, ruby) => {
    return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
  });
}

function convertImplicitRubyNotation(text) {
  return text.replace(IMPLICIT_RUBY_BASE_PATTERN, (_match, base, ruby) => {
    const split = splitImplicitRubyBase(base);
    return `${escapeHtml(split.plainPrefix)}<ruby>${escapeHtml(split.rubyBase)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
  });
}

export function repairAozoraLegacyRubyHtml(text) {
  return String(text ?? '').replace(/<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/gu, (_match, base, ruby) => {
    const split = splitImplicitRubyBase(String(base));
    if (!split.plainPrefix) {
      return _match;
    }

    return `${escapeHtml(split.plainPrefix)}<ruby>${escapeHtml(split.rubyBase)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
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
