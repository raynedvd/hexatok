const { Downloader } = require("@tobyg74/tiktok-api-dl");

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

  // Proxy mode untuk gambar (bypass hotlink)
  if (req.query.proxy === "1" && req.query.url?.startsWith("http")) {
    try {
      const https = require("https");
      const http  = require("http");
      const imgUrl = new URL(req.query.url);
      const client = imgUrl.protocol === "https:" ? https : http;
      const imgReq = client.get(req.query.url, {
        headers: {
          "Referer": "https://www.tiktok.com/",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      }, (imgRes) => {
        res.setHeader("Content-Type", imgRes.headers["content-type"] || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        imgRes.pipe(res);
      });
      imgReq.on("error", () => res.status(500).end());
      return;
    } catch(e) {
      return res.status(500).end();
    }
  }

  try {
    // Jalankan SEMUA versi paralel, lalu gabungkan hasilnya
    const tryAll = await Promise.allSettled(
      ["v1", "v2", "v3"].map(version =>
        Downloader(url, { version }).catch(e => ({ status: "error", _err: e.message }))
      )
    );

    // Ambil semua yang berhasil
    const results = tryAll
      .filter(r => r.status === "fulfilled" && r.value?.status === "success")
      .map(r => r.value.result);

    if (results.length === 0) {
      return res.status(500).json({ status: "error", message: "Semua versi API gagal. Coba lagi nanti." });
    }

    // Gabungkan — ambil field terbaik dari semua versi
    const merge = (fn) => {
      for (const d of results) {
        const val = fn(d);
        if (val) return val;
      }
      return null;
    };

    const d0 = results[0]; // versi utama

    const isPhoto = results.some(d =>
      d?.type === "image" ||
      (Array.isArray(d?.images) && d.images.length > 0)
    );

    // Video URL — v1 return array, v2/v3 return object
    const hd_url = merge(d => {
      if (Array.isArray(d?.video)) return d.video[0];
      if (d?.video && typeof d.video === "object") {
        return d.video.noWatermark || d.video.noWatermark2 ||
               d.video.hdplay || d.video.playAddr || d.video.play;
      }
      return null;
    });

    const sd_url_raw = merge(d => {
      if (Array.isArray(d?.video)) return d.video[1];
      if (d?.video && typeof d.video === "object") {
        return d.video.watermark || d.video.downloadAddr;
      }
      return null;
    });
    const sd_url = sd_url_raw && sd_url_raw !== hd_url ? sd_url_raw : null;

    // Audio — coba semua kemungkinan field
    const audio_url = merge(d => {
      if (typeof d?.music === "string" && d.music.startsWith("http")) return d.music;
      return d?.music?.playUrl || d?.music?.play_url ||
             d?.music?.url || d?.music?.playurl || null;
    });

    // Cover
    const coverRaw = merge(d => {
      if (Array.isArray(d?.cover)) return d.cover[0];
      if (typeof d?.cover === "string" && d.cover.startsWith("http")) return d.cover;
      if (Array.isArray(d?.video?.cover)) return d.video.cover[0];
      if (typeof d?.video?.cover === "string") return d.video.cover;
      if (Array.isArray(d?.dynamicCover)) return d.dynamicCover[0];
      return null;
    });

    // Avatar
    const avatarRaw = merge(d =>
      d?.author?.avatarThumb || d?.author?.avatarMedium ||
      d?.author?.avatarLarger || d?.author?.avatar || null
    );

    // Proxy helper
    const BASE = `https://${req.headers.host}`;
    const px = (u) => u ? `${BASE}/api/download?proxy=1&url=${encodeURIComponent(u)}` : null;

    // Images slideshow
    let images = null;
    if (isPhoto) {
      const rawImgs = merge(d =>
        Array.isArray(d?.images) && d.images.length > 0 ? d.images : null
      ) || [];
      images = rawImgs
        .map(img => typeof img === "string" ? img : (img?.url || img?.urlList?.[0] || null))
        .filter(Boolean)
        .map(px);
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
      duration : merge(d => parseInt(d?.duration)) || 0,
      hd_url,
      sd_url,
      audio_url,
      images
    });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
