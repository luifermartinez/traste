// Cápsulas del tiempo: grabaciones guardadas en IndexedDB (solo en este dispositivo).
const DB = 'traste-capsulas';
const STORE = 'clips';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const addCapsule = (clip) => tx('readwrite', (s) => s.add(clip));
export const listCapsules = () => tx('readonly', (s) => s.getAll());
export const deleteCapsule = (id) => tx('readwrite', (s) => s.delete(id));
