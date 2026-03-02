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

  // Proxy mode untuk gambar
  if (req.query.proxy === "1" && url.startsWith("http")) {
    try {
      const https = require("https");
      const http  = require("http");
      const imgUrl = new URL(url);
      const client = imgUrl.protocol === "https:" ? https : http;
      client.get(url, {
        headers: {
          "Referer": "https://www.tiktok.com/",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      }, (imgRes) => {
        res.setHeader("Content-Type", imgRes.headers["content-type"] || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        imgRes.pipe(res);
      }).on("error", () => res.status(500).end());
      return;
    } catch(e) { return res.status(500).end(); }
  }

  try {
    // Jalankan semua versi paralel
    const tryAll = await Promise.allSettled(
      ["v1", "v2", "v3"].map(v =>
        Downloader(url, { version: v }).catch(e => ({ status: "error", _err: e.message }))
      )
    );

    // DEBUG mode — return semua raw data
    if (req.query.debug === "1") {
      return res.status(200).json({
        debug: true,
        v1: tryAll[0].value ?? tryAll[0].reason,
        v2: tryAll[1].value ?? tryAll[1].reason,
        v3: tryAll[2].value ?? tryAll[2].reason,
      });
    }

    const results = tryAll
      .filter(r => r.status === "fulfilled" && r.value?.status === "success")
      .map(r => r.value.result);

    if (results.length === 0)
      return res.status(500).json({ status: "error", message: "Semua versi API gagal. Coba lagi nanti." });

    const merge = (fn) => { for (const d of results) { const v = fn(d); if (v) return v; } return null; };

    const isPhoto = results.some(d =>
      d?.type === "image" || (Array.isArray(d?.images) && d.images.length > 0)
    );

    const hd_url = merge(d => {
      if (Array.isArray(d?.video)) return d.video[0];
      if (d?.video && typeof d.video === "object")
        return d.video.noWatermark || d.video.noWatermark2 || d.video.hdplay || d.video.playAddr || d.video.play;
    });

    const sd_raw = merge(d => {
      if (Array.isArray(d?.video)) return d.video[1];
      if (d?.video && typeof d.video === "object") return d.video.watermark || d.video.downloadAddr;
    });

    // Audio — coba semua field yang mungkin ada
    const audio_url = merge(d => {
      // Cek string langsung
      if (typeof d?.music === "string" && d.music.startsWith("http")) return d.music;
      // Cek object fields
      const m = d?.music;
      if (!m || typeof m !== "object") return null;
      return m.playUrl || m.play_url || m.playurl || m.url ||
             m.play || m.src || m.downloadUrl || m.download_url ||
             // Kadang nested
             m.musicInfo?.playUrl || m.musicInfo?.url ||
             null;
    });

    const coverRaw = merge(d => {
      if (Array.isArray(d?.cover) && d.cover[0]) return d.cover[0];
      if (typeof d?.cover === "string" && d.cover.startsWith("http")) return d.cover;
      if (Array.isArray(d?.video?.cover) && d.video.cover[0]) return d.video.cover[0];
      if (typeof d?.video?.cover === "string") return d.video.cover;
      if (Array.isArray(d?.dynamicCover) && d.dynamicCover[0]) return d.dynamicCover[0];
      if (Array.isArray(d?.originCover) && d.originCover[0]) return d.originCover[0];
    });

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
