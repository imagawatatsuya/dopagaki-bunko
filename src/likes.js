import { deleteRecord, getAllRecords, putRecord } from './db.js?v=20260629114223';

const STORE_NAME = 'likes';

export function listLikes() {
  return getAllRecords(STORE_NAME);
}

export function saveLike(fragmentId, options = {}) {
  return putRecord(STORE_NAME, {
    id: fragmentId,
    fragmentId,
    savedAt: options.savedAt ?? new Date().toISOString(),
    note: typeof options.note === 'string' ? options.note : ''
  });
}

export function removeLike(fragmentId) {
  return deleteRecord(STORE_NAME, fragmentId);
}
