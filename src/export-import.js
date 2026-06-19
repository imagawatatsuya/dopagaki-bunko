import { STORE_NAMES, clearStore, exportStores, putRecords } from './db.js?v=20260620050626';

export function createExportPayload(data) {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    data
  };
}

export function buildDownloadName(timestamp) {
  const compact = timestamp.replaceAll(':', '-').replaceAll('.', '-');
  return `dopagaki-bunko-export-${compact}.json`;
}

export async function buildExportJson() {
  const stores = await exportStores();
  const payload = createExportPayload(stores);
  return JSON.stringify(payload, null, 2);
}

export async function downloadExportJson() {
  const json = await buildExportJson();
  const exportedAt = new Date().toISOString();
  const blob = new Blob([json], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = buildDownloadName(exportedAt);
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);

  return {
    downloadName: anchor.download,
    exportedAt
  };
}

export function parseImportJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  const sourceData = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;

  if (!sourceData || typeof sourceData !== 'object') {
    throw new Error('JSON の形式が不正です。');
  }

  const stores = {};
  STORE_NAMES.forEach((storeName) => {
    const values = sourceData[storeName];
    stores[storeName] = Array.isArray(values) ? values : [];
  });

  return stores;
}

export async function readImportFile(file) {
  const jsonText = await file.text();
  const stores = parseImportJson(jsonText);
  return {
    fileName: file.name,
    stores
  };
}

export async function importJsonData(stores, mode) {
  if (mode !== 'replace' && mode !== 'append') {
    throw new Error('インポートモードが不正です。');
  }

  if (mode === 'replace') {
    for (const storeName of STORE_NAMES) {
      await clearStore(storeName);
    }
  }

  for (const storeName of STORE_NAMES) {
    if (stores[storeName]?.length) {
      await putRecords(storeName, stores[storeName]);
    }
  }
}
