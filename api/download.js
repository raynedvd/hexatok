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
    // Coba semua versi, ambil yang berhasil
    let result = null;
    for (const version of ["v1", "v2", "v3"]) {
      try {
        const r = await Downloader(url, { version, showOriginalResponse: true });
        if (r && r.status === "success") {
          result = r;
          break;
        }
      } catch(e) {
        continue;
      }
    }

    if (!result) return res.status(500).json({ status: "error", message: "Semua versi API gagal" });

    const d = result.result;

    // Log raw untuk debug (lihat di Vercel dashboard)
    console.log("RAW RESULT:", JSON.stringify(d, null, 2));

    // Deteksi tipe konten
    const isPhoto = d?.type === "image" ||
                    (d?.images && d.images.length > 0) ||
                    (d?.image && d.image.length > 0);

    // Ekstrak video URL — coba semua kemungkinan field dari tobyg74/tiktok-api-dl
    const hd_url =
      d?.video?.[0] ||                    // v1: array
      d?.video?.noWatermark ||            // v2/v3
      d?.video?.noWatermark2 ||
      d?.video?.hdplay ||
      d?.video?.play ||
      d?.nwm_video_url_HQ ||
      d?.nwm_video_url ||
      d?.play ||
      null;

    const sd_url =
      d?.video?.[1] ||                    // v1: array index 1
      d?.video?.watermark ||
      d?.video?.play ||
      d?.wmplay ||
      null;

    // Ekstrak audio URL
    const audio_url =
      d?.music?.play_url ||
      d?.music?.url ||
      d?.music?.[0] ||
      d?.music ||
      null;

    // Ekstrak cover/thumbnail
    const cover =
      d?.cover?.[0] ||
      d?.cover ||
      d?.dynamicCover?.[0] ||
      d?.thumbnail ||
      d?.video?.cover ||
      null;

    // Ekstrak images untuk slideshow
    let images = null;
    if (isPhoto) {
      const rawImgs = d?.images || d?.image || [];
      images = rawImgs
        .map(img => img?.url || img?.urlList?.[0] || (typeof img === "string" ? img : null))
        .filter(u => u && u.startsWith("http"));
    }

    const normalised = {
      status   : "ok",
      type     : isPhoto ? "photo" : "video",
      title    : d?.description || d?.desc || d?.title || d?.caption || "",
      author   : {
        nickname : d?.author?.nickname || d?.author?.name || d?.creator || "TikTok User",
        unique_id: d?.author?.username || d?.author?.unique_id || d?.author?.id || "user",
        avatar   : d?.author?.avatarLarger || d?.author?.avatar || d?.author?.avatarThumb || ""
      },
      cover,
      duration : parseInt(d?.duration) || 0,
      hd_url,
      sd_url   : sd_url !== hd_url ? sd_url : null,
      audio_url: typeof audio_url === "string" ? audio_url : null,
      images,
      // Kirim raw juga untuk debug di frontend
      _raw     : d
    };

    return res.status(200).json(normalised);

  } catch (err) {
    console.error("[HexaTok Error]", err);
    return res.status(500).json({ status: "error", message: err.message || "Internal server error" });
  }
};
