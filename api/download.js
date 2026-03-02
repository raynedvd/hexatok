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

  // MODE: proxy gambar supaya tidak kena hotlink block
  // /api/download?proxy=1&url=https://...
  if (req.query.proxy === "1" && req.query.url?.startsWith("http")) {
    try {
      const fetch = (await import("node-fetch")).default;
      const imgRes = await fetch(req.query.url, {
        headers: {
          "Referer": "https://www.tiktok.com/",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      });
      res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return imgRes.body.pipe(res);
    } catch(e) {
      return res.status(500).end();
    }
  }

  try {
    let result = null;
    let usedVersion = null;

    for (const version of ["v1", "v2", "v3"]) {
      try {
        const r = await Downloader(url, { version });
        if (r && r.status === "success") {
          result = r;
          usedVersion = version;
          break;
        }
      } catch(e) { continue; }
    }

    if (!result) return res.status(500).json({ status: "error", message: "Semua versi API gagal" });

    const d = result.result;

    const isPhoto = d?.type === "image" ||
                    (Array.isArray(d?.images) && d.images.length > 0);

    // Video URLs — v1 return array, v2/v3 return object
    let hd_url = null, sd_url = null;

    if (Array.isArray(d?.video)) {
      // v1 format: array of URLs
      hd_url = d.video[0] || null;
      sd_url = d.video[1] && d.video[1] !== hd_url ? d.video[1] : null;
    } else if (d?.video && typeof d.video === "object") {
      // v2/v3 format: object dengan fields
      hd_url = d.video.noWatermark || d.video.noWatermark2 ||
               d.video.hdplay || d.video.playAddr || d.video.play || null;
      sd_url = d.video.watermark || d.video.downloadAddr || null;
      if (sd_url === hd_url) sd_url = null;
    }

    // Audio
    const audio_url = d?.music?.playUrl || d?.music?.play_url ||
                      d?.music?.url || null;

    // Cover — v1 return array
    const coverRaw = Array.isArray(d?.cover) ? d.cover[0] :
                     (d?.cover || d?.video?.cover || null);

    // Proxy URL gambar supaya tidak kena hotlink
    const BASE = `https://${req.headers.host}`;
    const proxyCover = coverRaw
      ? `${BASE}/api/download?proxy=1&url=${encodeURIComponent(coverRaw)}`
      : null;

    // Author
    const avatarRaw = d?.author?.avatarThumb || d?.author?.avatarMedium ||
                      d?.author?.avatarLarger || d?.author?.avatar || null;
    const proxyAvatar = avatarRaw
      ? `${BASE}/api/download?proxy=1&url=${encodeURIComponent(avatarRaw)}`
      : null;

    // Images slideshow
    let images = null;
    if (isPhoto && Array.isArray(d?.images)) {
      images = d.images
        .map(img => typeof img === "string" ? img : (img?.url || img?.urlList?.[0] || null))
        .filter(Boolean)
        .map(imgUrl => `${BASE}/api/download?proxy=1&url=${encodeURIComponent(imgUrl)}`);
    }

    return res.status(200).json({
      status   : "ok",
      type     : isPhoto ? "photo" : "video",
      title    : d?.desc || d?.description || d?.title || "",
      author   : {
        nickname : d?.author?.nickname || "TikTok User",
        unique_id: d?.author?.uniqueId || d?.author?.unique_id || "user",
        avatar   : proxyAvatar
      },
      cover    : proxyCover,
      duration : parseInt(d?.duration) || 0,
      hd_url,
      sd_url,
      audio_url,
      images,
      _version : usedVersion
    });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
