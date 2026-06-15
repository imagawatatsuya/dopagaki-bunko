import { AOZORA_GAIJI_MAP } from './aozora-gaiji-map.js?v=20260616074438';

const JIS_X_0213_GAIJI_PATTERN = /※[［\[]＃「([^」]+)」、第([34])水準(\d+)-(\d+)-(\d+)[］\]]/gu;
const JIS_X_0213_SYMBOL_PATTERN = /※[［\[]＃([^、]+)、(\d+)-(\d+)-(\d+)[］\]]/gu;
const UNICODE_GAIJI_PATTERN = /※[［\[]＃「([^」]+)」、U\+([0-9A-Fa-f]{4,6})(?:、[^］\]]+)?[］\]]/gu;

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

export function replaceAozoraGaijiNotation(text) {
  return String(text ?? '')
    .replace(JIS_X_0213_GAIJI_PATTERN, (fullMatch, _description, _level, plane, row, cell) => {
      const key = `${plane}-${row}-${cell}`;
      return AOZORA_GAIJI_MAP[key] ?? fullMatch;
    })
    .replace(JIS_X_0213_SYMBOL_PATTERN, (fullMatch, _description, plane, row, cell) => {
      const key = `${plane}-${row}-${cell}`;
      return AOZORA_GAIJI_MAP[key] ?? fullMatch;
    })
    .replace(UNICODE_GAIJI_PATTERN, (fullMatch, _description, hex) => {
    return codePointFromHex(hex) ?? fullMatch;
    });
}
