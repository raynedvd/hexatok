const { Downloader } = require("@tobyg74/tiktok-api-dl");

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // Ambil URL dari query atau body
  const url = req.query.url || (req.body && req.body.url);

  if (!url) {
    return res.status(400).json({
      status: "error",
      message: "Parameter 'url' diperlukan"
    });
  }

  if (!url.includes("tiktok.com")) {
    return res.status(400).json({
      status: "error",
      message: "Hanya mendukung URL dari TikTok"
    });
  }

  try {
    // Coba version 1 dulu (paling stabil)
    let result = await Downloader(url, {
      version: "v1",
      showOriginalResponse: false
    });

    // Kalau v1 gagal, coba v2
    if (!result || result.status === "error") {
      result = await Downloader(url, {
        version: "v2",
        showOriginalResponse: false
      });
    }

    // Kalau v2 juga gagal, coba v3
    if (!result || result.status === "error") {
      result = await Downloader(url, {
        version: "v3",
        showOriginalResponse: false
      });
    }

    if (!result || result.status === "error") {
      return res.status(500).json({
        status: "error",
        message: result?.message || "Gagal mengambil konten TikTok"
      });
    }

    // Normalise response ke format yang konsisten
    const data = result.result;
    const isPhoto = data?.type === "image" || (data?.images && data.images.length > 0);

    const normalised = {
      status  : "ok",
      type    : isPhoto ? "photo" : "video",
      title   : data?.description || data?.desc || data?.title || "",
      author  : {
        nickname  : data?.author?.nickname || data?.author?.username || "TikTok User",
        unique_id : data?.author?.username || data?.author?.unique_id || "user",
        avatar    : data?.author?.avatarLarger || data?.author?.avatar || ""
      },
      cover   : data?.cover?.[0] || data?.dynamicCover?.[0] || data?.thumbnail || "",
      duration: data?.duration || 0,
      // Video URLs
      hd_url  : data?.video?.noWatermark || data?.video?.hdplay || data?.video?.play || null,
      sd_url  : data?.video?.play || data?.video?.watermark || null,
      audio_url: data?.music?.play_url || data?.music?.url || null,
      // Photo/slideshow
      images  : isPhoto
        ? (data?.images || []).map(img => img?.url || img || "").filter(u => u && u.startsWith("http"))
        : null
    };

    return res.status(200).json(normalised);

  } catch (err) {
    console.error("[HexaTok API Error]", err);
    return res.status(500).json({
      status : "error",
      message: err.message || "Internal server error"
    });
  }
};

