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
  if (!url.includes("tiktok.com")) return res.status(400).json({ status: "error", message: "Hanya mendukung URL TikTok" });

  try {
    let result = null;
    for (const version of ["v1", "v2", "v3"]) {
      try {
        const r = await Downloader(url, { version, showOriginalResponse: true });
        if (r && r.status === "success") { result = r; break; }
      } catch(e) { continue; }
    }

    if (!result) return res.status(500).json({ status: "error", message: "Semua versi API gagal" });

    const d = result.result;

    const isPhoto = d?.type === "image" ||
                    (d?.images && d.images.length > 0) ||
                    (d?.image && d.image.length > 0);

    // Berdasarkan raw response yang terlihat:
    // video.playAddr = URL video utama
    // music.playUrl  = URL audio
    // video.cover    = array thumbnail
    const hd_url =
      d?.video?.playAddr ||
      d?.video?.noWatermark ||
      d?.video?.noWatermark2 ||
      d?.video?.hdplay ||
      d?.video?.play ||
      d?.video?.[0] ||
      null;

    const sd_url =
      d?.video?.downloadAddr ||
      d?.video?.watermark ||
      d?.video?.[1] ||
      null;

    const audio_url =
      d?.music?.playUrl ||
      d?.music?.play_url ||
      d?.music?.url ||
      (typeof d?.music === "string" ? d.music : null) ||
      null;

    const cover =
      (Array.isArray(d?.video?.cover) ? d.video.cover[0] : d?.video?.cover) ||
      (Array.isArray(d?.cover) ? d.cover[0] : d?.cover) ||
      d?.dynamicCover?.[0] ||
      null;

    let images = null;
    if (isPhoto) {
      const rawImgs = d?.images || d?.image || [];
      images = rawImgs
        .map(img => img?.url || img?.urlList?.[0] || (typeof img === "string" ? img : null))
        .filter(u => u && u.startsWith("http"));
    }

    return res.status(200).json({
      status   : "ok",
      type     : isPhoto ? "photo" : "video",
      title    : d?.desc || d?.description || d?.title || d?.caption || "",
      author   : {
        nickname : d?.author?.nickname || d?.author?.name || "TikTok User",
        unique_id: d?.author?.username || d?.author?.unique_id || d?.author?.id || "user",
        avatar   : d?.author?.avatarLarger || d?.author?.avatar || d?.author?.avatarThumb || ""
      },
      cover,
      duration : parseInt(d?.duration) || 0,
      hd_url,
      sd_url   : (sd_url && sd_url !== hd_url) ? sd_url : null,
      audio_url: audio_url || null,
      images
    });

  } catch (err) {
    console.error("[HexaTok Error]", err);
    return res.status(500).json({ status: "error", message: err.message || "Internal server error" });
  }
};
