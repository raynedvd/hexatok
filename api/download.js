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
    // Coba semua versi, return RAW semua supaya bisa debug
    const results = {};
    for (const version of ["v1", "v2", "v3"]) {
      try {
        const r = await Downloader(url, { version });
        results[version] = r;
      } catch(e) {
        results[version] = { error: e.message };
      }
    }

    return res.status(200).json({ debug: true, results });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
