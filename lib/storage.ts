import { createBuiltInSchedule, PlanItem, PlanMedia } from "./plans";

const DB_NAME = "nextplan-local";
const DB_VERSION = 1;
const SEED_KEY = "schedule-seed-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("plans")) db.createObjectStore("plans", { keyPath: "id" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function ensureSeeded() {
  const metaDB = await openDatabase();
  const metaTx = metaDB.transaction("meta", "readonly");
  const seeded = await requestValue(metaTx.objectStore("meta").get(SEED_KEY));
  await transactionDone(metaTx);
  metaDB.close();
  if (!seeded) {
    const seedDB = await openDatabase();
    const seedTx = seedDB.transaction("plans", "readwrite");
    const plans = createBuiltInSchedule();
    for (const plan of plans) seedTx.objectStore("plans").put(plan);
    await transactionDone(seedTx);
    seedDB.close();
    const markerDB = await openDatabase();
    const markerTx = markerDB.transaction("meta", "readwrite");
    markerTx.objectStore("meta").put({ key: SEED_KEY, value: new Date().toISOString() });
    await transactionDone(markerTx);
    markerDB.close();
  }
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadPlans(): Promise<PlanItem[]> {
  await ensureSeeded();
  const db = await openDatabase();
  const tx = db.transaction("plans", "readonly");
  const rows = await requestValue(tx.objectStore("plans").getAll()) as PlanItem[];
  await transactionDone(tx);
  db.close();
  return rows.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

export async function savePlan(plan: PlanItem) {
  const db = await openDatabase();
  const tx = db.transaction("plans", "readwrite");
  tx.objectStore("plans").put(plan);
  await transactionDone(tx);
  db.close();
}

export async function removePlan(plan: PlanItem) {
  const db = await openDatabase();
  const mediaIds = plan.customProperties.flatMap((property) => property.media.map((media) => media.id));
  const tx = db.transaction(["plans", "media"], "readwrite");
  tx.objectStore("plans").delete(plan.id);
  mediaIds.forEach((id) => tx.objectStore("media").delete(id));
  await transactionDone(tx);
  db.close();
}

export async function saveMedia(media: PlanMedia, blob: Blob) {
  const db = await openDatabase();
  const tx = db.transaction("media", "readwrite");
  tx.objectStore("media").put({ id: media.id, blob });
  await transactionDone(tx);
  db.close();
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  const tx = db.transaction("media", "readonly");
  const row = await requestValue(tx.objectStore("media").get(id)) as { id: string; blob: Blob } | undefined;
  await transactionDone(tx);
  db.close();
  return row?.blob ?? null;
}

export async function removeMedia(id: string) {
  const db = await openDatabase();
  const tx = db.transaction("media", "readwrite");
  tx.objectStore("media").delete(id);
  await transactionDone(tx);
  db.close();
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportBackup() {
  const plans = await loadPlans();
  const media: Record<string, string> = {};
  for (const item of plans) {
    for (const property of item.customProperties) {
      for (const entry of property.media) {
        const blob = await getMediaBlob(entry.id);
        if (blob) media[entry.id] = await blobToDataURL(blob);
      }
    }
  }
  return JSON.stringify({ app: "NextPlan", version: 1, exportedAt: new Date().toISOString(), plans, media }, null, 2);
}

function dataURLToBlob(dataURL: string) {
  const [header, encoded] = dataURL.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] ?? "application/octet-stream";
  const bytes = atob(encoded);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

export async function importBackup(raw: string) {
  const data = JSON.parse(raw) as { app?: string; plans?: PlanItem[]; media?: Record<string, string> };
  if (data.app !== "NextPlan" || !Array.isArray(data.plans)) throw new Error("这不是有效的 NextPlan 备份文件");
  const db = await openDatabase();
  const tx = db.transaction(["plans", "media", "meta"], "readwrite");
  tx.objectStore("plans").clear();
  tx.objectStore("media").clear();
  for (const plan of data.plans) tx.objectStore("plans").put(plan);
  for (const [id, value] of Object.entries(data.media ?? {})) tx.objectStore("media").put({ id, blob: dataURLToBlob(value) });
  tx.objectStore("meta").put({ key: SEED_KEY, value: "imported" });
  await transactionDone(tx);
  db.close();
}
