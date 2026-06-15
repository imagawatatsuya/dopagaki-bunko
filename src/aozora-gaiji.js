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
  return String(text ?? '').replace(UNICODE_GAIJI_PATTERN, (fullMatch, _description, hex) => {
    return codePointFromHex(hex) ?? fullMatch;
  });
}
