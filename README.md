# 🎯 Activity Hub

Ustozlar uchun o'yinlar, faoliyatlar va materiallar markazi. Netlify, Vercel va Google Drive'dagi
narsalarni, HTML/ZIP o'yinlarni va PDF'larni bir joyda saqlaydi. HTML/ZIP o'yinlarning kodini
to'g'ridan-to'g'ri brauzerda tahrirlash mumkin.

## Imkoniyatlar

- **Katalog**: kategoriya (o'yin, faoliyat, test, material), fan, sinf, teglar bo'yicha filtr va qidiruv.
- **Faqat ustozlar**: email orqali kirish; faqat "Ustozlar" ro'yxatidagi emaillar ichkariga kiradi. Admin ro'yxatni boshqaradi.
- **Qo'shish**: havola (Netlify / Vercel / Google Drive / boshqa sayt), HTML fayl, ZIP (ichida `index.html`), PDF.
- **Tahrirlash**: HTML/ZIP o'yinlar uchun kod muharriri (fayllar ro'yxati, saqlash, jonli ko'rish, yangi fayl yoki rasm yuklash).
- **Zaxira**: butun katalogni bitta ZIP'ga eksport qilish va qayta tiklash (sinov rejimidan Supabase'ga ko'chish uchun ham).
- **Telefon ilovasi**: saytni telefonda "Bosh ekranga qo'shish" mumkin.
- **ZIP yuklab olish**: tahrirlangan o'yinni ZIP qilib olib, xohlasangiz yana Netlify'ga joylash mumkin.

## Ishga tushirish

Hech qanday build kerak emas, bu oddiy statik sayt.

### 1. Sinov rejimi (darhol)
`js/config.js` bo'sh bo'lsa, sayt sinov rejimida ishlaydi: ma'lumotlar faqat brauzeringizda saqlanadi.
Mahalliy ishga tushirish: `npx serve .` yoki `python3 -m http.server`.

### 2. Haqiqiy rejim (Supabase, bepul)
1. [supabase.com](https://supabase.com) da yangi loyiha oching.
2. **SQL Editor** → `supabase/schema.sql` faylini joylang, oxiridagi emailni **o'zingiznikiga** almashtiring va **Run** bosing.
3. **Project Settings → API** dan `Project URL` va `anon public` kalitini oling va `js/config.js` ga yozing.
4. **Authentication → URL Configuration** da *Site URL* ga saytingiz manzilini yozing (masalan `https://activity-hub.netlify.app`).
5. Tavsiya: **Authentication → Providers → Email** da "Allow new users to sign up" yoqilgan bo'lsin (kirish havolasi uchun kerak). Ro'yxatda yo'q odamlar baribir hech narsani ko'ra olmaydi.

### 3. Joylash
- **Netlify**: "Add new site → Import from GitHub" → shu repo. Build buyrug'i kerak emas.
- **Vercel**: "New Project" → shu repo → Framework: *Other*.

## Netlify/Vercel'dagi o'yinni tahrirlanadigan qilish
Havola sifatida qo'shilgan o'yinni faqat ko'rish mumkin. Kodini tahrirlash uchun:
- **Netlify**: Site → Deploys → oxirgi deploy → **Download** (ZIP) → Activity Hub'ga ZIP sifatida yuklang.
- **Vercel / GitHub**: loyiha reposida **Code → Download ZIP** → yuklang.
  (Agar loyiha React/Vite kabi build qilinadigan bo'lsa, build natijasini — `dist/` yoki `build/` papkasini — ZIP qiling.)

## Tuzilishi
```
index.html            asosiy sahifa
css/style.css         dizayn
js/app.js             interfeys (katalog, ko'rish, forma, kod muharriri, ustozlar)
js/backend-local.js   sinov rejimi (IndexedDB)
js/backend-supabase.js haqiqiy rejim (Supabase)
js/config.js          Supabase sozlamalari
sw.js                 ZIP o'yinlarni sayt ichida ochib beruvchi service worker
supabase/schema.sql   baza, ruxsatlar va fayl ombori
```

## Eslatma
Yuklangan HTML o'yinlar sayt bilan bir domenda ishlaydi, shuning uchun faqat ishonchli ustozlarni ro'yxatga qo'shing.
