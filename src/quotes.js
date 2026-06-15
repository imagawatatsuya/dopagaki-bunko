import { deleteRecord, getAllRecords, putRecord } from './db.js?v=20260616052324';

const STORE_NAME = 'quotes';

export function listQuotes() {
  return getAllRecords(STORE_NAME);
}

export function saveQuote(fragment, work) {
  return putRecord(STORE_NAME, {
    id: fragment.id,
    fragmentId: fragment.id,
    workId: fragment.workId,
    workTitle: work?.title ?? '',
    author: work?.author ?? '',
    plainText: fragment.plainText,
    displayHtml: fragment.displayHtml,
    savedAt: new Date().toISOString()
  });
}

export function removeQuote(fragmentId) {
  return deleteRecord(STORE_NAME, fragmentId);
}
