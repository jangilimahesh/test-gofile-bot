import axios from "axios";
import FormData from "form-data";
import { sendProgress } from "./progress.js";

/* ───────── GOOGLE DRIVE FIX ───────── */

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

async function getDriveStream(fileId) {
  const base = "https://drive.google.com/uc?export=download";

  // First request (may return warning page)
  const res1 = await axios.get(base, {
    params: { id: fileId },
    responseType: "stream",
    validateStatus: () => true
  });

  const cookies = res1.headers["set-cookie"] || [];
  const warn = cookies.find(c => c.includes("download_warning"));

  // Small file → direct stream
  if (!warn) return res1;

  // Large file → confirm token
  const confirm = warn.split(";")[0].split("=")[1];

  return axios.get(base, {
    params: { id: fileId, confirm },
    responseType: "stream"
  });
}

/* ───────── TELEGRAM ───────── */

async function sendTelegram(text) {
  await axios.post(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
    {
      chat_id: process.env.LOG_CHANNEL_ID,
      text,
      parse_mode: "HTML"
    }
  );
}

/* ───────── MAIN HANDLER ───────── */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const { drive_url } = req.body;
    const fileId = extractFileId(drive_url);

    if (!fileId)
      return res.status(400).json({ error: "Invalid Drive link" });

    // Get Gofile server
    const server = (await axios.get("https://api.gofile.io/servers"))
      .data.data.servers[0].name;

    // Get REAL file stream
    const driveRes = await getDriveStream(fileId);

    // Safety check (prevents HTML uploads)
    if (driveRes.headers["content-type"]?.includes("text/html")) {
      throw new Error("Google Drive returned HTML, not file");
    }

    const total = Number(driveRes.headers["content-length"] || 0);
    let uploaded = 0;

    driveRes.data.on("data", chunk => {
      uploaded += chunk.length;
      if (total) {
        sendProgress(Math.floor((uploaded / total) * 100));
      }
    });

    const form = new FormData();
    form.append("file", driveRes.data);

    const up = await axios.post(
      `https://${server}.gofile.io/uploadFile`,
      form,
      { headers: form.getHeaders() }
    );

    const link = up.data.data.downloadPage;

    await sendTelegram(
      `📤 <b>New Upload</b>\n🔗 ${link}\n\nmade with ❤️‍🩹 by <b>ANIME-CRUZE</b>`
    );

    res.json({ success: true, link });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
