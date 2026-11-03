// Muqova rasmlari (thumbnail): yuklangan rasmni kichraytirish, avtomatik
// rasm topish (sayt skrinshoti, ZIP ichidagi rasm, PDF birinchi sahifasi)
// va rasm bo'lmasa chiroyli "generatsiya qilingan" muqova.

const MAX_W = 640;
const MAX_H = 400;
const IMG_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ext = (p) => (p.split(".").pop() || "").toLowerCase();

// ---------- rasmni kichraytirish ----------
function canvasToDataUrl(canvas) {
  let url = canvas.toDataURL("image/webp", 0.8);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.82);
  return url;
}

function drawScaled(source, w, h) {
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // shaffof PNG/SVG qora bo'lib qolmasin
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasToDataUrl(canvas);
}

// Rasm fayli (File/Blob) -> kichik data URL (taxminan 20-60 KB)
export async function imageToThumb(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error("Rasmni o'qib bo'lmadi"));
      img.src = url;
    });
    const w = img.naturalWidth || 640;
    const h = img.naturalHeight || 360;
    return drawScaled(img, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- avtomatik rasm ----------
function driveId(url) {
  const m =
    url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&#]+)/) ||
    url.match(/[?&]id=([^&#]+)/) ||
    url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Havola uchun: sayt skrinshoti yoki Google Drive fayl rasmi
export function linkThumbUrl(url) {
  if (!url) return "";
  let host = "";
  try { host = new URL(url).hostname; } catch { return ""; }
  if (host.includes("drive.google.com") || host.includes("docs.google.com")) {
    const id = /\/folders\//.test(url) ? null : driveId(url);
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : "";
  }
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=640&h=400`;
}

// ZIP ichidagi eng mos rasmni tanlaydi (cover/thumb/logo nomli yoki eng kattasi)
export function pickImage(files) {
  const imgs = files.filter((f) => IMG_EXT.includes(ext(f.path)) && !/favicon|apple-touch|sprite/i.test(f.path));
  if (!imgs.length) return null;
  const score = (f) => {
    const name = f.path.split("/").pop().toLowerCase();
    let s = Math.min(f.size || 0, 2_000_000) / 1000; // KB
    if (/thumb|cover|preview|screenshot|poster|banner|muqova/.test(name)) s += 5000;
    else if (/title|logo|splash|bg|background|main|hero/.test(name)) s += 1500;
    if ((f.size || 0) < 3000) s -= 3000; // kichik ikonkalar
    s -= f.path.split("/").length * 20;
    return s;
  };
  return imgs.sort((a, b) => score(b) - score(a))[0];
}

async function pdfFirstPage(blob) {
  const pdfjs = await import(PDFJS + "pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(MAX_W / base.width, MAX_H / base.height) * 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return drawScaled(canvas, canvas.width, canvas.height);
  } finally {
    pdf.destroy();
  }
}

// Material turiga qarab avtomatik muqova topadi. Topilmasa "" qaytaradi.
// files: [{ path, size, blob? }], getBlob(path) - fayl blobini olish uchun.
export async function autoThumb({ kind, url, files = [], getBlob }) {
  try {
    if (kind === "link") return linkThumbUrl(url);
    const blobOf = async (f) => f.blob || (await getBlob(f.path));
    if (kind === "pdf" && files[0]) return await pdfFirstPage(await blobOf(files[0]));
    if (kind === "bundle") {
      const f = pickImage(files);
      if (f) return await imageToThumb(await blobOf(f));
    }
  } catch (e) {
    console.warn("Avtomatik muqova topilmadi", e);
  }
  return "";
}

// ---------- rasm yo'q bo'lsa: generatsiya qilingan muqova ----------
const KEYWORDS = [
  [/hayvon|animal|zoo|mushuk|it\b|cat|dog|qush|bird/i, "🐾"],
  [/matem|math|raqam|son\b|number|hisob|count|qo'shish|ayirish/i, "🔢"],
  [/ingliz|english|alphabet|alifbo|harf|letter|abc/i, "🔤"],
  [/so'z|word|vocab|lug'at|spelling/i, "📝"],
  [/rang|colou?r/i, "🎨"],
  [/meva|fruit|sabzavot|vegetable|food|ovqat/i, "🍎"],
  [/geograf|map|xarita|dunyo|world|davlat|country/i, "🌍"],
  [/tarix|history/i, "🏛️"],
  [/kimyo|chem/i, "⚗️"],
  [/fizika|physic/i, "⚛️"],
  [/biolog|tabiat|nature|o'simlik|plant/i, "🌿"],
  [/musiqa|music|qo'shiq|song/i, "🎵"],
  [/sport|futbol|football/i, "⚽"],
  [/kosmos|space|planet|sayyora/i, "🚀"],
  [/vaqt|time|soat|clock/i, "⏰"],
  [/ob-?havo|weather|fasl|season/i, "⛅"],
  [/kasb|job|profession/i, "👷"],
  [/oila|family/i, "👨‍👩‍👧"],
  [/tana|body/i, "🧍"],
  [/transport|mashina|car/i, "🚗"],
  [/grammat|grammar|tense|zamon/i, "📐"],
  [/o'qish|reading|kitob|book|hikoya|story/i, "📖"],
  [/memory|xotira|juft|match/i, "🃏"],
  [/puzzle|jumboq|boshqotirma/i, "🧩"],
  [/wheel|g'ildirak|spin/i, "🎡"],
];

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h);
}

export function coverEmoji(item, fallback) {
  const text = [item.title, item.subject, ...(item.tags || []), item.description].join(" ");
  return (KEYWORDS.find(([re]) => re.test(text)) || [, fallback])[1];
}

// Rasm yo'q kartochka uchun HTML: kategoriya rangidagi fon, mos belgi va nom
export function coverHtml(item, icon) {
  const hue = hash(item.title || "") % 40 - 20; // har xil nomga biroz boshqa tus
  return `<div class="cover"><span class="cover-bg" style="filter:hue-rotate(${hue}deg)"></span><span class="cover-icon">${coverEmoji(item, icon)}</span><span class="cover-title">${esc(item.title || "")}</span></div>`;
}

// Kartochka muqovasi: rasm bo'lsa rasm, ishlamasa yoki yo'q bo'lsa generatsiya qilingan muqova
export function thumbSrc(item) {
  if (item.thumbnail === "none") return "";
  return item.thumbnail || (item.kind === "link" ? linkThumbUrl(item.url) : "");
}
