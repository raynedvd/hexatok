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

  try {
    // Coba v1 dulu, fallback v2/v3
    let result = null;
    for (const version of ["v1", "v2", "v3"]) {
      try {
        const r = await Downloader(url, { version });
        if (r && r.status === "success") { result = r; break; }
      } catch(e) { continue; }
    }

    if (!result) return res.status(500).json({ status: "error", message: "Semua versi API gagal" });

    const d = result.result;

    // Dari debug raw:
    // v1: d.video = array URL strings ["url1", "url2", ...]
    //     d.music = { playUrl: "..." }
    //     d.author = { nickname, uniqueId, avatarThumb, ... }
    //     d.desc = judul
    //     d.cover = array URL strings
    //     d.images = array (untuk slideshow)

    const isPhoto = d?.type === "image" ||
                    (Array.isArray(d?.images) && d.images.length > 0);

    // Video: d.video adalah ARRAY
    const videoArr = Array.isArray(d?.video) ? d.video : [];
    const hd_url   = videoArr[0] || null;
    const sd_url   = videoArr[1] && videoArr[1] !== hd_url ? videoArr[1] : null;

    // Audio: d.music.playUrl
    const audio_url = d?.music?.playUrl || d?.music?.play_url || null;

    // Cover: d.cover adalah ARRAY
    const coverArr = Array.isArray(d?.cover) ? d.cover : [];
    const cover    = coverArr[0] || null;

    // Author
    const author = {
      nickname : d?.author?.nickname || "TikTok User",
      unique_id: d?.author?.uniqueId || d?.author?.unique_id || "user",
      avatar   : d?.author?.avatarThumb || d?.author?.avatarMedium || d?.author?.avatarLarger || ""
    };

    // Images untuk slideshow
    let images = null;
    if (isPhoto && Array.isArray(d?.images)) {
      images = d.images
        .map(img => typeof img === "string" ? img : (img?.url || img?.urlList?.[0] || null))
        .filter(u => u && u.startsWith("http"));
    }

    return res.status(200).json({
      status   : "ok",
      type     : isPhoto ? "photo" : "video",
      title    : d?.desc || d?.description || d?.title || "",
      author,
      cover,
      duration : parseInt(d?.duration) || 0,
      hd_url,
      sd_url,
      audio_url,
      images
    });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
