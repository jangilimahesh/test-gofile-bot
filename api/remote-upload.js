import axios from "axios";
import FormData from "form-data";

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function driveDirect(fileId) {
  // IMPORTANT: this bypasses the virus warning page
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const fileId = extractFileId(req.body.drive_url);
    if (!fileId)
      return res.status(400).json({ error: "Invalid Drive link" });

    // 1️⃣ Get Gofile server
    const server =
      (await axios.get("https://api.gofile.io/servers"))
        .data.data.servers[0].name;

    // 2️⃣ Multipart form (REQUIRED)
    const form = new FormData();
    form.append("fileUrl", driveDirect(fileId));

    // 3️⃣ Start remote upload
    const r = await axios.post(
      `https://${server}.gofile.io/uploadFile`,
      form,
      { headers: form.getHeaders() }
    );

    if (r.data.status !== "ok") {
      throw new Error("Gofile rejected remote URL");
    }

    res.json({
      jobId: r.data.data.jobId,
      server
    });

  } catch (err) {
    console.error("REMOTE UPLOAD ERROR:", err.message);
    res.status(500).json({
      error: "Remote upload failed",
      details: err.message
    });
  }
}