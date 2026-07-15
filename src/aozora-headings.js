import { convertAozoraRubyAndEmphasisToHtml } from './aozora-emphasis.js?v=20260715222616';

const AOZORA_NUMBER_PATTERN = '[0-9０-９]+';
const HEADING_INLINE_PATTERN = /^(.*?)[［\[]＃「([^」]+)」は([^］\]]*見出し)[］\]]\s*$/u;
const HEADING_NOTE_ONLY_PATTERN = /^[［\[]＃「([^」]+)」は([^］\]]*見出し)[］\]]\s*$/u;
const WRAPPED_HEADING_PATTERN = /^[［\[]＃((?:大|中|小)見出し)[］\]]\s*(.*?)\s*[［\[]＃\1終わり[］\]]\s*$/u;
const START_INDENT_PATTERN = new RegExp(`^[［\\[]＃ここから(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*$`, 'u');
const END_INDENT_PATTERN = /^[［\[]＃ここで字下げ終わり[］\]]\s*$/u;
const SINGLE_INDENT_NOTE_PATTERN = new RegExp(`^[［\\[]＃(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*$`, 'u');
const LEADING_INDENT_PATTERN = new RegExp(`^(?:[［\\[]＃(?:ここから)?(${AOZORA_NUMBER_PATTERN})字下げ[］\\]]\\s*)+`, 'u');
const NOTE_ONLY_LINE_PATTERN = /^(?:[［\[]＃[^］\]]+[］\]]\s*)+$/u;
const LEADING_NOTE_TOKEN_PATTERN = /^[［\[]＃([^］\]]+)[］\]]\s*/u;
const BOTTOM_ATTACH_NOTE_PATTERN = new RegExp(`^地から(${AOZORA_NUMBER_PATTERN})字(上げ|下げ)$`, 'u');
const PAGE_BREAK_NOTE_PATTERN = /[［\[]＃(?:改ページ|改丁)[］\]]/u;
const NOTE_TOKEN_PATTERN = /[［\[]＃([^］\]]+)[］\]]/gu;

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

function parseLeadingLayoutNotes(line) {
  let rest = String(line);
  let indentCount = null;
  let bottomMode = '';
  let bottomOffsetCount = null;
  let bottomOffsetDirection = '';
  let matched = false;

  while (true) {
    const match = rest.match(LEADING_NOTE_TOKEN_PATTERN);
    if (!match) {
      break;
    }

    const noteText = normalizeAozoraDigits(match[1].trim());
    const singleIndentMatch = noteText.match(/^(\d+)字下げ$/u);
    const bottomAttachMatch = noteText.match(BOTTOM_ATTACH_NOTE_PATTERN);

    if (singleIndentMatch) {
      indentCount = Number.parseInt(singleIndentMatch[1], 10);
      matched = true;
      rest = rest.slice(match[0].length);
      continue;
    }

    if (noteText === '地付き') {
      bottomMode = 'bottom';
      matched = true;
      rest = rest.slice(match[0].length);
      continue;
    }

    if (bottomAttachMatch) {
      bottomMode = 'bottom-offset';
      bottomOffsetCount = Number.parseInt(bottomAttachMatch[1], 10);
      bottomOffsetDirection = bottomAttachMatch[2];
      matched = true;
      rest = rest.slice(match[0].length);
      continue;
    }

    break;
  }

  return {
    text: rest,
    matched,
    indentCount,
    bottomMode,
    bottomOffsetCount,
    bottomOffsetDirection
  };
}

function buildHeadingHtml(titleHtml, headingId, level, indentStep) {
  return `<span class="aozora-heading aozora-heading-level-${level} aozora-heading-indent-${indentStep}" data-heading-id="${headingId}" data-outline-level="${level}">${titleHtml}</span>`;
}

function buildLayoutLineHtml(textHtml, layout) {
  const classNames = ['aozora-layout-line'];
  const indentStep = normalizeIndentStep(layout.indentCount);
  if (indentStep > 0) {
    classNames.push(`aozora-layout-indent-${indentStep}`);
  }
  if (layout.bottomMode) {
    classNames.push('aozora-layout-bottom');
  }
  if (layout.bottomMode === 'bottom-offset') {
    classNames.push(
      layout.bottomOffsetDirection === '下げ'
        ? 'aozora-layout-bottom-lowered'
        : 'aozora-layout-bottom-raised'
    );
  }

  return `<span class="${classNames.join(' ')}">${textHtml}</span>`;
}

function buildDirectiveBreakHtml(label) {
  return `<span class="aozora-directive-break">${label}</span>`;
}

function directiveLabelFromNote(noteText) {
  const note = normalizeAozoraDigits(String(noteText).trim());
  if (!note) {
    return '';
  }

  if (note === '改ページ' || note === '改丁') {
    return '改ページ';
  }
  if (note === 'ページの左右中央') {
    return '中央寄せ';
  }
  if (note === '地付き') {
    return '地付き';
  }
  if (BOTTOM_ATTACH_NOTE_PATTERN.test(note)) {
    return note;
  }
  if (/^\d+字下げ$/u.test(note) || /^ここから\d+字下げ$/u.test(note) || note === 'ここで字下げ終わり') {
    return note;
  }
  if (note.includes('横組み')) {
    return '横組み指定';
  }
  if (note.includes('割り注')) {
    return '割り注';
  }
  if (note.includes('罫囲み')) {
    return '罫囲み';
  }
  if (note.includes('窓見出し')) {
    return '窓見出し';
  }

  return note;
}

function renderDirectiveOnlyLineHtml(line) {
  const labels = [...String(line).matchAll(NOTE_TOKEN_PATTERN)]
    .map((match) => directiveLabelFromNote(match[1] ?? ''))
    .filter(Boolean);

  if (labels.length === 0) {
    return '';
  }

  return labels.map((label) => buildDirectiveBreakHtml(label)).join('');
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
  pushBreak(segments);
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

function markHeadingBoundaryBreaks(fragments) {
  return fragments.map((fragment, index, items) => {
    if (fragment.type !== 'break') {
      return fragment;
    }

    const previous = items[index - 1];
    if (
      previous?.type === 'fragment' &&
      typeof previous.displayHtml === 'string' &&
      previous.displayHtml.includes('class="aozora-heading ')
    ) {
      return {
        ...fragment,
        breakKind: 'heading'
      };
    }

    return fragment;
  });
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
    const layoutNotes = parseLeadingLayoutNotes(originalLine);
    const lineForHeading = inlineIndentCount === null ? layoutNotes.text : lineWithoutLeadingIndent;
    const effectiveIndentCount = inlineIndentCount ?? layoutNotes.indentCount ?? activeIndentCount;
    const trimmedLineForHeading = lineForHeading.trim();
    const inlineHeadingMatch = trimmedLineForHeading.match(HEADING_INLINE_PATTERN);

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

    const wrappedHeadingMatch = trimmedLineForHeading.match(WRAPPED_HEADING_PATTERN);
    if (wrappedHeadingMatch && wrappedHeadingMatch[2].trim()) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      appendHeadingSegment(
        segments,
        outline,
        wrappedHeadingMatch[2],
        wrappedHeadingMatch[1],
        effectiveIndentCount,
        renderHeadingText
      );
      continue;
    }

    const nextTrimmed = String(lines[index + 1] ?? '').trim();
    const headingNoteOnlyMatch = nextTrimmed.match(HEADING_NOTE_ONLY_PATTERN);
    if (headingNoteOnlyMatch && trimmedLineForHeading) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      appendHeadingSegment(
        segments,
        outline,
        trimmedLineForHeading,
        headingNoteOnlyMatch[2],
        effectiveIndentCount,
        renderHeadingText
      );
      index += 1;
      continue;
    }

    if (NOTE_ONLY_LINE_PATTERN.test(trimmed)) {
      const directiveHtml = renderDirectiveOnlyLineHtml(trimmed);
      if (directiveHtml) {
        flushTextBuffer(textBuffer, segments, renderTextBlock);
        pushBreak(segments);
        segments.push({
          type: 'html',
          html: directiveHtml
        });
        pushBreak(segments);
      }
      continue;
    }

    if (layoutNotes.matched && lineForHeading.trim()) {
      flushTextBuffer(textBuffer, segments, renderTextBlock);
      segments.push({
        type: 'html',
        html: buildLayoutLineHtml(renderTextBlock(lineForHeading), {
          indentCount: effectiveIndentCount,
          bottomMode: layoutNotes.bottomMode,
          bottomOffsetCount: layoutNotes.bottomOffsetCount,
          bottomOffsetDirection: layoutNotes.bottomOffsetDirection
        })
      });
      continue;
    }

    textBuffer.push(lineForHeading);
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

  const fragments = markHeadingBoundaryBreaks(fragmentText(rendered.html));
  return {
    html: rendered.html,
    fragments,
    outline: rendered.outline
  };
}

export function repairAozoraHeadingNotesInHtml(htmlText) {
  const source = String(htmlText ?? '');
  if (
    !source.includes('［＃') ||
    (
      !source.includes('見出し') &&
      !/［＃(?:地付き|地から[0-9０-９]+字[上下]げ|[0-9０-９]+字下げ|改ページ|改丁)］/u.test(source)
    )
  ) {
    return source;
  }

  const rendered = renderAozoraLinesWithHeadings(
    source.replace(/<br\s*\/?>/gu, '\n').split('\n'),
    (text) => text.replace(/\n/gu, '<br>'),
    (text) => text
  );
  return rendered.html || source;
}

export function repairAozoraLayoutNotesInHtml(htmlText) {
  const source = String(htmlText ?? '');
  if (!source.includes('［＃') || source.includes('aozora-layout-line')) {
    return source;
  }

  const lines = source.replace(/<br\s*\/?>/gu, '\n').split('\n');
  const repaired = lines.map((line) => {
    const layout = parseLeadingLayoutNotes(line);
    if (!layout.matched || !layout.text.trim()) {
      return line;
    }

    return buildLayoutLineHtml(layout.text, layout);
  }).join('<br>');

  return repaired || source;
}
