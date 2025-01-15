import { Telegraf, Markup } from 'telegraf';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name from the current file's URL
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Telegram Bot Token
const BOT_TOKEN = process.env.BOT_TOKEN ||;
const bot = new Telegraf(BOT_TOKEN);

// Channel to join
const REQUIRED_CHANNEL = '@awt_bots';

// Create a temporary directory for downloads
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Middleware to check if the user has joined the channel
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;

    // Check if the user is a member of the required channel
    const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, userId);

    if (
      chatMember.status === 'member' || 
      chatMember.status === 'administrator' || 
      chatMember.status === 'creator'
    ) {
      // If the user is already a member, send a welcome message
      await ctx.reply('Welcome to the bot! Send me a video, and I will convert it to MP3 for you.');
    } else {
      // If the user is not a member, prompt them to join the channel
      await ctx.reply(
        'To use this bot, you need to join our Telegram channel first:',
        Markup.inlineKeyboard([ 
          Markup.button.url('Join Channel', `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}`),
          Markup.button.callback('I have joined', 'check_membership'),
        ])
      );
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    ctx.reply('An error occurred. Please try again later.');
  }
});

// Handle "I have joined" button callback
bot.action('check_membership', async (ctx) => {
  try {
    const userId = ctx.from.id;

    // Check again if the user has joined the channel
    const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, userId);

    if (
      chatMember.status === 'member' || 
      chatMember.status === 'administrator' || 
      chatMember.status === 'creator'
    ) {
      // If the user has joined, send a confirmation message
      await ctx.editMessageText('Thank you for joining the channel! You can now use the bot. by sending /start');
    } else {
      // If the user still hasn't joined, prompt them again
      await ctx.answerCbQuery('It seems you haven\'t joined the channel yet. Please join and try again.', { show_alert: true });
    }
  } catch (err) {
    console.error('Error checking membership:', err);
    ctx.reply('An error occurred while verifying your membership. Please try again later.');
  }
});

// Video compression function
// Video compression function
const compressVideo = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264') // Use H.264 codec for compression
      .audioCodec('aac')     // Use AAC audio codec
      .size('640x360')       // Resize video to reduce size (adjust as needed)
      .bitrate('500k')       // Set video bitrate (adjust as needed)
      .on('end', () => {
        console.log('Video compression completed.');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error compressing video:', err);
        reject(err);
      })
      .run();
  });
};


// Handle video messages
// Handle video messages
bot.on('video', async (ctx) => {
  try {
    const fileId = ctx.message.video.file_id;

    // Get video file details to check the size
    const fileInfo = await ctx.telegram.getFile(fileId);
    const fileSize = fileInfo.file_size; // in bytes

    // Check if the file size exceeds 50 MB (50 MB = 50 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB in bytes
    if (fileSize > MAX_FILE_SIZE) {
      await ctx.reply('This bot only supports video files up to 50 MB in size. Please send a smaller video.');
      return;
    }

    const processingMessage = await ctx.reply('Processing your video... Please wait.');

    const fileUrl = await ctx.telegram.getFileLink(fileId);

    const videoPath = path.join(DOWNLOAD_DIR, `${fileId}.mp4`);
    const mp3Path = path.join(DOWNLOAD_DIR, `awtmp3bot_${fileId}.mp3`);

    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream',
    });

    const videoStream = fs.createWriteStream(videoPath);
    response.data.pipe(videoStream);

    videoStream.on('finish', () => {
      ffmpeg(videoPath)
        .output(mp3Path)
        .on('end', async () => {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMessage.message_id,
            undefined,
            'Conversion complete! Sending your MP3 file...'
          );

          await ctx.replyWithAudio(
            { source: mp3Path },
            { caption: 'Converted By \n@awt_video2mp3_bot' }
          );

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
     ctx.reply('This bot only supports video files up to 50 MB in size. Please send a smaller video.');

  }
});

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running...');
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
