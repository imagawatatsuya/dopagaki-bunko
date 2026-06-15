const TARGET_MIN = 60;
const TARGET_MAX = 160;
const HARD_MAX = 220;
const LEADING_PUNCTUATION_PATTERN = /^[、。，．・：；？！）」』】]/u;
const ESTIMATED_LINE_CAPACITY = 26;
const INDEX_LABEL_RESERVE = 2;

function normalizeWhitespace(text) {
  return String(text)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '');
}

function splitMarkupSegments(text) {
  return text.match(
    /<ruby[\s\S]*?<\/ruby>[ぁ-ゖァ-ヶー]*|<span[\s\S]*?<\/span>[ぁ-ゖァ-ヶー]*|<br>|[^<]+/gu
  ) ?? [];
}

function splitPlainTextSegment(text) {
  return text.match(/[^、。，．？！!?\n]+[、。，．？！!?]?|[、。，．？！!?]+|\n+/gu) ?? [];
}

function splitIntoSafeUnits(text) {
  const segments = splitMarkupSegments(text);
  const units = [];

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    if (segment === '<br>' || segment.startsWith('<ruby') || segment.startsWith('<span')) {
      units.push(segment);
      continue;
    }

    units.push(...splitPlainTextSegment(segment));
  }

  return units.filter(Boolean);
}

function visibleLength(html) {
  return html
    .replace(/<rt>[\s\S]*?<\/rt>/gu, '')
    .replace(/<[^>]+>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .length;
}

function estimateLastLineLength(html) {
  const normalized = html
    .replace(/<rt>[\s\S]*?<\/rt>/gu, '')
    .replace(/<br>\s*$/gu, '')
    .replace(/<br>/gu, '\n')
    .replace(/<[^>]+>/gu, '');
  const lines = normalized.split('\n');
  const lastLine = lines.at(-1) ?? '';
  const length = lastLine.replace(/\s+/gu, ' ').trim().length;

  if (length === 0) {
    return 0;
  }

  const wrapped = length % ESTIMATED_LINE_CAPACITY;
  return wrapped === 0 ? ESTIMATED_LINE_CAPACITY : wrapped;
}

export function estimateFragmentOverlayRisk(html) {
  const lastLineLength = estimateLastLineLength(String(html ?? ''));
  return lastLineLength >= ESTIMATED_LINE_CAPACITY - 4;
}

function scoreBreakpoint(unit) {
  if (unit.includes('<br>')) {
    return 5;
  }

  if (/[。！？!?]\s*$/u.test(unit)) {
    return 4;
  }

  if (/[」』）)\]]\s*$/u.test(unit)) {
    return 3;
  }

  if (/[、，,]\s*$/u.test(unit)) {
    return 2;
  }

  return 1;
}

function collectCandidates(units) {
  const candidates = [];

  for (let index = 0; index < units.length; index += 1) {
    const joined = units.slice(0, index + 1).join('');
    const length = visibleLength(joined);

    if (length > HARD_MAX) {
      break;
    }

    candidates.push({
      index,
      length,
      breakpointScore: scoreBreakpoint(units[index]),
      lastLineLength: estimateLastLineLength(joined)
    });
  }

  return candidates;
}

function pickBestByLength(candidates, minimumScore = 1) {
  const filtered = candidates.filter((candidate) => candidate.breakpointScore >= minimumScore);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((best, current) => {
    if (!best) {
      return current;
    }

    const currentHasRoom = current.lastLineLength <= ESTIMATED_LINE_CAPACITY - INDEX_LABEL_RESERVE;
    const bestHasRoom = best.lastLineLength <= ESTIMATED_LINE_CAPACITY - INDEX_LABEL_RESERVE;
    if (currentHasRoom !== bestHasRoom) {
      return currentHasRoom ? current : best;
    }

    const currentDistance = Math.abs(TARGET_MAX - current.length);
    const bestDistance = Math.abs(TARGET_MAX - best.length);

    if (currentDistance < bestDistance) {
      return current;
    }

    if (currentDistance === bestDistance && current.length > best.length) {
      return current;
    }

    return best;
  }, null);
}

function pickBreakpoint(units) {
  const candidates = collectCandidates(units);
  const inTargetRange = candidates.filter((candidate) => {
    return candidate.length >= TARGET_MIN && candidate.length <= TARGET_MAX;
  });

  const preferredSentenceBreak = pickBestByLength(inTargetRange, 4);
  if (preferredSentenceBreak) {
    return preferredSentenceBreak.index;
  }

  const preferredLineOrClauseBreak = pickBestByLength(inTargetRange, 2);
  if (preferredLineOrClauseBreak) {
    return preferredLineOrClauseBreak.index;
  }

  const oversizedSentenceBreak = pickBestByLength(
    candidates.filter((candidate) => candidate.length >= TARGET_MIN),
    4
  );
  if (oversizedSentenceBreak) {
    return oversizedSentenceBreak.index;
  }

  const fallbackBreak = pickBestByLength(
    candidates.filter((candidate) => candidate.length >= TARGET_MIN),
    1
  );
  if (fallbackBreak) {
    return fallbackBreak.index;
  }

  return Math.max(0, candidates.length - 1);
}

function rebalanceLeadingPunctuation(textFragments) {
  for (let index = 1; index < textFragments.length; index += 1) {
    while (textFragments[index].displayHtml.startsWith('<br>')) {
      textFragments[index - 1].displayHtml += '<br>';
      textFragments[index].displayHtml = textFragments[index].displayHtml.slice(4);
    }

    while (LEADING_PUNCTUATION_PATTERN.test(textFragments[index].displayHtml)) {
      const punctuation = textFragments[index].displayHtml[0];
      textFragments[index - 1].displayHtml += punctuation;
      textFragments[index].displayHtml = textFragments[index].displayHtml
        .slice(1)
        .replace(/^[\t \n\r]+/u, '');
    }
  }

  return textFragments.filter((fragment) => fragment.displayHtml);
}

function splitTextBlock(block) {
  const trimmedBlock = String(block).replace(/^(?:<br>[\t \n\r]*)+|(?:[\t \n\r]*<br>)+$/gu, '');
  const units = splitIntoSafeUnits(trimmedBlock);
  const fragments = [];
  let startIndex = 0;

  while (startIndex < units.length) {
    const remaining = units.slice(startIndex);
    const breakpoint = pickBreakpoint(remaining);
    const fragmentUnits = remaining.slice(0, breakpoint + 1);
    const fragmentHtml = fragmentUnits.join('');

    if (fragmentHtml) {
      fragments.push({
        type: 'fragment',
        displayHtml: fragmentHtml
      });
    }

    startIndex += fragmentUnits.length;
  }

  return rebalanceLeadingPunctuation(fragments);
}

function trimBoundaryBreaks(fragments) {
  let startIndex = 0;
  let endIndex = fragments.length;

  while (startIndex < endIndex && fragments[startIndex].type === 'break') {
    startIndex += 1;
  }

  while (endIndex > startIndex && fragments[endIndex - 1].type === 'break') {
    endIndex -= 1;
  }

  return fragments.slice(startIndex, endIndex);
}

export function fragmentText(htmlText) {
  const normalized = normalizeWhitespace(htmlText);
  if (!normalized) {
    return [];
  }

  const blockParts = normalized.split(/((?:<br>\s*){2,})/gu);
  const fragments = [];

  for (const part of blockParts) {
    if (!part) {
      continue;
    }

    if (/^(?:<br>\s*){2,}$/u.test(part)) {
      fragments.push({
        type: 'break',
        breakCount: (part.match(/<br>/gu) ?? []).length
      });
      continue;
    }

    fragments.push(...splitTextBlock(part));
  }

  return trimBoundaryBreaks(fragments);
}
