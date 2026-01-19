import axios from "axios";
import { sendProgress } from "./progress.js";

/* ───────── HELPERS ───────── */

function extractFileId(url) {
  const m =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? (m[1] || m[2]) : null;
}

function driveDirect(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/* ───────── TELEGRAM ───────── */

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

/* ───────── UPNSHARE API ───────── */

const API_BASE = "https://upnshare.com/api/v1/video";

/**
 * Start advanced remote upload
 */
async function startAdvancedUpload(remoteUrl) {
  const res = await axios.post(
    `${API_BASE}/advance-upload`,
    new URLSearchParams({
      api_key: process.env.UPNSHARE_API_KEY,
      url: remoteUrl
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  return res.data;
}

/**
 * Check upload status
 * NOTE: endpoint name may vary slightly; this matches common UpnShare pattern
 */
async function checkStatus(taskId) {
  const res = await axios.get(
    `${API_BASE}/upload-status`,
    {
      params: {
        api_key: process.env.UPNSHARE_API_KEY,
        task_id: taskId
      }
    }
  );
  return res.data;
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

    const remoteURL = driveDirect(fileId);

    // 1️⃣ Start advanced upload
    const start = await startAdvancedUpload(remoteURL);

    if (!start.task_id)
      throw new Error(start.message || "Failed to start upload");

    let status;
    let lastProgress = 0;

    // 2️⃣ Poll progress (every 2 seconds)
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
        // Fallback based on state
        if (status.status === "downloading") sendProgress(50);
        if (status.status === "processing") sendProgress(80);
      }

      if (status.status === "completed") {
        sendProgress(100);
        break;
      }

      if (status.status === "error")
        throw new Error(status.message || "Upload failed");
    }

    if (status.status !== "completed")
      throw new Error("Upload timeout");

    const file = status.file;

    // 3️⃣ Telegram UI mirror
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

    // 4️⃣ Response to frontend
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
      error: err.response?.data || err.message
    });
  }
}