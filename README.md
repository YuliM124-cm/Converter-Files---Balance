# Akuntan Converter — Varian Vercel + Supabase

Versi ini sama persis fungsinya dengan varian `backend/` + `frontend/` (Render/Express),
tapi dijalankan sebagai **serverless functions di Vercel** dengan **login tim lewat Supabase Auth**
(menggantikan Basic Auth). Cocok kalau Anda sudah familiar / lebih suka Vercel dan Supabase.

Prinsip keamanan inti tetap sama: **file yang diunggah hanya diproses di memori**, file
sementara langsung dihapus, dan tidak ada data transaksi yang disimpan permanen di server.

---

## 1. Struktur folder

```
vercel-supabase/
├── api/                        # Serverless functions (jadi endpoint /api/...)
│   ├── health.js               # GET  /api/health            (tanpa login, cek status)
│   ├── bank-statement-tidy.js  # POST /api/bank-statement-tidy     (perlu login)
│   ├── bank-statement-preview.js # POST /api/bank-statement-preview (perlu login)
│   └── convert.js              # POST /api/convert                (perlu login)
├── lib/                        # Logika inti (dipakai bersama oleh semua function)
│   ├── requireUser.js          # Verifikasi token sesi Supabase
│   ├── parseUpload.js          # Baca file upload → buffer (tanpa simpan permanen)
│   ├── textExtractor.js        # Ekstrak teks dari PDF/Excel/CSV/gambar (OCR)
│   ├── bankStatementParser.js  # Parser heuristik transaksi rekening koran
│   └── excelBuilder.js         # Penyusun file Excel hasil akhir
├── public/                     # Frontend statis
│   ├── index.html              # Layar login + UI aplikasi
│   ├── css/style.css
│   └── js/
│       ├── auth.js             # Login/logout via Supabase Auth
│       └── app.js              # Logika upload/preview/konversi (mengirim Bearer token)
├── package.json
└── vercel.json                 # Konfigurasi durasi maksimum function (60 detik)
```

---

## 2. Menyiapkan proyek Supabase (untuk login tim)

1. Buka [supabase.com](https://supabase.com) → **New project**. Catat **Project URL**.
2. Di **Project Settings → API**, salin tiga nilai berikut:
   - `Project URL` → akan jadi `SUPABASE_URL`
   - `anon public` key → akan jadi `SUPABASE_ANON_KEY` (aman dipakai di frontend)
   - `service_role` key → akan jadi `SUPABASE_SERVICE_ROLE_KEY` (⚠️ **rahasia total** — jangan
     pernah taruh di frontend/kode publik; hanya dipakai oleh serverless function di server)
3. **Authentication → Providers**: pastikan **Email** aktif.
4. **Authentication → Settings**: untuk pemakaian internal tim, sebaiknya:
   - Matikan "Allow new users to sign up" (supaya tidak ada pendaftaran publik), atau
   - Biarkan aktif tapi kontrol lewat **Authentication → Users → Invite user** secara manual.
5. Tambahkan akun anggota tim lewat **Authentication → Users → Add user** (isi email + password,
   atau gunakan "Invite" agar mereka mengatur password sendiri lewat email).

Tidak perlu membuat tabel database apa pun — aplikasi ini hanya memakai fitur Auth dari Supabase.

---

## 3. Konfigurasi frontend (URL & anon key)

Buka `public/index.html`, cari blok berikut menjelang penutup `</body>`:

```html
<script>
  window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
  window.SUPABASE_ANON_KEY = "isi-dengan-anon-key-proyek-anda";
</script>
```

Ganti dengan **Project URL** dan **anon public key** dari langkah 2. Kedua nilai ini memang
didesain aman untuk berada di kode sisi-klien — anon key hanya bisa melakukan apa yang
diizinkan kebijakan Supabase Anda (login/refresh token), bukan akses penuh ke data.

> Jangan pernah menaruh `service_role` key di sini atau di file mana pun dalam folder `public/`.

---

## 4. Variabel lingkungan untuk serverless functions

Function di folder `api/` butuh dua variabel rahasia (diset lewat dashboard Vercel, **bukan**
ditulis di kode):

| Variabel | Isi | Sumber |
|---|---|---|
| `SUPABASE_URL` | Project URL Supabase | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (rahasia!) | Project Settings → API |

`requireUser.js` menggunakan kedua nilai ini untuk memverifikasi token sesi yang dikirim
browser di header `Authorization: Bearer <token>` — jadi setiap permintaan ke `/api/...`
benar-benar dicek keasliannya di server, bukan hanya di tampilan.

---

## 5. Deploy ke Vercel

1. Push folder `akuntan-converter/vercel-supabase` ke repository GitHub (bisa privat).
2. Login ke [vercel.com](https://vercel.com) → **Add New → Project** → pilih repo tersebut.
3. Saat konfigurasi:
   - **Root Directory**: arahkan ke `vercel-supabase` (kalau repo berisi kedua varian).
   - **Framework Preset**: pilih "Other" (tidak perlu build step khusus).
   - **Build Command** & **Output Directory**: biarkan kosong/default — Vercel otomatis
     mengenali folder `api/` sebagai serverless functions dan `public/` sebagai static assets.
4. Di bagian **Environment Variables**, tambahkan `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`
   (nilai dari langkah 4 di atas).
5. Klik **Deploy**. Setelah selesai, Vercel memberi URL `https://nama-proyek.vercel.app`
   dengan HTTPS otomatis — ini yang dibagikan ke tim.
6. Setiap kali Anda push perubahan ke branch utama, Vercel otomatis men-deploy ulang.

---

## 6. Cara tim mengakses & menggunakan web ini

1. Buka URL Vercel yang diberikan (`https://nama-proyek.vercel.app`).
2. Masukkan email & password akun yang sudah dibuat di Supabase (langkah 2.5).
3. Setelah login, akan tampil dua tab:
   - **Rapikan Rekening Koran → Excel**: unggah PDF/Excel/CSV/gambar rekening koran,
     pratinjau transaksi, lalu unduh Excel rapi (Tanggal, Deskripsi, Debit, Kredit, Saldo +
     ringkasan total) — deskripsi transaksi yang panjang/multi-baris tetap utuh.
   - **Konversi File Umum**: ubah file ke `.xlsx`, `.csv`, atau `.txt`.
4. Tombol **Keluar** di kanan atas mengakhiri sesi.

Sesi login disimpan oleh Supabase di browser masing-masing pengguna (bukan di server kita),
dan otomatis diperbarui (refresh token) selama mereka aktif.

---

## 7. Catatan & batasan penting di Vercel (terutama paket gratis/Hobby)

- **Batas waktu eksekusi**: `vercel.json` sudah diset `maxDuration: 60` detik. File besar atau
  gambar hasil scan beresolusi tinggi yang diproses OCR (Tesseract) bisa melebihi batas ini,
  terutama di paket gratis yang punya limit lebih ketat. Jika muncul error timeout saat
  memproses gambar, coba unggah hasil scan dalam resolusi lebih kecil, atau gunakan PDF/Excel
  asli jika tersedia.
- **Ukuran file**: batas unggah tetap 25 MB (diatur di `lib/parseUpload.js` & validasi MIME).
- **Tanpa penyimpanan**: setiap function berjalan stateless — file yang diunggah hanya ada
  selama satu permintaan diproses, lalu buffer & file sementara dibuang. Tidak ada riwayat
  konversi yang tersimpan di server (kalau perlu arsip, simpan hasil unduhan di penyimpanan
  internal tim sendiri).
- **OCR lebih lambat dari ekstraksi teks langsung**: untuk hasil terbaik & tercepat, jika
  memungkinkan unggah file PDF/Excel asli (bukan hasil foto/scan).
- **Akurasi parsing**: parser bekerja secara heuristik (mengenali pola tanggal, angka format
  Indonesia, dan kata kunci kolom). Untuk format rekening koran yang tidak umum, selalu
  periksa hasil di tab pratinjau sebelum dipakai untuk pembukuan resmi.

---

## 8. Mengembangkan/menguji secara lokal (opsional)

```bash
npm install
npx vercel dev
```

`vercel dev` menjalankan `api/` sebagai serverless functions dan menyajikan `public/` persis
seperti di production. Pastikan Anda sudah mengisi `SUPABASE_URL` & `SUPABASE_ANON_KEY` di
`public/index.html`, dan menyiapkan `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` lewat
`vercel env pull` atau file `.env.local` (jangan commit file ini ke git).

---

## 9. Mana yang sebaiknya dipakai — varian ini atau varian Render?

| | **Render** (`backend/` + `frontend/`) | **Vercel + Supabase** (folder ini) |
|---|---|---|
| Login tim | Basic Auth (username/password tunggal/tetap) | Supabase Auth (akun individual per anggota tim) |
| Server | Selalu menyala (Express) | Serverless (jalan saat dipanggil) |
| Cocok untuk | Yang ingin server tradisional, kontrol penuh | Yang sudah familiar/punya akun Vercel & Supabase |
| Batas waktu proses | Tidak ada batas ketat | Maks. 60 detik per permintaan (paket gratis lebih ketat) |
| Biaya awal | Gratis (dengan jeda "tidur" setelah 15 menit idle) | Gratis untuk pemakaian ringan |

Kedua varian punya logika konversi & parsing yang **identik** — tinggal pilih sesuai
preferensi infrastruktur tim Anda. Anda bisa mencoba salah satu dulu, lalu pindah ke yang
lain kapan saja karena kode intinya sama.
