function defaultYieldControl() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function buildFragmentIndexes(
  fragments,
  {
    chunkSize = 300,
    yieldControl = defaultYieldControl
  } = {}
) {
  const workDrafts = new Map();
  const fragmentById = new Map();
  let processed = 0;

  for (const fragment of fragments ?? []) {
    if (!fragment?.workId) {
      continue;
    }
    let draft = workDrafts.get(fragment.workId);
    if (!draft) {
      draft = {
        records: [],
        offsets: [-1],
        textCount: 0
      };
      workDrafts.set(fragment.workId, draft);
    }

    const recordOffset = draft.records.length;
    draft.records.push(fragment);
    if (fragment.id) {
      fragmentById.set(fragment.id, fragment);
    }
    if (fragment.type !== 'break') {
      draft.textCount += 1;
      draft.offsets[draft.textCount] = recordOffset;
    }

    processed += 1;
    if (processed % Math.max(1, chunkSize) === 0) {
      await yieldControl();
    }
  }

  const workIndexes = new Map();
  for (const [workId, draft] of workDrafts) {
    const recordOffsetByTextIndex = new Int32Array(draft.textCount + 2);
    recordOffsetByTextIndex.fill(-1);
    draft.offsets.forEach((offset, index) => {
      if (index < recordOffsetByTextIndex.length) {
        recordOffsetByTextIndex[index] = offset;
      }
    });
    workIndexes.set(workId, {
      workId,
      records: draft.records,
      textCount: draft.textCount,
      recordOffsetByTextIndex
    });
  }

  return {
    workIndexes,
    fragmentById
  };
}

export function getIndexedTextFragment(workIndex, textIndex) {
  const index = Number.parseInt(String(textIndex ?? ''), 10);
  if (!workIndex || !Number.isFinite(index) || index < 1 || index > workIndex.textCount) {
    return null;
  }
  const recordOffset = workIndex.recordOffsetByTextIndex[index];
  return recordOffset >= 0 ? workIndex.records[recordOffset] ?? null : null;
}

export function sliceIndexedWorkFragments(workIndex, firstTextIndex, lastTextIndex) {
  if (!workIndex || workIndex.textCount < 1) {
    return {
      fragments: [],
      firstShownTextIndex: 1,
      shownTextCount: 0
    };
  }
  const first = Math.max(1, Math.min(workIndex.textCount, Number.parseInt(String(firstTextIndex), 10) || 1));
  const last = Math.max(first, Math.min(workIndex.textCount, Number.parseInt(String(lastTextIndex), 10) || first));
  const startOffset = workIndex.recordOffsetByTextIndex[first];
  const lastOffset = workIndex.recordOffsetByTextIndex[last];
  if (startOffset < 0 || lastOffset < startOffset) {
    return {
      fragments: [],
      firstShownTextIndex: first,
      shownTextCount: last
    };
  }

  return {
    fragments: workIndex.records.slice(startOffset, lastOffset + 1),
    firstShownTextIndex: first,
    shownTextCount: last
  };
}
