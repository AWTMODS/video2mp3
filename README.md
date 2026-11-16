# 🎬 Video to MP3 Telegram Bot

A fast, lightweight Telegram bot that converts video files and video documents into MP3 audio. Built with **Node.js**, **Telegraf**, **FFmpeg**, and **Express**.

Supports running **without a VPS** using Webhooks on free cloud hosting platforms like **Render**, **Koyeb**, **Railway**, and **Fly.io**, or running locally via Long Polling.

---

## ✨ Features

- ⚡ **No VPS Required**: Runs on free cloud platforms (Render, Koyeb, Railway) using Webhooks.
- 🔄 **Dual Mode**: Automatically switches between **Webhook** and **Long Polling** based on environment configuration.
- 🎥 **Broad Video Support**: Accepts video messages, video documents (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`), and animations.
- 🧹 **Automatic Cleanup**: Temporary downloaded and converted files are safely removed immediately after processing.
- 🛡️ **Rate Limiting**: Protects your bot from spam and abuse with built-in rate limits.
- 📢 **Optional Force-Join**: Require users to join your Telegram channel before using the bot (leave empty to disable).
- 💓 **Health Check Endpoints**: Built-in `GET /` and `GET /health` endpoints to keep services awake and monitor status.

---

## 🚀 Deploy Without a VPS (Free)

### Option 1: Deploy on Render.com (Recommended - 100% Free)

Render provides a free Web Service with HTTPS that automatically connects to Telegram via Webhook:

1. Push your repository to your GitHub account (or fork it).
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `video2mp3-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   - `BOT_TOKEN`: Your Telegram Bot token from [@BotFather](https://t.me/BotFather).
   - *(Optional)* `REQUIRED_CHANNEL`: e.g. `@your_channel` (leave empty if not needed).
   - *(Optional)* `MAX_FILE_SIZE_MB`: `20`
6. Click **Deploy Web Service**.

> **Note**: Render provides `RENDER_EXTERNAL_URL` automatically. The bot detects this and registers the Telegram Webhook on startup automatically! No manual webhook setup is needed.

#### 💡 Keeping Free Render Alive 24/7
Free services on Render go to sleep after 15 minutes of inactivity. To keep your bot awake 24/7:
1. Create a free account at [cron-job.org](https://cron-job.org/) or [UptimeRobot](https://uptimerobot.com/).
2. Add an HTTP monitor targeting your Render URL (e.g. `https://your-bot.onrender.com/health`) every 10–14 minutes.

---

### Option 2: Deploy on Koyeb / Railway / Fly.io

1. Connect your repository to Koyeb or Railway.
2. Set the environment variables:
   - `BOT_TOKEN`: `your_bot_token`
   - `WEBHOOK_URL`: `https://your-app-domain.koyeb.app` (your public HTTPS URL)
3. The bot will automatically bind to the specified URL and register the Telegram webhook.

---

## 💻 Running Locally

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer
- [Git](https://git-scm.com/)

### 2. Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd videotomp3bot

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
```

Edit `.env` and insert your `BOT_TOKEN`:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
```

### 3. Run with Long Polling (Local Test)
Leave `WEBHOOK_URL` empty in `.env`:
```bash
npm start
```

### 4. Run with Webhooks Locally (Using Localtunnel or ngrok)
1. Start a tunnel:
   ```bash
   npx localtunnel --port 3000
   ```
2. Copy the generated `https://....loca.lt` URL.
3. In `.env`, set:
   ```env
   WEBHOOK_URL=https://your-subdomain.loca.lt
   ```
4. Start the bot:
   ```bash
   npm start
   ```

---

## ⚙️ Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | **Yes** | — | Telegram Bot token from [@BotFather](https://t.me/BotFather) |
| `PORT` | No | `3000` | Port for the web server / health check endpoint |
| `WEBHOOK_URL` | No | `""` | Public HTTPS domain for Telegram webhook (auto-detected on Render) |
| `REQUIRED_CHANNEL`| No | `""` | Telegram channel username (e.g. `@mychannel`) users must join |
| `MAX_FILE_SIZE_MB`| No | `20` | Max file size in MB (Telegram standard limit is 20MB) |
| `CUSTOM_CAPTION` | No | Default caption | Custom caption attached to sent MP3 audio |
| `TEMP_DIR` | No | OS temp dir | Directory used for temporary processing files |

---

## 📄 License
ISC
