import { deleteRecord, getAllRecords, putRecord } from './db.js?v=20260616044322';

const STORE_NAME = 'likes';

export function listLikes() {
  return getAllRecords(STORE_NAME);
}

export function saveLike(fragmentId) {
  return putRecord(STORE_NAME, {
    id: fragmentId,
    fragmentId,
    savedAt: new Date().toISOString()
  });
}

export function removeLike(fragmentId) {
  return deleteRecord(STORE_NAME, fragmentId);
}
