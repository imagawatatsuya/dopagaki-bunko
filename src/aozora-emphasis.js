import { replaceAozoraGaijiNotation } from './aozora-gaiji.js?v=20260617052406';
import { convertAozoraRubyToHtml } from './aozora-ruby.js?v=20260617052406';

function emphasisStyleFromNote(note) {
  if (note.includes('白丸傍点')) {
    return 'open circle';
  }

  if (note.includes('丸傍点') || note.includes('圏点') || note === '傍点') {
    return 'filled dot';
  }

  if (note.includes('白ゴマ傍点')) {
    return 'open sesame';
  }

  if (note.includes('ゴマ傍点')) {
    return 'filled sesame';
  }

  if (note.includes('白三角傍点')) {
    return 'open triangle';
  }

  if (note.includes('黒三角傍点') || note.includes('三角傍点')) {
    return 'filled triangle';
  }

  return null;
}

function lineStyleFromNote(note) {
  if (note.includes('二重傍線')) {
    return 'text-decoration-line: underline; text-decoration-style: double; text-decoration-thickness: 0.08em; text-underline-offset: 0.14em;';
  }

  if (note.includes('鎖線')) {
    return 'text-decoration-line: underline; text-decoration-style: dashed; text-decoration-thickness: 0.08em; text-underline-offset: 0.14em;';
  }

  if (note.includes('破線')) {
    return 'text-decoration-line: underline; text-decoration-style: dashed; text-decoration-thickness: 0.08em; text-underline-offset: 0.14em;';
  }

  if (note.includes('波線')) {
    return 'text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 0.08em; text-underline-offset: 0.14em;';
  }

  if (note.includes('傍線')) {
    return 'text-decoration-line: underline; text-decoration-style: solid; text-decoration-thickness: 0.08em; text-underline-offset: 0.14em;';
  }

  return null;
}

function emphasisSpecFromNote(note) {
  const emphasisStyle = emphasisStyleFromNote(note);
  if (emphasisStyle) {
    return {
      className: 'emphasis-dot',
      inlineStyle: `text-emphasis: ${emphasisStyle}; -webkit-text-emphasis: ${emphasisStyle};`
    };
  }

  const lineStyle = lineStyleFromNote(note);
  if (lineStyle) {
    return {
      className: 'emphasis-line',
      inlineStyle: lineStyle
    };
  }

  return null;
}

function inlineLayoutSpecFromNote(note) {
  if (note.includes('横組み')) {
    return {
      className: 'aozora-inline-horizontal',
      inlineStyle: 'writing-mode: horizontal-tb; text-orientation: mixed; display: inline-block;'
    };
  }

  if (note.includes('割り注')) {
    return {
      className: 'aozora-inline-warichu',
      inlineStyle: 'display: inline-block; font-size: 0.72em; line-height: 1.35; vertical-align: text-top;'
    };
  }

  return null;
}

function noteSpecFromNote(note) {
  return emphasisSpecFromNote(note) ?? inlineLayoutSpecFromNote(note);
}

function wrapWithNoteSpec(contentHtml, spec) {
  return `<span class="${spec.className}" style="${spec.inlineStyle}">${contentHtml}</span>`;
}

function convertWithRenderer(text, renderChunk) {
  const source = replaceAozoraGaijiNotation(String(text ?? ''));
  const notePattern = /[［\[]＃([^］\]]+)[］\]]/gu;
  let output = '';
  let lastIndex = 0;
  const openStack = [];

  for (const match of source.matchAll(notePattern)) {
    const fullMatch = match[0];
    const noteText = String(match[1] ?? '').trim();
    const matchIndex = match.index ?? 0;
    const before = source.slice(lastIndex, matchIndex);
    const adjacentMatch = noteText.match(/^「([^」]+)」に(.+)$/u);

    if (adjacentMatch) {
      const target = adjacentMatch[1];
      const spec = noteSpecFromNote(adjacentMatch[2].trim());
      if (spec && before.endsWith(target)) {
        output += renderChunk(before.slice(0, -target.length));
        output += wrapWithNoteSpec(renderChunk(target), spec);
      } else {
        output += renderChunk(before);
        output += renderChunk(fullMatch);
      }
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    if (noteText.endsWith('終わり')) {
      output += renderChunk(before);
      if (openStack.length > 0) {
        openStack.pop();
        output += '</span>';
      } else {
        output += renderChunk(fullMatch);
      }
      lastIndex = matchIndex + fullMatch.length;
      continue;
    }

    const spec = noteSpecFromNote(noteText);
    output += renderChunk(before);
    if (spec) {
      openStack.push(spec);
      output += `<span class="${spec.className}" style="${spec.inlineStyle}">`;
    } else {
      output += renderChunk(fullMatch);
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  output += renderChunk(source.slice(lastIndex));

  while (openStack.length > 0) {
    openStack.pop();
    output += '</span>';
  }

  return output;
}

export function convertAozoraEmphasisToHtml(text) {
  return convertWithRenderer(text, (chunk) => String(chunk));
}

export function convertAozoraRubyAndEmphasisToHtml(text) {
  return convertWithRenderer(text, (chunk) => convertAozoraRubyToHtml(chunk));
}
