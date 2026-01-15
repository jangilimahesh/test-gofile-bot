import os
import json
import time
import asyncio
import subprocess
import requests
from telegram import Update
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    ContextTypes, filters
)
from requests_toolbelt.multipart.encoder import MultipartEncoder, MultipartEncoderMonitor

# =========================
# 🔐 CONFIG
# =========================
BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# =========================
# 🧹 CLEANUP ON START
# =========================
def cleanup_storage():
    for f in os.listdir(DOWNLOAD_DIR):
        try:
            os.remove(os.path.join(DOWNLOAD_DIR, f))
        except:
            pass

cleanup_storage()

# =========================
# 🌐 GOFILE
# =========================
def get_gofile_server():
    r = requests.get("https://api.gofile.io/servers?zone=default", timeout=10)
    return r.json()["data"]["servers"][0]["name"]

SERVER = get_gofile_server()
UPLOAD_URL = f"https://{SERVER}.gofile.io/uploadFile"
SESSION = requests.Session()

# =========================
# 🧮 HELPERS
# =========================
def human(size):
    for u in ["B","KB","MB","GB","TB"]:
        if size < 1024:
            return f"{size:.2f} {u}"
        size /= 1024

def bar(p):
    filled = int(p / 10)
    return "█" * filled + "░" * (10 - filled)

# =========================
# 🎞️ MEDIA INFO
# =========================
def media_info(path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries",
        "stream=index,codec_type,codec_name,channels,width,height:stream_tags=language",
        "-show_entries", "format=duration",
        "-of", "json", path
    ]
    data = json.loads(subprocess.check_output(cmd))
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    quality = f"{video.get('height','?')}p"
    duration = float(data["format"]["duration"])
    watch = time.strftime("%H:%M:%S", time.gmtime(duration))

    audios = []
    for s in data["streams"]:
        if s["codec_type"] == "audio":
            lang = s.get("tags", {}).get("language", "und").upper()
            codec = s.get("codec_name", "unknown").upper()
            ch = s.get("channels", "?")
            audios.append(f"{lang} • {codec} • {ch}ch")

    return quality, watch, audios

# =========================
# 🚀 START
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🚀 Send me a video or file\n"
        "I’ll upload it to **gofile.io** and return a public link."
    )

# =========================
# 📤 FILE HANDLER
# =========================
async def file_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    status = await update.message.reply_text("⬇️ Downloading…")

    tg = update.message.video or update.message.document
    filename = tg.file_name or f"{tg.file_id}.bin"
    path = os.path.join(DOWNLOAD_DIR, filename)

    try:
        tg_file = await tg.get_file()
        await tg_file.download_to_drive(path)

        size = os.path.getsize(path)
        last_edit = 0
        last_percent = 0

        async def safe_edit(text):
            nonlocal last_edit
            if time.time() - last_edit > 1.2:  # throttle
                last_edit = time.time()
                await status.edit_text(text)

        await safe_edit("🚀 Uploading to gofile.io…")

        def progress_cb(m):
            nonlocal last_percent
            percent = int((m.bytes_read / size) * 100)
            if percent >= last_percent + 5:
                last_percent = percent
                context.application.create_task(
                    safe_edit(
                        f"🚀 Uploading\n"
                        f"[{bar(percent)}] {percent}%"
                    )
                )

        with open(path, "rb") as f:
            encoder = MultipartEncoder(fields={"file": (filename, f)})
            monitor = MultipartEncoderMonitor(encoder, progress_cb)

            r = SESSION.post(
                UPLOAD_URL,
                data=monitor,
                headers={"Content-Type": monitor.content_type},
                timeout=600
            )

        res = r.json()
        if res.get("status") != "ok":
            raise RuntimeError("Upload failed")

        link = res["data"]["downloadPage"]

        try:
            quality, watch, audios = media_info(path)
        except:
            quality, watch, audios = "N/A", "N/A", []

        text = (
            f"✅ **Upload Complete**\n\n"
            f"📦 Size: {human(size)}\n"
            f"📺 Quality: {quality}\n"
            f"⏱ Duration: {watch}\n\n"
        )

        if audios:
            text += "🔊 **Audio Tracks**\n"
            for a in audios:
                text += f"• {a}\n"

        text += f"\n🔗 **Gofile Link**\n{link}"

        await status.edit_text(text, disable_web_page_preview=True)

    except Exception as e:
        await status.edit_text("❌ Upload cancelled or failed")
    finally:
        # 🧹 ALWAYS CLEAN STORAGE
        if os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass

# =========================
# 🤖 MAIN
# =========================
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.VIDEO | filters.Document.ALL, file_handler))

    print("🤖 Bot running…")
    app.run_polling()

if __name__ == "__main__":
    main()
