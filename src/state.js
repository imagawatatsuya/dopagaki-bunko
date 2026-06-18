export function sortSavedRecords(records) {
  return [...records].sort((left, right) => {
    const timeCompare = String(right.savedAt ?? '').localeCompare(String(left.savedAt ?? ''));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

export function sortUpdatedRecords(records) {
  return [...records].sort((left, right) => {
    const timeCompare = String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

export function normalizeReadingStatus(status) {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'reading') {
    return 'reading';
  }
  return 'unread';
}

export function getReadingStateForWork(readingStateRecords, workId) {
  return readingStateRecords.find((item) => item.workId === workId) ?? null;
}

export function deriveWorkReadingStatus({ workId, readingStateRecords, bookmarkRecords }) {
  const readingState = getReadingStateForWork(readingStateRecords, workId);
  if (readingState) {
    const normalized = normalizeReadingStatus(readingState.status);
    if (normalized !== 'unread') {
      return normalized;
    }
  }

  return getBookmarkForWork(bookmarkRecords, workId) ? 'reading' : 'unread';
}

export function sortWorksForLibrary(works) {
  return [...works].sort((left, right) => {
    const createdCompare = String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''));
    if (createdCompare !== 0) {
      return createdCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

export function savedCollectionLabel(kind) {
  switch (kind) {
    case 'bookmarks':
      return 'しおり';
    case 'likes':
      return 'ふせん';
    default:
      return '保存';
  }
}

export function summarizeFragmentText(text, maxLength = 96) {
  const normalized = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

export function getFirstReadableFragmentForWork(fragments, workId) {
  return fragments.find((fragment) => {
    return fragment.workId === workId && fragment.type !== 'break';
  }) ?? null;
}

export function getFragmentById(fragments, fragmentId) {
  return fragments.find((item) => item.id === fragmentId) ?? null;
}

export function getBookmarkForWork(bookmarkRecords, workId) {
  return bookmarkRecords.find((item) => item.workId === workId) ?? null;
}

export function getLikeRecordsForWork(likeRecords, fragments, workId) {
  if (!workId) {
    return [];
  }

  return likeRecords.filter((record) => {
    const fragment = getFragmentById(fragments, record.fragmentId);
    return fragment?.workId === workId;
  });
}

export function normalizeBookmarkRecord(record, fragments) {
  const fragment = getFragmentById(fragments, record?.fragmentId ?? record?.id);
  if (!fragment) {
    return null;
  }

  const savedAt = String(record?.savedAt ?? record?.createdAt ?? '');
  return {
    id: fragment.workId,
    workId: fragment.workId,
    fragmentId: fragment.id,
    fragmentIndex: fragment.index ?? null,
    savedAt: savedAt || new Date(0).toISOString()
  };
}

export function canonicalizeBookmarkRecords(records, fragments) {
  const latestByWork = new Map();

  records.forEach((record) => {
    const normalized = normalizeBookmarkRecord(record, fragments);
    if (!normalized) {
      return;
    }

    const current = latestByWork.get(normalized.workId);
    if (!current || String(normalized.savedAt).localeCompare(String(current.savedAt)) >= 0) {
      latestByWork.set(normalized.workId, normalized);
    }
  });

  return sortSavedRecords([...latestByWork.values()]);
}

export function sameBookmarkRecords(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((record, index) => {
    const other = right[index];
    return record.id === other.id
      && record.workId === other.workId
      && record.fragmentId === other.fragmentId
      && record.fragmentIndex === other.fragmentIndex
      && String(record.savedAt ?? '') === String(other.savedAt ?? '');
  });
}

export function buildHomeTimelineEvents({ works, fragments, bookmarkRecords, likeRecords, findWorkById }) {
  const workEvents = works
    .map((work) => {
      const fragment = getFirstReadableFragmentForWork(fragments, work.id);
      if (!fragment || !work.createdAt) {
        return null;
      }

      return {
        id: `work:${work.id}:${work.createdAt}`,
        fragment,
        workTitle: work.title,
        metaLabel: `作品追加 / 断片 ${fragment.index}`,
        occurredAt: work.createdAt
      };
    })
    .filter(Boolean);

  const bookmarkEvents = bookmarkRecords
    .map((record) => {
      const fragment = getFragmentById(fragments, record.fragmentId);
      if (!fragment || !record.savedAt) {
        return null;
      }

      return {
        id: `bookmark:${record.fragmentId}:${record.savedAt}`,
        fragment,
        workTitle: findWorkById(fragment.workId)?.title ?? '無題',
        metaLabel: `最新しおり / 断片 ${fragment.index}`,
        occurredAt: record.savedAt
      };
    })
    .filter(Boolean);

  const likeEvents = likeRecords
    .map((record) => {
      const fragment = getFragmentById(fragments, record.fragmentId);
      if (!fragment || !record.savedAt) {
        return null;
      }

      return {
        id: `like:${record.fragmentId}:${record.savedAt}`,
        fragment,
        workTitle: findWorkById(fragment.workId)?.title ?? '無題',
        metaLabel: `ふせん追加 / 断片 ${fragment.index}`,
        occurredAt: record.savedAt
      };
    })
    .filter(Boolean);

  return [...workEvents, ...bookmarkEvents, ...likeEvents].sort((left, right) => {
    const timeCompare = String(right.occurredAt).localeCompare(String(left.occurredAt));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

export function buildSavedItems({ kind, bookmarkRecords, likeRecords, fragments, findWorkById }) {
  const records = kind === 'bookmarks'
    ? bookmarkRecords
    : kind === 'likes'
      ? likeRecords
      : [];

  return records.map((record) => {
    const fragment = getFragmentById(fragments, record.fragmentId);
    const work = findWorkById(record.workId ?? fragment?.workId) ?? null;
    const plainText = record.plainText ?? fragment?.plainText ?? '';
    const fragmentIndex = fragment?.index ?? record.fragmentIndex ?? null;
    const note = typeof record.note === 'string' ? record.note.trim() : '';

    return {
      record,
      fragment,
      work,
      fragmentIndex,
      excerpt: summarizeFragmentText(plainText),
      note
    };
  });
}

export function buildLibraryWorksByStatus({ works, bookmarkRecords, readingStateRecords }) {
  const grouped = {
    reading: [],
    unread: [],
    completed: []
  };

  sortWorksForLibrary(works).forEach((work) => {
    const status = deriveWorkReadingStatus({
      workId: work.id,
      readingStateRecords,
      bookmarkRecords
    });
    grouped[status].push(work);
  });

  return grouped;
}

export function fragmentSequenceOf(fragment) {
  if (Number.isFinite(fragment?.sequence)) {
    return fragment.sequence;
  }

  const suffix = String(fragment?.id ?? '').match(/-(\d{4,})$/u);
  if (suffix) {
    return Number(suffix[1]);
  }

  return Number.isFinite(fragment?.index) ? fragment.index : 0;
}

export function sortFragments(records) {
  return [...records].sort((left, right) => {
    const workCompare = String(left.workId ?? '').localeCompare(String(right.workId ?? ''));
    if (workCompare !== 0) {
      return workCompare;
    }

    const sequenceCompare = fragmentSequenceOf(left) - fragmentSequenceOf(right);
    if (sequenceCompare !== 0) {
      return sequenceCompare;
    }

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

export function normalizeHeadingBreakKinds(records) {
  const sorted = sortFragments(records);

  return sorted.map((record, index) => {
    if (record?.type !== 'break' || record?.breakKind) {
      return record;
    }

    const previous = sorted[index - 1];
    if (
      previous?.type === 'fragment' &&
      typeof previous.displayHtml === 'string' &&
      previous.displayHtml.includes('class="aozora-heading ')
    ) {
      return {
        ...record,
        breakKind: 'heading'
      };
    }

    return record;
  });
}

export function getReadableFragments(fragments) {
  return fragments.filter((fragment) => fragment.type !== 'break');
}

export function countWorkTextFragments(fragments, workId) {
  return fragments.filter((fragment) => fragment.workId === workId && fragment.type !== 'break').length;
}

export function getReadableWorkFragments(fragments, workId) {
  return fragments.filter((fragment) => fragment.workId === workId && fragment.type !== 'break');
}

export function getVisibleCountParam(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function sliceWorkFragmentsForVisibleCount(fragments, workId, visibleTextCount) {
  const workFragments = fragments.filter((fragment) => fragment.workId === workId);
  const limited = [];
  let textCount = 0;

  for (const fragment of workFragments) {
    if (fragment.type === 'break') {
      if (limited.length > 0) {
        limited.push(fragment);
      }
      continue;
    }

    if (textCount >= visibleTextCount) {
      break;
    }

    limited.push(fragment);
    textCount += 1;
  }

  while (limited.at(-1)?.type === 'break') {
    limited.pop();
  }

  return {
    fragments: limited,
    shownTextCount: textCount
  };
}
