# HexaTok 🎵
Download TikTok tanpa watermark — video HD, slideshow foto, atau MP3.

## Deploy ke Vercel (Gratis)

### Langkah 1 — Upload ke GitHub
1. Buka **github.com** → login akun **raynedvd**
2. Klik tombol **"New"** (buat repo baru)
3. Nama repo: `hexatok`
4. Set ke **Public**
5. Klik **"Create repository"**
6. Upload semua file ini ke repo (drag & drop atau pakai GitHub web editor)

### Langkah 2 — Deploy ke Vercel
1. Buka **vercel.com** → daftar/login dengan akun GitHub kamu
2. Klik **"Add New Project"**
3. Import repo **raynedvd/hexatok**
4. Klik **"Deploy"** — tunggu ~2 menit
5. Vercel akan kasih URL seperti: `https://hexatok-raynedvd.vercel.app`

### Langkah 3 — Update URL API di frontend
1. Buka file `public/index.html`
2. Cari baris: `const API = 'https://hexatok.vercel.app/api/download';`
3. Ganti dengan URL Vercel kamu:
   ```
   const API = 'https://hexatok-raynedvd.vercel.app/api/download';
   ```
4. Commit & push → Vercel otomatis redeploy

## Struktur File
```
hexatok/
├── api/
│   └── download.js      ← Backend serverless (Node.js)
├── public/
│   └── index.html       ← Frontend HexaTok
├── package.json
├── vercel.json
└── README.md
```

## Fitur
- ✅ Download video TikTok tanpa watermark (HD & SD)
- ✅ Download slideshow foto TikTok (semua foto)
- ✅ Download MP3/audio dari video atau slideshow
- ✅ Tidak ada CORS issue (semua lewat backend Vercel)
- ✅ Gratis selamanya (Vercel free tier)

## Powered by
- [tobyg74/tiktok-api-dl](https://github.com/TobyG74/tiktok-api-dl)
- [Vercel](https://vercel.com)
