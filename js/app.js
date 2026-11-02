import { SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_URL } from "./config.js";

const api = await import(SUPABASE_URL && SUPABASE_ANON_KEY ? "./backend-supabase.js" : "./backend-local.js");

const $app = document.getElementById("app");
const $nav = document.getElementById("nav");
const BASE = new URL(".", location.href.split("#")[0]);
const PLAY_CACHE = "activity-hub-play";

export const CATEGORIES = [
  { id: "game", label: "O'yin", icon: "🎮" },
  { id: "activity", label: "Faoliyat", icon: "🧩" },
  { id: "quiz", label: "Test / Viktorina", icon: "❓" },
  { id: "material", label: "Material", icon: "📚" },
  { id: "other", label: "Boshqa", icon: "📁" },
];
const KIND_LABEL = { link: "Havola", bundle: "HTML / ZIP", pdf: "PDF" };
const SOURCE_LABEL = { netlify: "Netlify", vercel: "Vercel", drive: "Google Drive", web: "Veb", html: "HTML", zip: "ZIP", pdf: "PDF" };
const TEXT_EXT = ["html", "htm", "css", "js", "mjs", "json", "txt", "svg", "md", "xml", "csv"];
const MIME = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript",
  json: "application/json", txt: "text/plain", svg: "image/svg+xml", md: "text/markdown", xml: "application/xml", csv: "text/csv",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", pdf: "application/pdf", wasm: "application/wasm",
};

let user = null;

// ---------- yordamchilar ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ext = (p) => (p.split(".").pop() || "").toLowerCase();
const mimeOf = (p) => (MIME[ext(p)] || "application/octet-stream") + (TEXT_EXT.includes(ext(p)) ? ";charset=utf-8" : "");
const isText = (p) => TEXT_EXT.includes(ext(p));
const cat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString("uz-UZ", { year: "numeric", month: "short", day: "numeric" }) : "");

function toast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), isError ? 6000 : 2500);
}

function detectSource(url) {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (h.endsWith("netlify.app") || h.endsWith("netlify.com")) return "netlify";
  if (h.endsWith("vercel.app")) return "vercel";
  if (h.includes("drive.google.com") || h.includes("docs.google.com")) return "drive";
  return "web";
}

// Google Drive havolasini sayt ichida ko'rsatiladigan ko'rinishga keltiradi
function embedUrl(url) {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/) || url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  const d = url.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
  if (d) return `https://docs.google.com/${d[1]}/d/${d[2]}/preview`;
  const f = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([^/?]+)/);
  if (f) return `https://drive.google.com/embeddedfolderview?id=${f[1]}#grid`;
  return url;
}

function playUrl(id, path) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return new URL(`play/${id}/${enc}`, BASE).href;
}

// Paket (HTML/ZIP) fayllarini Service Worker keshiga yozadi
async function stageBundle(item) {
  const cache = await caches.open(PLAY_CACHE);
  await Promise.all(
    (item.files || []).map(async (f) => {
      const blob = await api.getFile(item.id, f.path);
      await cache.put(playUrl(item.id, f.path), new Response(blob, { headers: { "content-type": mimeOf(f.path) } }));
    })
  );
}

async function swReady() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register(new URL("sw.js", BASE).href, { scope: BASE.pathname });
    await navigator.serviceWorker.ready;
    return true;
  } catch (e) {
    console.warn("Service worker ishlamadi", e);
    return false;
  }
}

// ZIP ichidagi fayllarni o'qiydi, umumiy bosh papkani olib tashlaydi
async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  let entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX/") && !f.name.split("/").pop().startsWith("."));
  const parts = entries.map((e) => e.name.split("/"));
  let prefix = "";
  if (parts.length && parts.every((p) => p.length > 1 && p[0] === parts[0][0])) prefix = parts[0][0] + "/";
  const out = [];
  for (const e of entries) {
    const path = e.name.slice(prefix.length);
    const data = await e.async("uint8array");
    out.push({ path, blob: new Blob([data], { type: mimeOf(path) }) });
  }
  return out;
}

function pickEntry(paths) {
  const htmls = paths.filter((p) => /\.html?$/i.test(p)).sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
  return htmls.find((p) => /(^|\/)index\.html?$/i.test(p)) || htmls[0] || paths[0];
}

// ---------- marshrutlash ----------
async function route() {
  const hash = location.hash.slice(1) || "/";
  const [, page, id] = hash.split("/");
  renderNav();
  if (!user) return renderLogin();
  if (!user.isTeacher) return renderNoAccess();
  try {
    if (!page) return await renderCatalog();
    if (page === "new") return renderForm(null);
    if (page === "item") return await renderItem(id);
    if (page === "edit") return renderForm(await api.getItem(id));
    if (page === "code") return await renderCode(id);
    if (page === "teachers" && user.isAdmin) return await renderTeachers();
    location.hash = "#/";
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="card pad"><h2>Xatolik</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Bosh sahifa</a></div>`;
  }
}

const TG_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9.8 15.4 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.6c.3-1.1-.4-1.6-1.1-1.3L3.7 10.8c-1.1.4-1.1 1-.2 1.3l4.1 1.3 9.5-6c.4-.3.9-.1.6.2z"/></svg>`;
const tgLink = (cls = "btn tg") => (TELEGRAM_URL ? `<a class="${cls}" href="${esc(TELEGRAM_URL)}" target="_blank" rel="noopener">${TG_ICON} Telegram</a>` : "");

function renderNav() {
  if (!user || !user.isTeacher) {
    $nav.innerHTML = tgLink() + (user ? `<button class="btn ghost" id="logout">Chiqish</button>` : "");
  } else {
    $nav.innerHTML = `
      <a class="btn primary" href="#/new">+ Qo'shish</a>
      ${tgLink()}
      ${user.isAdmin ? `<a class="btn ghost" href="#/teachers">Ustozlar</a>` : ""}
      <span class="who" title="${esc(user.email)}">${esc(user.email)}</span>
      <button class="btn ghost" id="logout">Chiqish</button>`;
  }
  document.getElementById("logout")?.addEventListener("click", async () => {
    await api.signOut();
    user = null;
    location.hash = "#/";
    route();
  });
}

// ---------- kirish ----------
function renderLogin() {
  $app.innerHTML = `
    <div class="login card pad">
      <img class="login-logo" src="img/logo.png" alt="Activity Hub logotipi">
      <h1>Activity Hub</h1>
      <p class="muted">Ustozlar uchun o'yinlar, faoliyatlar va materiallar markazi.</p>
      <form id="login-form">
        <label>Email<input type="email" name="email" required placeholder="ustoz@maktab.uz" autocomplete="email"></label>
        <button class="btn primary wide">${api.isDemo ? "Kirish (sinov rejimi)" : "Kirish havolasini yuborish"}</button>
      </form>
      <p id="login-msg" class="muted small"></p>
      ${TELEGRAM_URL ? `<p class="small">Yangiliklar: ${tgLink("tg-inline")}</p>` : ""}
    </div>`;
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim().toLowerCase();
    const msg = document.getElementById("login-msg");
    try {
      const r = await api.signIn(email);
      if (r.immediate) {
        user = await api.currentUser();
        route();
      } else {
        msg.textContent = `${email} manziliga kirish havolasi yuborildi. Pochtangizni oching va havolani bosing.`;
      }
    } catch (err) {
      msg.textContent = "Xatolik: " + err.message;
    }
  };
}

function renderNoAccess() {
  $app.innerHTML = `
    <div class="login card pad">
      <h2>Ruxsat yo'q</h2>
      <p><b>${esc(user.email)}</b> ustozlar ro'yxatida yo'q. Administratordan sizni ro'yxatga qo'shishini so'rang.</p>
    </div>`;
}

// ---------- katalog ----------
const filters = { q: "", cat: "", subject: "", grade: "", kind: "" };

async function renderCatalog() {
  const items = await api.listItems();
  const uniq = (k) => [...new Set(items.map((i) => i[k]).filter(Boolean))].sort();
  const subjects = uniq("subject");
  const grades = uniq("grade");

  $app.innerHTML = `
    <section class="toolbar">
      <input id="q" type="search" placeholder="Qidirish: nomi, tavsif, teg…" value="${esc(filters.q)}">
      <select id="f-subject"><option value="">Barcha fanlar</option>${subjects.map((s) => `<option ${s === filters.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select id="f-grade"><option value="">Barcha sinflar</option>${grades.map((s) => `<option ${s === filters.grade ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select id="f-kind"><option value="">Barcha turlar</option>${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${k === filters.kind ? "selected" : ""}>${v}</option>`).join("")}</select>
    </section>
    <section class="chips" id="chips">
      <button class="chip ${!filters.cat ? "on" : ""}" data-cat="">Hammasi <span>${items.length}</span></button>
      ${CATEGORIES.map((c) => {
        const n = items.filter((i) => i.category === c.id).length;
        return `<button class="chip ${filters.cat === c.id ? "on" : ""}" data-cat="${c.id}">${c.icon} ${c.label} <span>${n}</span></button>`;
      }).join("")}
    </section>
    <section id="grid" class="grid"></section>`;

  const draw = () => {
    const q = filters.q.toLowerCase();
    const list = items.filter((i) =>
      (!filters.cat || i.category === filters.cat) &&
      (!filters.subject || i.subject === filters.subject) &&
      (!filters.grade || i.grade === filters.grade) &&
      (!filters.kind || i.kind === filters.kind) &&
      (!q || [i.title, i.description, i.subject, i.grade, ...(i.tags || [])].join(" ").toLowerCase().includes(q))
    );
    const grid = document.getElementById("grid");
    if (!items.length) {
      grid.innerHTML = `<div class="empty card pad"><h2>Hali hech narsa yo'q</h2><p class="muted">Birinchi o'yin yoki materialingizni qo'shing: Netlify/Vercel/Drive havolasi, HTML fayl, ZIP yoki PDF.</p><a class="btn primary" href="#/new">+ Qo'shish</a></div>`;
      return;
    }
    if (!list.length) {
      grid.innerHTML = `<p class="muted center">Hech narsa topilmadi.</p>`;
      return;
    }
    grid.innerHTML = list.map((i) => {
      const c = cat(i.category);
      return `<a class="tile card" href="#/item/${i.id}">
        <div class="thumb c-${c.id}">${c.icon}</div>
        <div class="tile-body">
          <h3>${esc(i.title)}</h3>
          <p class="muted small clamp">${esc(i.description || "")}</p>
          <div class="meta">
            <span class="tag kind">${esc(SOURCE_LABEL[i.source] || KIND_LABEL[i.kind])}</span>
            ${i.subject ? `<span class="tag">${esc(i.subject)}</span>` : ""}
            ${i.grade ? `<span class="tag">${esc(i.grade)}</span>` : ""}
            ${(i.tags || []).slice(0, 3).map((t) => `<span class="tag soft">#${esc(t)}</span>`).join("")}
          </div>
        </div></a>`;
    }).join("");
  };
  draw();

  document.getElementById("q").oninput = (e) => { filters.q = e.target.value; draw(); };
  document.getElementById("f-subject").onchange = (e) => { filters.subject = e.target.value; draw(); };
  document.getElementById("f-grade").onchange = (e) => { filters.grade = e.target.value; draw(); };
  document.getElementById("f-kind").onchange = (e) => { filters.kind = e.target.value; draw(); };
  document.getElementById("chips").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    filters.cat = b.dataset.cat;
    document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  };
}

// ---------- ko'rish ----------
async function renderItem(id) {
  const item = await api.getItem(id);
  if (!item) throw new Error("Topilmadi");
  const c = cat(item.category);
  $app.innerHTML = `
    <div class="item-head">
      <div>
        <a href="#/" class="muted small">← Katalog</a>
        <h1>${c.icon} ${esc(item.title)}</h1>
        <p class="muted">${esc(item.description || "")}</p>
        <div class="meta">
          <span class="tag kind">${esc(SOURCE_LABEL[item.source] || KIND_LABEL[item.kind])}</span>
          <span class="tag">${c.label}</span>
          ${item.subject ? `<span class="tag">${esc(item.subject)}</span>` : ""}
          ${item.grade ? `<span class="tag">${esc(item.grade)}</span>` : ""}
          ${(item.tags || []).map((t) => `<span class="tag soft">#${esc(t)}</span>`).join("")}
          <span class="muted small">Yangilangan: ${fmtDate(item.updated_at)}</span>
        </div>
      </div>
      <div class="actions">
        ${item.kind === "bundle" ? `<a class="btn primary" href="#/code/${item.id}">✏️ Kodni tahrirlash</a>` : ""}
        <a class="btn" href="#/edit/${item.id}">Ma'lumotlar</a>
        <button class="btn" id="open-new">Yangi oynada ↗</button>
        ${item.kind === "bundle" ? `<button class="btn" id="download">ZIP yuklab olish</button>` : ""}
        <button class="btn" id="fullscreen">⛶ To'liq ekran</button>
        <button class="btn danger" id="del">O'chirish</button>
      </div>
    </div>
    ${item.kind === "link" && (item.source === "netlify" || item.source === "vercel") ? `<p class="note small">Bu o'yin ${SOURCE_LABEL[item.source]}'da joylashgan, shuning uchun bu yerda faqat ko'rish mumkin. Kodini tahrirlash uchun loyihani ZIP qilib yuklang (README'da qanday qilish yozilgan).</p>` : ""}
    <div class="viewer card" id="viewer"><p class="muted center">Yuklanmoqda…</p></div>`;

  const viewer = document.getElementById("viewer");
  let src = "";
  if (item.kind === "link") {
    src = embedUrl(item.url);
  } else if (item.kind === "pdf") {
    const blob = await api.getFile(item.id, item.files[0].path);
    src = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  } else {
    if (await swReady()) {
      await stageBundle(item);
      src = playUrl(item.id, item.entry);
    } else {
      const html = await (await api.getFile(item.id, item.entry)).text();
      src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    }
  }
  viewer.innerHTML = `<iframe src="${esc(src)}" allow="fullscreen; autoplay; clipboard-write" allowfullscreen></iframe>`;

  document.getElementById("open-new").onclick = () => window.open(item.kind === "link" ? item.url : src, "_blank");
  document.getElementById("fullscreen").onclick = () => viewer.requestFullscreen?.();
  document.getElementById("download")?.addEventListener("click", () => downloadZip(item));
  document.getElementById("del").onclick = async () => {
    if (!confirm(`"${item.title}" butunlay o'chirilsinmi?`)) return;
    await api.deleteItem(item);
    toast("O'chirildi");
    location.hash = "#/";
  };
}

async function downloadZip(item) {
  const zip = new JSZip();
  for (const f of item.files) zip.file(f.path, await api.getFile(item.id, f.path));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (item.title || "activity").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() + ".zip";
  a.click();
}

// ---------- qo'shish / ma'lumotlarni tahrirlash ----------
function renderForm(item) {
  const isNew = !item;
  item = item || { category: "game", kind: "link", tags: [] };
  $app.innerHTML = `
    <div class="card pad form-card">
      <a href="${isNew ? "#/" : `#/item/${item.id}`}" class="muted small">← Orqaga</a>
      <h1>${isNew ? "Yangi qo'shish" : "Ma'lumotlarni tahrirlash"}</h1>
      <form id="f">
        <label>Nomi *<input name="title" required value="${esc(item.title || "")}" placeholder="Masalan: Hayvonlar viktorinasi"></label>
        <label>Tavsif<textarea name="description" rows="2" placeholder="Qisqacha: nima haqida, qanday o'ynaladi">${esc(item.description || "")}</textarea></label>
        <div class="row">
          <label>Kategoriya<select name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === item.category ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}</select></label>
          <label>Fan<input name="subject" value="${esc(item.subject || "")}" placeholder="Ingliz tili"></label>
          <label>Sinf / daraja<input name="grade" value="${esc(item.grade || "")}" placeholder="5-sinf"></label>
        </div>
        <label>Teglar (vergul bilan)<input name="tags" value="${esc((item.tags || []).join(", "))}" placeholder="so'z boyligi, hayvonlar"></label>

        ${isNew ? `
        <fieldset>
          <legend>Manba</legend>
          <div class="seg" id="kind-seg">
            <label><input type="radio" name="src" value="link" checked> 🔗 Havola</label>
            <label><input type="radio" name="src" value="html"> 📄 HTML fayl</label>
            <label><input type="radio" name="src" value="zip"> 🗜️ ZIP</label>
            <label><input type="radio" name="src" value="pdf"> 📕 PDF</label>
          </div>
          <div data-src="link"><label>Havola (Netlify, Vercel, Google Drive yoki boshqa)<input name="url" type="url" placeholder="https://mening-oyinim.netlify.app"></label></div>
          <div data-src="html" hidden><label>HTML fayl<input name="html" type="file" accept=".html,.htm"></label></div>
          <div data-src="zip" hidden><label>ZIP fayl (ichida index.html bo'lishi kerak)<input name="zip" type="file" accept=".zip"></label></div>
          <div data-src="pdf" hidden><label>PDF fayl<input name="pdf" type="file" accept="application/pdf,.pdf"></label></div>
        </fieldset>` : item.kind === "link" ? `
        <label>Havola<input name="url" type="url" required value="${esc(item.url)}"></label>` : ""}

        <div class="form-actions">
          <button class="btn primary" id="save">Saqlash</button>
          <span id="status" class="muted small"></span>
        </div>
      </form>
    </div>`;

  const form = document.getElementById("f");
  if (isNew) {
    form.querySelectorAll("input[name=src]").forEach((r) =>
      r.addEventListener("change", () => {
        form.querySelectorAll("[data-src]").forEach((d) => (d.hidden = d.dataset.src !== form.src.value));
      })
    );
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save");
    const status = document.getElementById("status");
    btn.disabled = true;
    try {
      const fd = new FormData(form);
      const row = {
        ...item,
        title: fd.get("title").trim(),
        description: fd.get("description").trim(),
        category: fd.get("category"),
        subject: fd.get("subject").trim(),
        grade: fd.get("grade").trim(),
        tags: fd.get("tags").split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (!row.created_by) row.created_by = user.email;
      if (!row.id) row.id = crypto.randomUUID();
      let uploads = [];

      if (isNew) {
        const srcType = fd.get("src");
        if (srcType === "link") {
          const url = fd.get("url").trim();
          if (!url) throw new Error("Havolani kiriting");
          Object.assign(row, { kind: "link", url, source: detectSource(url), files: [] });
        } else {
          const file = fd.get(srcType);
          if (!file || !file.size) throw new Error("Faylni tanlang");
          if (srcType === "pdf") {
            uploads = [{ path: file.name, blob: file }];
            Object.assign(row, { kind: "pdf", source: "pdf" });
          } else if (srcType === "html") {
            uploads = [{ path: "index.html", blob: new Blob([await file.text()], { type: "text/html" }) }];
            Object.assign(row, { kind: "bundle", source: "html", entry: "index.html" });
          } else {
            status.textContent = "ZIP ochilmoqda…";
            uploads = await readZip(file);
            if (!uploads.length) throw new Error("ZIP bo'sh");
            Object.assign(row, { kind: "bundle", source: "zip", entry: pickEntry(uploads.map((u) => u.path)) });
          }
          row.files = uploads.map((u) => ({ path: u.path, size: u.blob.size }));
        }
      } else if (item.kind === "link") {
        row.url = fd.get("url").trim();
        row.source = detectSource(row.url);
      }

      for (let i = 0; i < uploads.length; i++) {
        status.textContent = `Yuklanmoqda ${i + 1}/${uploads.length}…`;
        await api.putFile(row.id, uploads[i].path, uploads[i].blob);
      }
      const saved = await api.saveItem(row);
      toast("Saqlandi");
      location.hash = `#/item/${saved.id}`;
    } catch (err) {
      console.error(err);
      status.textContent = "";
      toast("Xatolik: " + err.message, true);
      btn.disabled = false;
    }
  };
}

// ---------- kod muharriri ----------
async function renderCode(id) {
  const item = await api.getItem(id);
  if (!item || item.kind !== "bundle") throw new Error("Bu materialni kod sifatida tahrirlab bo'lmaydi");
  const textFiles = () => item.files.filter((f) => isText(f.path)).sort((a, b) => (a.path === item.entry ? -1 : b.path === item.entry ? 1 : a.path.localeCompare(b.path)));
  const otherFiles = () => item.files.filter((f) => !isText(f.path));
  const buffers = {}; // path -> { doc, dirty }
  let current = null;
  const useSW = await swReady();

  $app.innerHTML = `
    <div class="code-head">
      <div><a href="#/item/${item.id}" class="muted small">← ${esc(item.title)}</a><h2>✏️ Kodni tahrirlash</h2></div>
      <div class="actions">
        <button class="btn" id="add-file">+ Fayl</button>
        <label class="btn">Fayl yuklash<input type="file" id="upload" multiple hidden></label>
        <button class="btn" id="preview-btn">▶ Ko'rish</button>
        <button class="btn primary" id="save-all">💾 Saqlash</button>
      </div>
    </div>
    <div class="code-wrap">
      <aside class="files card" id="files"></aside>
      <div class="editor card" id="editor"></div>
      <div class="preview card" id="preview"><p class="muted center small">"▶ Ko'rish" tugmasini bosing</p></div>
    </div>`;

  const cm = CodeMirror(document.getElementById("editor"), { lineNumbers: true, lineWrapping: true, tabSize: 2, indentUnit: 2 });
  const modeOf = (p) => ({ html: "htmlmixed", htm: "htmlmixed", svg: "xml", xml: "xml", css: "css", js: "javascript", mjs: "javascript", json: { name: "javascript", json: true } }[ext(p)] || null);

  const drawFiles = () => {
    document.getElementById("files").innerHTML = `
      ${textFiles().map((f) => `<button class="file ${f.path === current ? "on" : ""}" data-path="${esc(f.path)}">${buffers[f.path]?.dirty ? "● " : ""}${esc(f.path)}${f.path === item.entry ? ' <span class="tag soft">asosiy</span>' : ""}</button>`).join("")}
      ${otherFiles().length ? `<div class="muted small sep">Boshqa fayllar</div>${otherFiles().map((f) => `<div class="file static small">${esc(f.path)}</div>`).join("")}` : ""}`;
  };

  async function open(path) {
    if (!buffers[path]) {
      const text = await (await api.getFile(item.id, path)).text();
      buffers[path] = { doc: CodeMirror.Doc(text, modeOf(path)), dirty: false };
      buffers[path].doc.on("change", () => { if (!buffers[path].dirty) { buffers[path].dirty = true; drawFiles(); } });
    }
    current = path;
    cm.swapDoc(buffers[path].doc);
    drawFiles();
    cm.focus();
  }

  async function saveAll() {
    const dirty = Object.entries(buffers).filter(([, b]) => b.dirty);
    for (const [path, b] of dirty) {
      await api.putFile(item.id, path, new Blob([b.doc.getValue()], { type: mimeOf(path) }));
      b.dirty = false;
      const f = item.files.find((x) => x.path === path);
      if (f) f.size = b.doc.getValue().length;
    }
    Object.assign(item, await api.saveItem(item));
    drawFiles();
    return dirty.length;
  }

  async function preview() {
    const pv = document.getElementById("preview");
    pv.classList.add("on");
    if (useSW) {
      const cache = await caches.open(PLAY_CACHE);
      await stageBundle({ ...item, files: item.files.filter((f) => !buffers[f.path]) });
      for (const [path, b] of Object.entries(buffers)) {
        await cache.put(playUrl(item.id, path), new Response(b.doc.getValue(), { headers: { "content-type": mimeOf(path) } }));
      }
      pv.innerHTML = `<iframe src="${playUrl(item.id, item.entry)}?t=${Date.now()}"></iframe>`;
    } else {
      const html = buffers[item.entry]?.doc.getValue() ?? (await (await api.getFile(item.id, item.entry)).text());
      pv.innerHTML = `<iframe></iframe>`;
      pv.querySelector("iframe").srcdoc = html;
    }
  }

  document.getElementById("files").onclick = (e) => {
    const b = e.target.closest("button.file");
    if (b) open(b.dataset.path);
  };
  document.getElementById("save-all").onclick = async () => {
    try {
      const n = await saveAll();
      toast(n ? `Saqlandi (${n} fayl)` : "O'zgarish yo'q");
    } catch (err) { toast("Xatolik: " + err.message, true); }
  };
  document.getElementById("preview-btn").onclick = () => preview().catch((err) => toast(err.message, true));
  document.getElementById("add-file").onclick = async () => {
    const path = prompt("Yangi fayl nomi (masalan: style.css yoki js/game.js)");
    if (!path) return;
    if (item.files.some((f) => f.path === path)) return open(path);
    await api.putFile(item.id, path, new Blob([""], { type: mimeOf(path) }));
    item.files.push({ path, size: 0 });
    Object.assign(item, await api.saveItem(item));
    if (isText(path)) open(path); else drawFiles();
  };
  document.getElementById("upload").onchange = async (e) => {
    for (const file of e.target.files) {
      await api.putFile(item.id, file.name, file);
      delete buffers[file.name];
      if (!item.files.some((f) => f.path === file.name)) item.files.push({ path: file.name, size: file.size });
    }
    Object.assign(item, await api.saveItem(item));
    toast(`${e.target.files.length} ta fayl yuklandi`);
    drawFiles();
  };
  cm.setOption("extraKeys", { "Ctrl-S": () => document.getElementById("save-all").click(), "Cmd-S": () => document.getElementById("save-all").click() });
  window.onbeforeunload = () => (Object.values(buffers).some((b) => b.dirty) ? true : undefined);

  const first = textFiles()[0];
  if (first) await open(first.path); else drawFiles();
}

// ---------- ustozlar ----------
async function renderTeachers() {
  const list = await api.listTeachers();
  $app.innerHTML = `
    <div class="card pad form-card">
      <a href="#/" class="muted small">← Katalog</a>
      <h1>Ustozlar ro'yxati</h1>
      <p class="muted">Faqat shu ro'yxatdagi emaillar saytga kira oladi.</p>
      <form id="add" class="row inline">
        <input name="email" type="email" required placeholder="ustoz@maktab.uz">
        <label class="check"><input type="checkbox" name="admin"> Admin</label>
        <button class="btn primary">Qo'shish</button>
      </form>
      <table class="table">
        <thead><tr><th>Email</th><th>Rol</th><th></th></tr></thead>
        <tbody>${list.map((t) => `<tr><td>${esc(t.email)}</td><td>${t.is_admin ? "Admin" : "Ustoz"}</td><td>${t.email === user.email ? "" : `<button class="btn small danger" data-rm="${esc(t.email)}">Olib tashlash</button>`}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  document.getElementById("add").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.addTeacher(e.target.email.value.trim(), e.target.admin.checked);
      toast("Qo'shildi");
      renderTeachers();
    } catch (err) { toast("Xatolik: " + err.message, true); }
  };
  $app.querySelector("tbody").onclick = async (e) => {
    const email = e.target.dataset?.rm;
    if (!email || !confirm(`${email} ro'yxatdan olib tashlansinmi?`)) return;
    await api.removeTeacher(email);
    renderTeachers();
  };
}

// ---------- ishga tushirish ----------
try {
  if (api.isDemo) document.getElementById("demo-banner").hidden = false;
  await api.init();
  user = await api.currentUser();
} catch (e) {
  console.error(e);
  toast("Ulanishda xatolik: " + e.message, true);
}
window.addEventListener("hashchange", () => {
  window.onbeforeunload = null;
  route();
});
swReady();
route();
