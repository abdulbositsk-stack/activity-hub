// Sinov rejimi: hamma narsa brauzerning IndexedDB xotirasida saqlanadi.
const DB_NAME = "activity-hub-demo";
let dbp;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("items", { keyPath: "id" });
        d.createObjectStore("files");
        d.createObjectStore("teachers", { keyPath: "email" });
        d.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && "onsuccess" in r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

export const isDemo = true;

export async function init() {}

export async function currentUser() {
  const email = await tx("meta", "readonly", (s) => s.get("user"));
  if (!email) return null;
  return { email, isTeacher: true, isAdmin: true };
}

export async function signIn(email) {
  await tx("meta", "readwrite", (s) => s.put(email, "user"));
  const existing = await tx("teachers", "readonly", (s) => s.get(email));
  if (!existing) await tx("teachers", "readwrite", (s) => s.put({ email, is_admin: true }));
  return { immediate: true };
}

export async function signOut() {
  await tx("meta", "readwrite", (s) => s.delete("user"));
}

export async function listItems() {
  const all = await tx("items", "readonly", (s) => s.getAll());
  return all.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
}

export async function getItem(id) {
  return tx("items", "readonly", (s) => s.get(id));
}

export async function saveItem(item) {
  const now = new Date().toISOString();
  const row = { ...item, updated_at: now, created_at: item.created_at || now };
  if (!row.id) row.id = crypto.randomUUID();
  await tx("items", "readwrite", (s) => s.put(row));
  return row;
}

export async function deleteItem(item) {
  await deleteFiles(item.id, (item.files || []).map((f) => f.path));
  await tx("items", "readwrite", (s) => s.delete(item.id));
}

export async function putFile(itemId, path, blob) {
  await tx("files", "readwrite", (s) => s.put(blob, `${itemId}/${path}`));
}

export async function getFile(itemId, path) {
  const b = await tx("files", "readonly", (s) => s.get(`${itemId}/${path}`));
  if (!b) throw new Error("Fayl topilmadi: " + path);
  return b;
}

export async function deleteFiles(itemId, paths) {
  if (!paths.length) return;
  await tx("files", "readwrite", (s) => {
    for (const p of paths) s.delete(`${itemId}/${p}`);
  });
}

export async function listTeachers() {
  return tx("teachers", "readonly", (s) => s.getAll());
}

export async function addTeacher(email, is_admin) {
  await tx("teachers", "readwrite", (s) => s.put({ email: email.toLowerCase(), is_admin }));
}

export async function removeTeacher(email) {
  await tx("teachers", "readwrite", (s) => s.delete(email));
}
