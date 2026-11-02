// Haqiqiy rejim: Supabase (login, baza, fayllar).
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from "./config.js";

let sb;
export const isDemo = false;

export async function init() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Magic link orqali qaytganda sessiyani o'qib olish
  await sb.auth.getSession();
  if (/access_token|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const email = user.email.toLowerCase();
  const { data: row, error } = await sb.from("teachers").select("*").eq("email", email).maybeSingle();
  if (error && /does not exist|schema cache/i.test(error.message)) throw new Error("Baza hali sozlanmagan: Supabase SQL Editor'da supabase/schema.sql faylini ishga tushiring.");
  return { email, isTeacher: !!row, isAdmin: !!row?.is_admin };
}

export async function signIn(email) {
  const redirect = location.origin + location.pathname;
  check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }));
  return { immediate: false };
}

export async function signInPassword(email, password) {
  check(await sb.auth.signInWithPassword({ email, password }));
  return { immediate: true };
}

export async function signUp(email, password) {
  const data = check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
  return { immediate: !!data.session };
}

export async function setPassword(password) {
  check(await sb.auth.updateUser({ password }));
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function listItems() {
  return check(await sb.from("items").select("*").order("updated_at", { ascending: false }));
}

export async function getItem(id) {
  return check(await sb.from("items").select("*").eq("id", id).maybeSingle());
}

export async function saveItem(item) {
  const row = { ...item, updated_at: new Date().toISOString() };
  if (!row.id) row.id = crypto.randomUUID();
  return check(await sb.from("items").upsert(row).select().single());
}

export async function deleteItem(item) {
  await deleteFiles(item.id, (item.files || []).map((f) => f.path));
  check(await sb.from("items").delete().eq("id", item.id));
}

const key = (itemId, path) => `items/${itemId}/${path}`;

export async function putFile(itemId, path, blob) {
  check(
    await sb.storage.from(STORAGE_BUCKET).upload(key(itemId, path), blob, {
      upsert: true,
      contentType: blob.type || "application/octet-stream",
    })
  );
}

export async function getFile(itemId, path) {
  return check(await sb.storage.from(STORAGE_BUCKET).download(key(itemId, path)));
}

export async function deleteFiles(itemId, paths) {
  if (!paths.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    check(await sb.storage.from(STORAGE_BUCKET).remove(paths.slice(i, i + 100).map((p) => key(itemId, p))));
  }
}

export async function listTeachers() {
  return check(await sb.from("teachers").select("*").order("email"));
}

export async function addTeacher(email, is_admin) {
  check(await sb.from("teachers").upsert({ email: email.toLowerCase(), is_admin }));
}

export async function removeTeacher(email) {
  check(await sb.from("teachers").delete().eq("email", email));
}
