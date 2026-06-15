import { deleteRecord, getAllRecords, putRecord } from './db.js?v=20260615013000';

const STORE_NAME = 'bookmarks';

export function listBookmarks() {
  return getAllRecords(STORE_NAME);
}

export function saveBookmark(fragmentId) {
  return putRecord(STORE_NAME, {
    id: fragmentId,
    fragmentId,
    savedAt: new Date().toISOString()
  });
}

export function removeBookmark(fragmentId) {
  return deleteRecord(STORE_NAME, fragmentId);
}
