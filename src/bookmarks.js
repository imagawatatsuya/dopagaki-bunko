import { deleteRecord, getAllRecords, putRecord } from './db.js?v=20260622081351';

const STORE_NAME = 'bookmarks';

export function listBookmarks() {
  return getAllRecords(STORE_NAME);
}

export function saveBookmark(fragment) {
  if (!fragment?.workId || !fragment?.id) {
    throw new Error('saveBookmark requires a fragment with workId and id.');
  }

  return putRecord(STORE_NAME, {
    id: fragment.workId,
    workId: fragment.workId,
    fragmentId: fragment.id,
    fragmentIndex: fragment.index ?? null,
    savedAt: new Date().toISOString()
  });
}

export function removeBookmark(workId) {
  return deleteRecord(STORE_NAME, workId);
}
