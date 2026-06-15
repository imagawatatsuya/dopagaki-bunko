import { convertAozoraRubyAndEmphasisToHtml } from './aozora-emphasis.js?v=20260616072713';

const AOZORA_NUMBER_PATTERN = '[0-9０-９]+';
const HEADING_INLINE_PATTERN = /^(.*?)[［\[]＃「([^」]+)」は([^］\]]*見出し)[］\]]\s*$/u;
const HEADING_NOTE_ONLY_PATTERN = /^[［\[]＃「([^」]+)」は([^］\]]*見出し)[］\]]\s*$/u;
const START_INDENT_PATTERN = new RegExp(`^[［\\[]＃ここから(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*$`, 'u');
const END_INDENT_PATTERN = /^[［\[]＃ここで字下げ終わり[］\]]\s*$/u;
const SINGLE_INDENT_NOTE_PATTERN = new RegExp(`^[［\\[]＃(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*$`, 'u');
const LEADING_INDENT_PATTERN = new RegExp(`^(?:[［\\[]＃(?:ここから)?(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*)+`, 'u');
const NOTE_ONLY_LINE_PATTERN = /^(?:[［\[]＃[^］\]]+[］\]]\s*)+$/u;

function normalizeAozoraDigits(text) {
  return String(text).replace(/[０-９]/gu, (digit) => {
    return String.fromCharCode(digit.charCodeAt(0) - 0xfee0);
  });
}

function parseAozoraInt(value) {
  const parsed = Number.parseInt(normalizeAozoraDigits(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function headingLevelFromNote(noteText) {
  if (noteText.includes('大見出し')) {
    return 1;
  }
  if (noteText.includes('中見出し')) {
    return 2;
  }
  if (noteText.includes('小見出し')) {
    return 3;
  }
  return 2;
}

function normalizeIndentStep(indentCount) {
  if (!Number.isFinite(indentCount) || indentCount < 3) {
    return 0;
  }
  if (indentCount >= 10) {
    return 2;
  }
  return 1;
}

function stripLeadingIndentNotes(line) {
  const match = String(line).match(LEADING_INDENT_PATTERN);
  if (!match) {
    return {
      text: String(line),
      indentCount: null
    };
  }

  const indentMatches = [...normalizeAozoraDigits(match[0]).matchAll(/(\d+)字下げ/gu)];
  const indentCount = indentMatches.length > 0
    ? Number.parseInt(indentMatches.at(-1)[1], 10)
    : null;

  return {
    text: String(line).slice(match[0].length),
    indentCount
  };
}

function buildHeadingHtml(titleHtml, headingId, level, indentStep) {
  return `<span class="aozora-heading aozora-heading-level-${level} aozora-heading-indent-${indentStep}" data-heading-id="${headingId}" data-outline-level="${level}">${titleHtml}</span>`;
}

function pushBreak(segments) {
  if (segments.at(-1)?.type === 'break') {
    return;
  }
  segments.push({ type: 'break' });
}

function flushTextBuffer(textBuffer, segments, renderTextBlock) {
  if (textBuffer.length === 0) {
    return;
  }

  segments.push({
    type: 'html',
    html: renderTextBlock(textBuffer.join('\n'))
  });
  textBuffer.length = 0;
}

function appendHeadingSegment(segments, outline, titleText, noteText, indentCount, renderHeadingText) {
  const level = headingLevelFromNote(noteText);
  const indentStep = normalizeIndentStep(indentCount);
  const headingId = `heading-${outline.length + 1}`;
  const titleHtml = renderHeadingText(titleText.trim());

  segments.push({
    type: 'html',
    html: buildHeadingHtml(titleHtml, headingId, level, indentStep)
  });
  outline.push({
    id: headingId,
    title: titleText.trim(),
    level,
    indentStep
  });
}

function joinSegments(segments) {
  let html = '';
  let pendingBreak = false;

  for (const segment of segments) {
    if (segment.type === 'break') {
      pendingBreak = true;
      continue;
    }

    if (!segment.html) {
      continue;
    }

    if (html) {
      html += pendingBreak ? '<br><br>' : '<br>';
    }

    html += segment.html;
    pendingBreak = false;
  }

  return html;
}

function renderAozoraLinesWithHeadings(lines, renderTextBlock, renderHeadingText) {
  const segments = [];
  const textBuffer = [];
  const outline = [];
  let activeIndentCount = null;

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index] ?? '';
    const trimmed = originalLine.trim();

    if (!trimmed) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      pushBreak(segments);
      continue;
    }

    const startIndentMatch = trimmed.match(START_INDENT_PATTERN);
    if (startIndentMatch) {
      activeIndentCount = parseAozoraInt(startIndentMatch[1]);
      continue;
    }

    if (END_INDENT_PATTERN.test(trimmed)) {
      activeIndentCount = null;
      continue;
    }

    const singleIndentMatch = trimmed.match(SINGLE_INDENT_NOTE_PATTERN);
    if (singleIndentMatch) {
      activeIndentCount = parseAozoraInt(singleIndentMatch[1]);
      continue;
    }

    const { text: lineWithoutLeadingIndent, indentCount: inlineIndentCount } = stripLeadingIndentNotes(originalLine);
    const effectiveIndentCount = inlineIndentCount ?? activeIndentCount;
    const inlineHeadingMatch = lineWithoutLeadingIndent.trim().match(HEADING_INLINE_PATTERN);

    if (inlineHeadingMatch) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      appendHeadingSegment(
        segments,
        outline,
        inlineHeadingMatch[2],
        inlineHeadingMatch[3],
        effectiveIndentCount,
        renderHeadingText
      );
      continue;
    }

    const nextTrimmed = String(lines[index + 1] ?? '').trim();
    const headingNoteOnlyMatch = nextTrimmed.match(HEADING_NOTE_ONLY_PATTERN);
    if (headingNoteOnlyMatch && lineWithoutLeadingIndent.trim()) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      appendHeadingSegment(
        segments,
        outline,
        lineWithoutLeadingIndent.trim(),
        headingNoteOnlyMatch[2],
        effectiveIndentCount,
        renderHeadingText
      );
      index += 1;
      continue;
    }

    if (NOTE_ONLY_LINE_PATTERN.test(trimmed)) {
      continue;
    }

    textBuffer.push(lineWithoutLeadingIndent);
  }

  flushTextBuffer(textBuffer, segments, renderTextBlock);

  return {
    html: joinSegments(segments),
    outline
  };
}

export function renderAozoraBodyWithHeadings(bodyText, fragmentText) {
  const rendered = renderAozoraLinesWithHeadings(
    String(bodyText ?? '').split('\n'),
    (text) => convertAozoraRubyAndEmphasisToHtml(text),
    (text) => convertAozoraRubyAndEmphasisToHtml(text)
  );

  const fragments = fragmentText(rendered.html);
  return {
    html: rendered.html,
    fragments,
    outline: rendered.outline
  };
}

export function repairAozoraHeadingNotesInHtml(htmlText) {
  const source = String(htmlText ?? '');
  if (!source.includes('見出し') || !source.includes('［＃') || source.includes('aozora-heading')) {
    return source;
  }

  const rendered = renderAozoraLinesWithHeadings(
    source.replace(/<br\s*\/?>/gu, '\n').split('\n'),
    (text) => text.replace(/\n/gu, '<br>'),
    (text) => text
  );
  return rendered.html || source;
}
