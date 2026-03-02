const { Downloader } = require("@tobyg74/tiktok-api-dl");
const https = require("https");
const http  = require("http");

// Helper: HTTP GET dengan promise
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Referer": "https://www.tiktok.com/",
        ...headers
      },
      timeout: 8000
    }, res => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, headers));
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// Resolve short URL ke URL panjang
async function resolveUrl(url) {
  try {
    const r = await httpGet(url);
    // Ambil dari redirect chain atau cek location
    return r.headers?.["x-final-url"] || url;
  } catch(e) { return url; }
}

// Scrape cover & music langsung dari halaman TikTok (fallback)
async function scrapeFromPage(tiktokUrl) {
  try {
    // Resolve short URL dulu
    const resolved = await resolveUrl(tiktokUrl);
    const r = await httpGet(resolved, { "Accept": "text/html,application/xhtml+xml" });
    if (r.status !== 200) return {};

    const html = r.body;

    // Ambil JSON dari __UNIVERSAL_DATA_FOR_REHYDRATION__ atau SIGI_STATE
    let json = null;
    const m1 = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m1) { try { json = JSON.parse(m1[1]); } catch(e) {} }

    if (!json) {
      const m2 = html.match(/window\['SIGI_STATE'\]\s*=\s*(\{[\s\S]*?\});\s*window\[/);
      if (m2) { try { json = JSON.parse(m2[1]); } catch(e) {} }
    }

    if (!json) return {};

    // Cari video detail di dalam JSON
    let videoData = null;
    const findVideo = (obj, depth = 0) => {
      if (depth > 8 || !obj || typeof obj !== "object") return;
      if (obj.video && obj.music && obj.author) { videoData = obj; return; }
      for (const k of Object.keys(obj)) findVideo(obj[k], depth + 1);
    };
    findVideo(json);

    if (!videoData) return {};

    // Ambil cover
    const cover =
      videoData.video?.cover ||
      videoData.video?.dynamicCover ||
      videoData.video?.originCover ||
      null;

    // Ambil music
    const music = videoData.music || null;
    const audio_url =
      music?.playUrl || music?.play_url || music?.url || null;

    // Ambil cover dari music juga (album art)
    const musicCover = music?.coverLarge || music?.coverMedium || null;

    return {
      cover: cover || null,
      audio_url: audio_url || null,
      music_title: music?.title || null,
      music_author: music?.authorName || null,
      music_cover: musicCover || null
    };
  } catch(e) {
    console.error("[scrape error]", e.message);
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const url = req.query.url || (req.body && req.body.url);
  if (!url) return res.status(400).json({ status: "error", message: "Parameter 'url' diperlukan" });

  // Proxy mode gambar
  if (req.query.proxy === "1" && url.startsWith("http")) {
    try {
      const client = url.startsWith("https") ? https : http;
      client.get(url, {
        headers: {
          "Referer": "https://www.tiktok.com/",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      }, imgRes => {
        res.setHeader("Content-Type", imgRes.headers["content-type"] || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        imgRes.pipe(res);
      }).on("error", () => res.status(500).end());
    } catch(e) { res.status(500).end(); }
    return;
  }

  try {
    // Jalankan semua versi paralel
    const tryAll = await Promise.allSettled(
      ["v1", "v2", "v3"].map(v =>
        Downloader(url, { version: v }).catch(e => ({ status: "error" }))
      )
    );

    if (req.query.debug === "1") {
      return res.status(200).json({
        debug: true,
        v1: tryAll[0].value, v2: tryAll[1].value, v3: tryAll[2].value
      });
    }

    const results = tryAll
      .filter(r => r.status === "fulfilled" && r.value?.status === "success")
      .map(r => r.value.result);

    if (results.length === 0)
      return res.status(500).json({ status: "error", message: "Semua versi API gagal." });

    const merge = (fn) => { for (const d of results) { const v = fn(d); if (v) return v; } return null; };

    const isPhoto = results.some(d =>
      d?.type === "image" || (Array.isArray(d?.images) && d.images.length > 0)
    );

    // Video URL
    const hd_url = merge(d => {
      if (Array.isArray(d?.video)) return d.video[0];
      if (d?.video && typeof d.video === "object")
        return d.video.noWatermark || d.video.noWatermark2 ||
               d.video.hdplay || d.video.playAddr || d.video.play;
    });

    const sd_raw = merge(d => {
      if (Array.isArray(d?.video)) return d.video[1];
      if (d?.video && typeof d.video === "object") return d.video.watermark || d.video.downloadAddr;
    });

    // Audio dari library
    let audio_url = merge(d => {
      if (typeof d?.music === "string" && d.music.startsWith("http")) return d.music;
      const m = d?.music;
      if (!m || typeof m !== "object") return null;
      return m.playUrl || m.play_url || m.playurl || m.url ||
             m.play || m.src || m.downloadUrl || m.download_url ||
             m.musicInfo?.playUrl || null;
    });

    // Cover dari library
    let coverRaw = merge(d => {
      if (Array.isArray(d?.cover) && d.cover[0]) return d.cover[0];
      if (typeof d?.cover === "string" && d.cover.startsWith("http")) return d.cover;
      if (Array.isArray(d?.video?.cover) && d.video.cover[0]) return d.video.cover[0];
      if (typeof d?.video?.cover === "string" && d.video.cover.startsWith("http")) return d.video.cover;
      if (Array.isArray(d?.dynamicCover) && d.dynamicCover[0]) return d.dynamicCover[0];
      if (Array.isArray(d?.originCover) && d.originCover[0]) return d.originCover[0];
    });

    // Kalau cover atau audio masih null → scrape dari halaman TikTok
    if (!coverRaw || !audio_url) {
      console.log("[HexaTok] Fallback scraping for cover/audio...");
      const scraped = await scrapeFromPage(url);
      if (!coverRaw && scraped.cover) coverRaw = scraped.cover;
      if (!audio_url && scraped.audio_url) audio_url = scraped.audio_url;
    }

    const avatarRaw = merge(d =>
      d?.author?.avatarThumb || d?.author?.avatarMedium ||
      d?.author?.avatarLarger || d?.author?.avatar
    );

    const BASE = `https://${req.headers.host}`;
    const px = u => u ? `${BASE}/api/download?proxy=1&url=${encodeURIComponent(u)}` : null;

    let images = null;
    if (isPhoto) {
      const rawImgs = merge(d => Array.isArray(d?.images) && d.images.length > 0 ? d.images : null) || [];
      images = rawImgs
        .map(img => typeof img === "string" ? img : (img?.url || img?.urlList?.[0] || null))
        .filter(Boolean).map(px);
    }

    return res.status(200).json({
      status   : "ok",
      type     : isPhoto ? "photo" : "video",
      title    : merge(d => d?.desc || d?.description || d?.title || d?.caption) || "",
      author   : {
        nickname : merge(d => d?.author?.nickname || d?.author?.name) || "TikTok User",
        unique_id: merge(d => d?.author?.uniqueId || d?.author?.unique_id) || "user",
        avatar   : px(avatarRaw)
      },
      cover    : px(coverRaw),
      duration : merge(d => parseInt(d?.duration) || 0) || 0,
      hd_url,
      sd_url   : sd_raw && sd_raw !== hd_url ? sd_raw : null,
      audio_url,
      images
    });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
