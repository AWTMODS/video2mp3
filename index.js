const { Telegraf, Markup } = require('telegraf');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Telegram Bot Token
const BOT_TOKEN = '7839715496:AAGuJb2ZLb_GTOE4AMQ3_9ewgcUrMJRViE0';
const bot = new Telegraf(BOT_TOKEN);

// Channel to join
const REQUIRED_CHANNEL = '@artwebtechofficial';

// Create a temporary directory for downloads
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Middleware to check if the user has joined the channel
bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.chat) {
    const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, ctx.message.chat.id);
    if (chatMember.status === 'member' || chatMember.status === 'administrator' || chatMember.status === 'creator') {
      return next();
    } else {
      return ctx.reply(
        'Please join our channel to use the bot!',
        Markup.inlineKeyboard([
          Markup.button.url('Join Channel', `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}`),
        ])
      );
    }
  } else {
    return next();
  }
});

// Start command
bot.start(async (ctx) => {
  const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, ctx.message.chat.id);
  if (chatMember.status === 'member' || chatMember.status === 'administrator' || chatMember.status === 'creator') {
    ctx.reply('Welcome! Send me a video file, and I will convert it to MP3 for you.');
  } else {
    ctx.reply(
      'Please join our channel to use the bot!',
      Markup.inlineKeyboard([
        Markup.button.url('Join Channel', `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}`),
      ])
    );
  }
});

// Handle video messages
bot.on('video', async (ctx) => {
  try {
    // Notify the user that the process has started
    const processingMessage = await ctx.reply('Processing your video... Please wait.');

    // Get the video file ID and file information
    const fileId = ctx.message.video.file_id;
    const fileUrl = await ctx.telegram.getFileLink(fileId);

    // Define file paths
    const videoPath = path.join(DOWNLOAD_DIR, `${fileId}.mp4`);
    const mp3Path = path.join(DOWNLOAD_DIR, `awtmp3bot_${fileId}.mp3`);

    // Download the video file
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream',
    });
    const videoStream = fs.createWriteStream(videoPath);
    response.data.pipe(videoStream);

    videoStream.on('finish', () => {
      // Convert video to MP3
      ffmpeg(videoPath)
        .output(mp3Path)
        .on('end', async () => {
          // Edit the "Processing..." message to notify completion
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            'Conversion complete! Sending your MP3 file...'
          );

          // Send the MP3 file back to the user with a caption
          await ctx.replyWithAudio(
            { source: mp3Path },
            { caption: 'MP3 by @arwebtechofficial' }
          );

          // Cleanup
          fs.unlinkSync(videoPath);
          fs.unlinkSync(mp3Path);
        })
        .on('error', (err) => {
          console.error('Error converting video:', err);
          ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            'An error occurred while converting the video. Please try again.'
          );
        })
        .run();
    });

    videoStream.on('error', (err) => {
      console.error('Error downloading video:', err);
      ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMessage.message_id,
        undefined,
        'Failed to download the video. Please try again.'
      );
    });
  } catch (error) {
    console.error('Error handling video:', error);
    ctx.reply('An error occurred while processing your request.');
  }
});

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
