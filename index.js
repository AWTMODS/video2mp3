import { Telegraf, Markup } from 'telegraf';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import path from 'path';
import express from 'express';
import rateLimit from 'telegraf-ratelimit';
import dotenv from 'dotenv';

dotenv.config();

// Configure ffmpeg static binary path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN is missing in environment variables.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
// Render provides RENDER_EXTERNAL_URL automatically (e.g. https://service.onrender.com)
const RAW_WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '';
const WEBHOOK_URL = RAW_WEBHOOK_URL.replace(/\/+$/, '');
const REQUIRED_CHANNEL = (process.env.REQUIRED_CHANNEL || '').trim();
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 20;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const CUSTOM_CAPTION = process.env.CUSTOM_CAPTION;

// Temporary working directory
const DOWNLOAD_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'video2mp3_downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Safe file deletion helper
function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`Failed to clean up file ${filePath}:`, err.message);
  }
}

// Helper to check channel membership
async function isUserMember(ctx) {
  if (!REQUIRED_CHANNEL) return true;
  try {
    const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch (err) {
    console.error('Error checking chat member status:', err.message);
    // If bot cannot verify (e.g. channel not found or bot not admin), don't block the user
    return true;
  }
}

// Initialize Telegraf bot
// Disable webhookReply so asynchronous responses don't conflict with Telegram webhook HTTP body
const bot = new Telegraf(BOT_TOKEN, {
  telegram: { webhookReply: false },
});

// Rate limiting (1 request per 3 seconds per user)
const rateLimitConfig = {
  window: 3000,
  limit: 1,
  onLimitExceeded: (ctx) =>
    ctx.reply('You are sending requests too quickly. Please wait a moment.'),
};
bot.use(rateLimit(rateLimitConfig));

// /start command handler
bot.start(async (ctx) => {
  try {
    const member = await isUserMember(ctx);
    if (member) {
      await ctx.reply(
        '👋 Welcome! Send me any video or video document, and I will convert it into an MP3 audio file for you.'
      );
    } else {
      const channelLink = REQUIRED_CHANNEL.startsWith('@')
        ? `https://t.me/${REQUIRED_CHANNEL.slice(1)}`
        : REQUIRED_CHANNEL;
      await ctx.reply(
        'To use this bot, you need to join our Telegram channel first:',
        Markup.inlineKeyboard([
          Markup.button.url('Join Channel', channelLink),
          Markup.button.callback('I have joined', 'check_membership'),
        ])
      );
    }
  } catch (err) {
    console.error('Start error:', err);
    ctx.reply('An error occurred. Please try again later.');
  }
});

// "I have joined" button callback
bot.action('check_membership', async (ctx) => {
  try {
    const member = await isUserMember(ctx);
    if (member) {
      await ctx.editMessageText(
        '✅ Thank you for joining! You can now send me any video to convert it to MP3.'
      );
    } else {
      await ctx.answerCbQuery(
        "It seems you haven't joined the channel yet. Please join and try again.",
        { show_alert: true }
      );
    }
  } catch (err) {
    console.error('Error checking membership:', err);
    ctx.reply('An error occurred while verifying membership. Please try again later.');
  }
});

// Video conversion core processor
async function handleVideoConversion(ctx, fileId, originalName = 'audio') {
  let videoPath = null;
  let mp3Path = null;
  let processingMessage = null;

  try {
    const member = await isUserMember(ctx);
    if (!member) {
      return ctx.reply(
        `Please join ${REQUIRED_CHANNEL} to use this bot, then send /start.`
      );
    }

    // Get file metadata
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileSize = fileInfo.file_size || 0;

    if (fileSize > MAX_FILE_SIZE) {
      await ctx.reply(
        `⚠️ Telegram Bot API limits file downloads to ${MAX_FILE_SIZE_MB} MB. Your file is ${(
          fileSize /
          (1024 * 1024)
        ).toFixed(1)} MB. Please send a smaller video.`
      );
      return;
    }

    processingMessage = await ctx.reply('⏳ Processing your video... Please wait.');

    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    videoPath = path.join(DOWNLOAD_DIR, `${uniqueId}.mp4`);
    mp3Path = path.join(DOWNLOAD_DIR, `${uniqueId}.mp3`);

    // Download video stream
    const response = await axios({
      url: typeof fileUrl === 'string' ? fileUrl : fileUrl.href,
      method: 'GET',
      responseType: 'stream',
      timeout: 120000,
    });

    const videoStream = fs.createWriteStream(videoPath);
    await new Promise((resolve, reject) => {
      response.data.pipe(videoStream);
      videoStream.on('finish', resolve);
      videoStream.on('error', reject);
    });

    // Update status to converting
    if (processingMessage) {
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          processingMessage.message_id,
          undefined,
          '🎵 Converting video to MP3...'
        )
        .catch(() => {});
    }

    // Convert via ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(192)
        .format('mp3')
        .output(mp3Path)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Prepare audio title / caption
    const cleanBaseName = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim() || 'Converted Audio';

    const captionText =
      CUSTOM_CAPTION ||
      `🎵 Converted to MP3\n🤖 @${ctx.botInfo?.username || 'Video2Mp3Bot'}`;

    // Send audio file
    await ctx.replyWithAudio(
      {
        source: mp3Path,
        filename: `${cleanBaseName}.mp3`,
      },
      {
        caption: captionText,
        title: cleanBaseName,
        performer: ctx.botInfo?.username ? `@${ctx.botInfo.username}` : undefined,
      }
    );

    // Delete processing message
    if (processingMessage) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, processingMessage.message_id)
        .catch(() => {});
    }
  } catch (error) {
    console.error('Error during video conversion:', error);
    const userMsg =
      error.message && error.message.includes('file is too big')
        ? `⚠️ Telegram refused download because the file exceeds the 20MB bot limit.`
        : '❌ An error occurred while converting the video. Please try again.';

    if (processingMessage) {
      await ctx.telegram
        .editMessageText(ctx.chat.id, processingMessage.message_id, undefined, userMsg)
        .catch(() => ctx.reply(userMsg));
    } else {
      await ctx.reply(userMsg);
    }
  } finally {
    // Always clean up temporary files
    safeDelete(videoPath);
    safeDelete(mp3Path);
  }
}

// Handle video messages
bot.on('video', (ctx) => {
  const fileId = ctx.message.video.file_id;
  const fileName = ctx.message.video.file_name || `video_${Date.now()}`;
  return handleVideoConversion(ctx, fileId, fileName);
});

// Handle animation / GIF messages
bot.on('animation', (ctx) => {
  const fileId = ctx.message.animation.file_id;
  const fileName = ctx.message.animation.file_name || `animation_${Date.now()}`;
  return handleVideoConversion(ctx, fileId, fileName);
});

// Handle documents (e.g. uncompressed video files)
bot.on('document', (ctx) => {
  const doc = ctx.message.document;
  const mime = doc.mime_type || '';
  const fileName = doc.file_name || '';
  const isVideo =
    mime.startsWith('video/') ||
    /\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v|3gp)$/i.test(fileName);

  if (isVideo) {
    return handleVideoConversion(ctx, doc.file_id, fileName);
  } else {
    return ctx.reply('Please send a valid video file or video document.');
  }
});

// Create Express app for Webhook & Health check
const app = express();
app.use(express.json());

// Health check endpoints (used by Render, Koyeb, Railway, UptimeRobot, etc.)
app.get('/', (req, res) => {
  res.status(200).send(`
    <html>
      <head><title>Video to MP3 Bot</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>🤖 Video to MP3 Telegram Bot is Online!</h2>
        <p>Status: Healthy</p>
        <p>Mode: ${WEBHOOK_URL ? 'Webhook' : 'Long Polling'}</p>
        <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mode: WEBHOOK_URL ? 'webhook' : 'polling',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Start application
async function bootstrap() {
  if (WEBHOOK_URL) {
    // Webhook Mode (For Render, Koyeb, Railway, Fly.io, etc. - NO VPS REQUIRED)
    const secretPath = `/webhook/${bot.secretPathComponent()}`;
    const fullWebhookUrl = `${WEBHOOK_URL}${secretPath}`;

    // Register webhook handler with Express
    app.use(bot.webhookCallback(secretPath));

    app.listen(PORT, async () => {
      console.log(`🌐 Web server running on port ${PORT}`);
      try {
        await bot.telegram.setWebhook(fullWebhookUrl);
        console.log(`🚀 Telegram Webhook configured successfully at: ${fullWebhookUrl}`);
      } catch (err) {
        console.error('Failed to set Telegram webhook:', err);
      }
    });
  } else {
    // Polling Mode (Local run or container environments without public URL)
    // We still keep the express server running so platforms requiring an open port (like Render) won't terminate
    app.listen(PORT, () => {
      console.log(`🌐 Health server running on port ${PORT}`);
    });

    // Remove any previous webhook before polling
    await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
    await bot.launch();
    console.log('🤖 Bot started successfully using Long Polling...');
  }
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
