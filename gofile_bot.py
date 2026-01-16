import re
import time
import requests
from bs4 import BeautifulSoup
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup
)
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters
)
from telegram.request import HTTPXRequest
from telegram.ext.webhookhandler import WebhookHandler
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import threading
import os

# =========================
# CONFIG (ENV VARIABLES)
# =========================
BOT_TOKEN = os.environ.get("BOT_TOKEN")
WEBHOOK_URL = os.environ.get("WEBHOOK_URL")  # https://your-app.leapcell.app

EDIT_DELAY = 2

FILE_RE = re.compile(r"/file/d/([a-zA-Z0-9_-]+)")
FOLDER_RE = re.compile(r"/folders/([a-zA-Z0-9_-]+)")

# =========================
# GOFILE
# =========================
def get_gofile_server():
    return requests.get(
        "https://api.gofile.io/servers?zone=default",
        timeout=10
    ).json()["data"]["servers"][0]["name"]

# =========================
# GOOGLE DRIVE
# =========================
def drive_direct_link(fid):
    return f"https://drive.google.com/uc?id={fid}&export=download"

def get_drive_filename(fid):
    html = requests.get(
        f"https://drive.google.com/file/d/{fid}/view",
        timeout=10
    ).text
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("meta", property="og:title")
    return tag["content"] if tag else fid

def list_drive_folder(folder_id):
    html = requests.get(
        f"https://drive.google.com/drive/folders/{folder_id}",
        timeout=10
    ).text
    ids = re.findall(r'"([a-zA-Z0-9_-]{20,})"', html)
    return list(dict.fromkeys([i for i in ids if i != folder_id]))

# =========================
# STREAM UPLOAD
# =========================
def stream_to_gofile(direct_url, filename, progress_cb):
    server = get_gofile_server()
    upload_url = f"https://{server}.gofile.io/uploadFile"

    with requests.get(direct_url, stream=True) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        sent = 0

        def gen():
            nonlocal sent
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    sent += len(chunk)
                    if total:
                        progress_cb(sent, total)
                    yield chunk

        res = requests.post(
            upload_url,
            files={"file": (filename, gen())},
            timeout=0
        ).json()

        return res["data"]["downloadPage"]

# =========================
# BOT HANDLERS
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📤 Send a PUBLIC Google Drive FILE or FOLDER link\n\n"
        "✔ Remote upload\n"
        "✔ No local storage\n"
        "✔ Per-file progress"
    )

async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()

    file_m = FILE_RE.search(text)
    folder_m = FOLDER_RE.search(text)

    if not (file_m or folder_m):
        return await update.message.reply_text("❌ Only public Drive links supported")

    status = await update.message.reply_text("🔍 Processing…")

    try:
        if file_m:
            await process_file(file_m.group(1), status, context)
        else:
            fids = list_drive_folder(folder_m.group(1))
            if not fids:
                return await status.edit_text("❌ Folder empty")

            for i, fid in enumerate(fids, 1):
                await process_file(fid, status, context, i, len(fids))

    except Exception as e:
        await status.edit_text(f"❌ Error: {e}")

async def process_file(fid, status, context, idx=None, total=None):
    name = get_drive_filename(fid)
    direct = drive_direct_link(fid)
    last = 0

    def progress(sent, total_bytes):
        nonlocal last
        now = time.time()
        if now - last > EDIT_DELAY:
            pct = sent * 100 / total_bytes
            text = f"📤 Uploading\n📄 {name}\n📊 {pct:.2f}%"
            if idx:
                text = f"({idx}/{total})\n" + text
            context.application.create_task(status.edit_text(text))
            last = now

    gofile = stream_to_gofile(direct, name, progress)
    ddl = f"https://gofile.dd-bypassed.workers.dev/url={gofile}"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("GOFILE", url=gofile)],
        [InlineKeyboardButton("Direct DDL", url=ddl)]
    ])

    text = f"✅ <b>{name}</b>\nUpload completed"
    if idx:
        text = f"({idx}/{total})\n" + text

    await status.edit_text(
        text,
        parse_mode="HTML",
        reply_markup=keyboard,
        disable_web_page_preview=True
    )

# =========================
# WEBHOOK SERVER
# =========================
class Webhook(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length)
        update = Update.de_json(json.loads(body), app.bot)
        app.update_queue.put_nowait(update)
        self.send_response(200)
        self.end_headers()

# =========================
# APP INIT
# =========================
request = HTTPXRequest(connection_pool_size=8)
app: Application = (
    ApplicationBuilder()
    .token(BOT_TOKEN)
    .request(request)
    .build()
)

app.add_handler(CommandHandler("start", start))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_link))

def run():
    app.run_webhook(
        listen="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        webhook_url=WEBHOOK_URL
    )

if __name__ == "__main__":
    run()