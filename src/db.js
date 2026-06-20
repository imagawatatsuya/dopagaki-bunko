const DB_NAME = 'dopagaki-bunko';
const DB_VERSION = 5;

export const STORE_NAMES = [
  'works',
  'fragments',
  'likes',
  'bookmarks',
  'readingStates',
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

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')), { once: true });
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

      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        deleteRemovedStores(database);
        ALL_STORE_NAMES.forEach((storeName) => {
          createStore(database, storeName);
        });
      });

      request.addEventListener('success', () => {
        const database = request.result;
        rememberDatabase(database);
        resolve(database);
      }, { once: true });

      request.addEventListener('error', () => {
        clearOpenState();
        reject(request.error ?? new Error('Failed to open IndexedDB.'));
      }, { once: true });

      request.addEventListener('blocked', () => {
        clearOpenState();
        reject(new Error('IndexedDB upgrade was blocked by another open tab.'));
      }, { once: true });
    });
  }

  return openPromise;
}

export async function withStore(storeName, mode, callback) {
  if (!ALL_STORE_NAMES.includes(storeName)) {
    throw new Error(`Unknown store: ${storeName}`);
  }

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const database = await openDb();
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = await callback(store, transaction);
      await transactionDone(transaction);
      return result;
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

export async function exportStores() {
  const entries = await Promise.all(STORE_NAMES.map(async (storeName) => {
    return [storeName, await getAllRecords(storeName)];
  }));

  return Object.fromEntries(entries);
}
