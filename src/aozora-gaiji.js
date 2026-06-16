import { AOZORA_GAIJI_MAP } from './aozora-gaiji-map.js?v=20260617033254';

const AOZORA_GAIJI_NOTE_PATTERN = /※[［\[]＃([^］\]]+)[］\]]/gu;
const UNICODE_REFERENCE_PATTERN = /U\+([0-9A-Fa-f]{4,6})/u;
const MENKUTEN_PATTERN = /(\d+)-(\d+)-(\d+)/gu;

function codePointFromHex(hex) {
  const codePoint = Number.parseInt(hex, 16);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return null;
  }
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
    return null;
  }
  return String.fromCodePoint(codePoint);
}

function replaceGaijiNote(fullMatch, noteText) {
  const unicodeMatch = String(noteText ?? '').match(UNICODE_REFERENCE_PATTERN);
  if (unicodeMatch) {
    return codePointFromHex(unicodeMatch[1]) ?? fullMatch;
  }

  const menkutenMatches = [...String(noteText ?? '').matchAll(MENKUTEN_PATTERN)];
  if (menkutenMatches.length === 0) {
    return fullMatch;
  }

  const lastMatch = menkutenMatches.at(-1);
  if (!lastMatch) {
    return fullMatch;
  }

  const [, plane, row, cell] = lastMatch;
  const key = `${plane}-${row}-${cell}`;
  return AOZORA_GAIJI_MAP[key] ?? fullMatch;
}

export function replaceAozoraGaijiNotation(text) {
  return String(text ?? '')
    .replace(AOZORA_GAIJI_NOTE_PATTERN, (fullMatch, noteText) => {
      return replaceGaijiNote(fullMatch, noteText);
    });
}
