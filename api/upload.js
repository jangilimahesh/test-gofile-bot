import axios from "axios";
import { sendProgress } from "./progress.js";

/* ───── Helpers ───── */

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

const UPNSHARE_API = "https://upnshare.com/api";

/* ───── Telegram ───── */

async function sendTelegram(text, keyboard) {
  await axios.post(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
    {
      chat_id: process.env.LOG_CHANNEL_ID,
      parse_mode: "HTML",
      text,
      reply_markup: keyboard
    }
  );
}

/* ───── UpnShare API ───── */

async function startRemote(url) {
  const r = await axios.post(`${UPNSHARE_API}/remote/upload`, {
    api_key: process.env.UPNSHARE_API_KEY,
    url
  });
  return r.data;
}

async function checkStatus(taskId) {
  const r = await axios.get(`${UPNSHARE_API}/remote/status`, {
    params: {
      api_key: process.env.UPNSHARE_API_KEY,
      task_id: taskId
    }
  });
  return r.data;
}

/* ───── MAIN ───── */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const fileId = extractFileId(req.body.drive_url);
    if (!fileId) throw new Error("Invalid Drive link");

    const remoteURL =
      `https://drive.google.com/uc?export=download&id=${fileId}`;

    const start = await startRemote(remoteURL);
    if (!start.task_id) throw new Error("Remote upload failed");

    let lastProgress = 0;
    let status;

    // Poll UpnShare every 2 seconds
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));
      status = await checkStatus(start.task_id);

      // REAL progress mapping (if supported)
      if (typeof status.progress === "number") {
        if (status.progress !== lastProgress) {
          lastProgress = status.progress;
          sendProgress(lastProgress);
        }
      } else {
        // fallback status-based progress
        if (status.status === "downloading") sendProgress(50);
        if (status.status === "processing") sendProgress(80);
      }

      if (status.status === "completed") {
        sendProgress(100);
        break;
      }

      if (status.status === "error")
        throw new Error(status.message || "Upload error");
    }

    if (status.status !== "completed")
      throw new Error("Upload timeout");

    const file = status.file;

    await sendTelegram(
`📤 <b>Drive → UpnShare Upload</b>

📄 <b>Name:</b> ${file.name}
📦 <b>Size:</b> ${file.size}
🔗 <b>Link:</b>
${file.download_url}

made with ❤️‍🩹 by <b>ANIME-CRUZE</b>`,
      {
        inline_keyboard: [[
          { text: "📥 Download", url: file.download_url }
        ]]
      }
    );

    res.json({
      success: true,
      link: file.download_url,
      name: file.name,
      size: file.size
    });

  } catch (err) {
    sendProgress(0);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}