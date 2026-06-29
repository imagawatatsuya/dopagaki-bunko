const DB_NAME = 'dopagaki-bunko';
const DB_VERSION = 6;
const OPEN_TIMEOUT_MS = 15000;
const TRANSACTION_TIMEOUT_MS = 20000;

export const STORE_NAMES = [
  'works',
  'fragments',
  'likes',
  'bookmarks',
  'readingStates',
  'importReceipts',
  'settings'
];

export const INTERNAL_STORE_NAMES = [
  'aozoraCatalog'
];

export const ALL_STORE_NAMES = [
  ...STORE_NAMES,
  ...INTERNAL_STORE_NAMES
];

let openPromise = null;
let cachedDatabase = null;

function clearOpenState() {
  openPromise = null;
  cachedDatabase = null;
}

function resetOpenState() {
  if (cachedDatabase) {
    try {
      cachedDatabase.close();
    } catch {
      // Ignore close failures and force a new open on the next request.
    }
  }
  clearOpenState();
}

function requireIndexedDb() {
  if (!('indexedDB' in globalThis)) {
    throw new Error('IndexedDB is not available in this environment.');
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), { once: true });
  });
}

function transactionDone(transaction, timeoutMs = TRANSACTION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      callback();
    };
    const timer = globalThis.setTimeout(() => {
      finish(() => {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive.
        }
        reject(new Error(`IndexedDB transaction timed out after ${timeoutMs}ms.`));
      });
    }, timeoutMs);
    transaction.addEventListener('complete', () => finish(resolve), { once: true });
    transaction.addEventListener('abort', () => finish(() => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))), { once: true });
    transaction.addEventListener('error', () => finish(() => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))), { once: true });
  });
}

function createStore(database, storeName) {
  if (!database.objectStoreNames.contains(storeName)) {
    database.createObjectStore(storeName, { keyPath: 'id' });
  }
}

function deleteRemovedStores(database) {
  [...database.objectStoreNames].forEach((storeName) => {
    if (!ALL_STORE_NAMES.includes(storeName)) {
      database.deleteObjectStore(storeName);
    }
  });
}

function rememberDatabase(database) {
  cachedDatabase = database;
  database.addEventListener('versionchange', () => {
    try {
      database.close();
    } catch {
      // Ignore close failures and force a new open on the next request.
    }
    clearOpenState();
  });
  database.addEventListener('close', () => {
    if (cachedDatabase === database) {
      clearOpenState();
    }
  });
}

function isRecoverableDbError(error) {
  const name = String(error?.name ?? '');
  const message = String(error?.message ?? '');

  if (name === 'InvalidStateError' || name === 'AbortError' || name === 'TransactionInactiveError' || name === 'UnknownError') {
    return true;
  }

  return (
    message.includes('IndexedDB request failed')
    || message.includes('IndexedDB transaction aborted')
    || message.includes('IndexedDB transaction failed')
    || message.includes('IndexedDB transaction timed out')
    || message.includes('IndexedDB open timed out')
    || message.includes('database connection is closing')
    || message.includes('connection is closing')
    || message.includes('transaction is not active')
    || message.includes('not active')
    || message.includes('Failed to execute')
  );
}

export function openDb() {
  requireIndexedDb();

  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let settled = false;
      let blocked = false;
      const finish = (callback) => {
        if (settled) {
          return false;
        }
        settled = true;
        globalThis.clearTimeout(timer);
        callback();
        return true;
      };
      const timer = globalThis.setTimeout(() => {
        finish(() => {
          clearOpenState();
          reject(new Error(
            blocked
              ? 'IndexedDB upgrade is still blocked by another dopagaki-bunko tab. Close the other tab and retry.'
              : `IndexedDB open timed out after ${OPEN_TIMEOUT_MS}ms.`
          ));
        });
      }, OPEN_TIMEOUT_MS);

      request.addEventListener('upgradeneeded', () => {
        if (settled) {
          return;
        }
        const database = request.result;
        deleteRemovedStores(database);
        ALL_STORE_NAMES.forEach((storeName) => {
          createStore(database, storeName);
        });
      });

      request.addEventListener('success', () => {
        const database = request.result;
        if (!finish(() => {
          rememberDatabase(database);
          resolve(database);
        })) {
          database.close();
        }
      }, { once: true });

      request.addEventListener('error', () => {
        finish(() => {
          clearOpenState();
          reject(request.error ?? new Error('Failed to open IndexedDB.'));
        });
      }, { once: true });

      request.addEventListener('blocked', () => {
        blocked = true;
      }, { once: true });
    });
  }

  return openPromise;
}

export async function withStores(storeNames, mode, callback) {
  const uniqueStoreNames = [...new Set(storeNames)];
  if (uniqueStoreNames.length === 0 || uniqueStoreNames.some((storeName) => !ALL_STORE_NAMES.includes(storeName))) {
    throw new Error(`Unknown or empty store list: ${uniqueStoreNames.join(', ')}`);
  }

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const database = await openDb();
      const transaction = database.transaction(uniqueStoreNames, mode);
      const completion = transactionDone(transaction);
      const stores = Object.fromEntries(
        uniqueStoreNames.map((storeName) => [storeName, transaction.objectStore(storeName)])
      );
      try {
        const result = await callback(stores, transaction);
        await completion;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive.
        }
        await completion.catch(() => {});
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isRecoverableDbError(error)) {
        throw error;
      }
      resetOpenState();
    }
  }

  throw lastError ?? new Error('IndexedDB operation failed.');
}

export function withStore(storeName, mode, callback) {
  return withStores([storeName], mode, (stores, transaction) => {
    return callback(stores[storeName], transaction);
  });
}

export function applyRecordMutations({
  clearStores = [],
  deleteRecords = {},
  putRecords = {}
} = {}) {
  const storeNames = [...new Set([
    ...clearStores,
    ...Object.keys(deleteRecords),
    ...Object.keys(putRecords)
  ])];
  if (storeNames.length === 0) {
    return Promise.resolve();
  }

  return withStores(storeNames, 'readwrite', async (stores) => {
    const requests = [];
    for (const storeName of clearStores) {
      requests.push(requestToPromise(stores[storeName].clear()));
    }
    for (const [storeName, ids] of Object.entries(deleteRecords)) {
      for (const id of ids ?? []) {
        requests.push(requestToPromise(stores[storeName].delete(id)));
      }
    }
    for (const [storeName, values] of Object.entries(putRecords)) {
      for (const value of values ?? []) {
        requests.push(requestToPromise(stores[storeName].put(value)));
      }
    }
    await Promise.all(requests);
  });
}

export function getAllRecords(storeName) {
  return withStore(storeName, 'readonly', async (store) => {
    return requestToPromise(store.getAll());
  });
}

export function getRecord(storeName, id) {
  return withStore(storeName, 'readonly', async (store) => {
    return requestToPromise(store.get(id));
  });
}

export function putRecord(storeName, value) {
  if (!value || typeof value !== 'object') {
    throw new Error('putRecord requires an object value.');
  }

  return withStore(storeName, 'readwrite', async (store) => {
    await requestToPromise(store.put(value));
    return value;
  });
}

export function putRecords(storeName, values) {
  if (!Array.isArray(values)) {
    throw new Error('putRecords requires an array.');
  }

  return withStore(storeName, 'readwrite', async (store) => {
    await Promise.all(values.map((value) => requestToPromise(store.put(value))));
    return values;
  });
}

export function deleteRecord(storeName, id) {
  return withStore(storeName, 'readwrite', async (store) => {
    await requestToPromise(store.delete(id));
  });
}

export function clearStore(storeName) {
  return withStore(storeName, 'readwrite', async (store) => {
    await requestToPromise(store.clear());
  });
}

export function assertStoreCountsEmpty(counts) {
  const remaining = Object.entries(counts).filter(([, count]) => Number(count) > 0);
  if (remaining.length > 0) {
    const summary = remaining.map(([storeName, count]) => `${storeName}:${count}`).join(', ');
    throw new Error(`初期化後も保存データが残っています（${summary}）。`);
  }
  return true;
}

export async function verifyStoresEmpty(storeNames) {
  resetOpenState();
  const counts = await withStores(storeNames, 'readonly', async (stores) => {
    const entries = await Promise.all(storeNames.map(async (storeName) => {
      return [storeName, await requestToPromise(stores[storeName].count())];
    }));
    return Object.fromEntries(entries);
  });
  assertStoreCountsEmpty(counts);
  return counts;
}

export async function exportStores() {
  return withStores(STORE_NAMES, 'readonly', async (stores) => {
    const entries = await Promise.all(STORE_NAMES.map(async (storeName) => {
      return [storeName, await requestToPromise(stores[storeName].getAll())];
    }));
    return Object.fromEntries(entries);
  });
}
