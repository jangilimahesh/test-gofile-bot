import axios from "axios";
import FormData from "form-data";
import { sendProgress } from "./progress.js";

function driveDirect(url) {
  const m = url.match(/\/d\/(.+?)\/|id=(.+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1] || m[2]}` : null;
}

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

export default async function handler(req, res) {
  const { drive_url } = req.body;
  const direct = driveDirect(drive_url);

  const server = (await axios.get("https://api.gofile.io/servers"))
    .data.data.servers[0].name;

  const driveRes = await axios.get(direct, {
    responseType: "stream"
  });

  const total = driveRes.headers["content-length"];
  let uploaded = 0;

  driveRes.data.on("data", chunk => {
    uploaded += chunk.length;
    const percent = Math.floor((uploaded / total) * 100);
    sendProgress(percent);
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
    `📤 <b>New Upload</b>\n🔗 ${link}\n\n💙 made with ❤️‍🩹 by ANIME-CRUZE`
  );

  res.json({ success: true, link });
}
