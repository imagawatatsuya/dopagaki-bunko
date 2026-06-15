const AOZORA_NOTE_PATTERN = /[［\[]＃[^］\]\n\r]+[］\]]/gu;

function normalizeNewlines(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function stripHeader(text) {
  const lines = text.split('\n');
  let startIndex = 0;

  while (startIndex < lines.length) {
    const trimmed = lines[startIndex].trim();
    if (!trimmed) {
      startIndex += 1;
      continue;
    }

    if (
      trimmed.startsWith('-----') ||
      trimmed.startsWith('［＃') ||
      trimmed.startsWith('[＃') ||
      trimmed.startsWith('【テキスト中に現れる記号について】')
    ) {
      startIndex += 1;
      continue;
    }

    break;
  }

  return lines.slice(startIndex).join('\n');
}

function stripGuideSection(text) {
  return text.replace(
    /【テキスト中に現れる記号について】[\s\S]*?-------------------------------------------------------/u,
    ''
  );
}

function stripAnnotationOnlyLines(text) {
  return text
    .split('\n')
    .map((line) => {
      const withoutNotes = line.replace(AOZORA_NOTE_PATTERN, '');
      const withoutDecorations = withoutNotes.replace(/[-―—─－\s　]+/gu, '');
      return withoutDecorations ? line : '';
    })
    .join('\n');
}

function stripFooter(text) {
  const footerPatterns = [
    /\n底本：[\s\S]*$/u,
    /\n入力：[\s\S]*$/u,
    /\n校正：[\s\S]*$/u,
    /\n公開日：[\s\S]*$/u,
    /\n青空文庫作成ファイル：[\s\S]*$/u
  ];

  return footerPatterns.reduce((current, pattern) => current.replace(pattern, ''), text);
}

function trimExtraSpace(text) {
  return text
    .replace(/^[\-―─＝_]{5,}\n/gu, '')
    .replace(/\n[\-―─＝_]{5,}\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '');
}

export function cleanAozoraText(text, options = {}) {
  const normalized = normalizeNewlines(text);
  const withoutGuide = stripGuideSection(normalized);
  const withoutHeader = stripHeader(withoutGuide);
  const withoutFooter = stripFooter(withoutHeader);
  const withoutAnnotationOnlyLines = options.preserveAnnotationOnlyLines
    ? withoutFooter
    : stripAnnotationOnlyLines(withoutFooter);
  return trimExtraSpace(withoutAnnotationOnlyLines);
}
