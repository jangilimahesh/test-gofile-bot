import axios from "axios";
import FormData from "form-data";

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function driveDirect(fileId) {
  // No auth, no cookies, best possible public URL
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const fileId = extractFileId(req.body.drive_url);
    if (!fileId)
      return res.status(400).json({ error: "Invalid Drive link" });

    // Get Gofile server
    const server =
      (await axios.get("https://api.gofile.io/servers"))
        .data.data.servers[0].name;

    // Multipart form (required)
    const form = new FormData();
    form.append("fileUrl", driveDirect(fileId));

    const r = await axios.post(
      `https://${server}.gofile.io/uploadFile`,
      form,
      { headers: form.getHeaders() }
    );

    if (r.data.status !== "ok") {
      return res.status(400).json({
        error: "Gofile rejected the URL",
        reason: r.data
      });
    }

    res.json({
      jobId: r.data.data.jobId,
      server
    });

  } catch (err) {
    res.status(500).json({
      error: "Remote upload failed",
      details: err.message
    });
  }
}