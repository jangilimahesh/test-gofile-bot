import axios from "axios";

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function formatSize(bytes) {
  if (!bytes) return "Unknown";
  const u = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + u[i];
}

export default async function handler(req, res) {
  try {
    const fileId = extractFileId(req.query.url);
    if (!fileId) throw new Error("Invalid Drive URL");

    const meta = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        params: {
          alt: "json",
          fields: "name,size"
        },
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_DRIVE_TOKEN}`
        }
      }
    );

    res.json({
      fileName: meta.data.name,
      fileSize: formatSize(meta.data.size)
    });

  } catch {
    res.status(500).json({ error: "Unable to detect file info" });
  }
}