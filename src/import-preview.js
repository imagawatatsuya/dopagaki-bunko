import { cleanAozoraText } from './aozora-cleaner.js?v=20260617045446';
import { convertAozoraRubyAndEmphasisToHtml } from './aozora-emphasis.js?v=20260617045446';
import { renderAozoraBodyWithHeadings } from './aozora-headings.js?v=20260617045446';
import { fragmentText } from './fragmenter.js?v=20260617045446';

function stripInlineAozoraNotation(text) {
  return String(text)
    .replace(/｜/gu, '')
    .replace(/《[^》]+》/gu, '')
    .replace(/[［\[]＃[^］\]]+[］\]]/gu, '')
    .trim();
}

function preserveLeadingFullWidthIndent(html) {
  return String(html).replace(/(^|<br>)(　+)/gu, (_match, prefix, spaces) => {
    return `${prefix}<span class="line-indent">${spaces}</span>`;
  });
}

function trimForMetadata(text) {
  return String(text).replace(/^[\t \u00a0]+|[\t \u00a0]+$/gu, '');
}

function stripBodyDirectiveTokens(text) {
  return String(text)
    .replace(/[［\[]＃[^］\]]+[］\]]/gu, '')
    .replace(/[-―—─－]+/gu, '')
    .replace(/[\t \u00a0]/gu, '');
}

function isDirectiveOnlyLine(line) {
  return stripBodyDirectiveTokens(line) === '';
}

function hasReadableMetadataLine(line) {
  return trimForMetadata(line) && !isDirectiveOnlyLine(line);
}

function findBodyStartIndex(lines, authorLineIndex) {
  let index = Math.max(authorLineIndex + 1, 0);

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!trimForMetadata(line) || isDirectiveOnlyLine(line)) {
      index += 1;
      continue;
    }

    break;
  }

  return index;
}

function guessTitle(lines) {
  const candidate = lines.find((line) => hasReadableMetadataLine(line)) ?? '';
  return stripInlineAozoraNotation(candidate) || '無題';
}

function guessAuthor(lines) {
  const candidate = lines.slice(1, 6).find((line) => hasReadableMetadataLine(line)) ?? '';
  return stripInlineAozoraNotation(candidate) || '著者不明';
}

function extractSourceTitleLines(lines, bodyStartIndex) {
  return lines
    .slice(0, Math.max(bodyStartIndex, 0))
    .filter((line) => hasReadableMetadataLine(line))
    .map((line) => stripInlineAozoraNotation(line))
    .filter(Boolean)
    .slice(0, 2);
}

function buildOutlineWithFragmentIndex(outline, fragments) {
  return (outline ?? []).map((entry) => {
    const fragment = fragments.find((item) => {
      return item.type === 'fragment' && item.displayHtml.includes(`data-heading-id="${entry.id}"`);
    });

    return {
      ...entry,
      fragmentIndex: fragment?.index ?? null
    };
  });
}

export function derivePreviewFromText(rawText, encoding) {
  const cleanedText = cleanAozoraText(rawText, { preserveAnnotationOnlyLines: true });
  const lines = cleanedText.split('\n');
  const nonEmptyLines = lines.filter((line) => hasReadableMetadataLine(line));
  const title = guessTitle(lines);
  const author = guessAuthor(lines);
  const titleLineIndex = lines.findIndex((line) => hasReadableMetadataLine(line));
  const authorLineIndex = lines.findIndex((line, index) => {
    return index > titleLineIndex && hasReadableMetadataLine(line);
  });
  const bodyStartIndex = findBodyStartIndex(lines, authorLineIndex);
  const fallbackBodyText = nonEmptyLines.slice(Math.max(authorLineIndex, titleLineIndex) + 1).join('\n');
  const bodyText = lines.slice(bodyStartIndex).join('\n') || fallbackBodyText || cleanedText;
  const renderedBody = renderAozoraBodyWithHeadings(bodyText, fragmentText);
  const displayHtml = preserveLeadingFullWidthIndent(renderedBody.html || convertAozoraRubyAndEmphasisToHtml(bodyText));

  let fragmentIndex = 0;
  const fragments = [];

  for (const fragment of fragmentText(displayHtml)) {
    if (fragment.type === 'break') {
      if (fragments.length > 0) {
        fragments.push({
          type: 'break',
          breakCount: fragment.breakCount
        });
      }
      continue;
    }

    const plainText = fragment.displayHtml
      .replace(/<rt>[\s\S]*?<\/rt>/gu, '')
      .replace(/<[^>]+>/gu, '')
      .trim();

    if (!stripInlineAozoraNotation(plainText)) {
      continue;
    }

    fragmentIndex += 1;
    fragments.push({
      type: 'fragment',
      id: '',
      index: fragmentIndex,
      plainText,
      displayHtml: fragment.displayHtml
    });
  }

  while (fragments.at(-1)?.type === 'break') {
    fragments.pop();
  }

  return {
    title,
    author,
    sourceTitleLines: extractSourceTitleLines(lines, bodyStartIndex),
    encoding,
    fragments,
    outline: buildOutlineWithFragmentIndex(renderedBody.outline, fragments),
    textFragmentCount: fragmentIndex,
    cleanedText
  };
}
