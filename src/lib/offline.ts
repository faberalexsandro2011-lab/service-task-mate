export type OfflineAction =
  | {
      id: string;
      type: "start";
      orderId: string;
      actorId: string;
      actorEmail: string;
      actorName: string;
      createdAt: string;
    }
  | {
      id: string;
      type: "finish";
      orderId: string;
      actorId: string;
      actorEmail: string;
      notes: string;
      pieces?: Array<{ id: string; nome: string; quantidade: number }> | string[];
      createdAt: string;
    };

const DB_NAME = "central-os-offline";
const DB_VERSION = 1;
const ORDERS_STORE = "orders";
const META_STORE = "meta";
const QUEUE_STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ORDERS_STORE)) db.createObjectStore(ORDERS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveOfflineOrders(orders: unknown[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(ORDERS_STORE, "readwrite");
  const store = tx.objectStore(ORDERS_STORE);
  for (const order of orders) store.put(order);
  await txDone(tx);
  db.close();
}

export async function getOfflineOrders<T>(): Promise<T[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const tx = db.transaction(ORDERS_STORE, "readonly");
  const request = tx.objectStore(ORDERS_STORE).getAll();
  const result = await new Promise<T[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return result;
}

export async function saveOfflineActor(actor: unknown) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key: "actor", value: actor });
  await txDone(tx);
  db.close();
}

export async function saveOfflineRole(role: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key: "role", value: role });
  await txDone(tx);
  db.close();
}

export async function getOfflineRole<T extends string>(): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const request = tx.objectStore(META_STORE).get("role");
  const result = await new Promise<T | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result?.value ?? null) as T | null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return result;
}

export async function getOfflineActor<T>(): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const request = tx.objectStore(META_STORE).get("actor");
  const result = await new Promise<T | null>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return result;
}

export async function queueOfflineAction(action: OfflineAction) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).put(action);
  await txDone(tx);
  db.close();
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readonly");
  const request = tx.objectStore(QUEUE_STORE).getAll();
  const result = await new Promise<OfflineAction[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result ?? []) as OfflineAction[]);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineAction(id: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export function makeOfflineId() {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
