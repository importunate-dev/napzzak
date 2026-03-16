import ytdl from '@distube/ytdl-core';
import { spawn } from 'child_process';
import { readFile, rm, mkdtemp, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWriteStream, readFileSync } from 'fs';
import { pipeline } from 'stream/promises';

const MAX_DURATION_SECONDS = 600; // 10 min
const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT_MS = 180_000; // 3 min

// ffmpeg-static path
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFMPEG_PATH: string = process.env.FFMPEG_PATH || require('ffmpeg-static') as string;

// Load YouTube cookies from Netscape cookies.txt if available
// Place cookies.txt in project root or set YOUTUBE_COOKIES_PATH env var
const COOKIES_PATH = process.env.YOUTUBE_COOKIES_PATH || join(process.cwd(), 'cookies.txt');

function loadCookies(): ytdl.Cookie[] | undefined {
  try {
    const raw = readFileSync(COOKIES_PATH, 'utf-8');
    const cookies: ytdl.Cookie[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        cookies.push({
          domain: parts[0],
          httpOnly: parts[1] === 'TRUE',
          path: parts[2],
          secure: parts[3] === 'TRUE',
          expirationDate: parseInt(parts[4], 10),
          name: parts[5],
          value: parts[6].trim(),
        });
      }
    }
    if (cookies.length > 0) {
      console.log(`[YouTube] Loaded ${cookies.length} cookies from ${COOKIES_PATH}`);
      return cookies;
    }
  } catch {
    // No cookies file — proceed without authentication
  }
  return undefined;
}

let ytdlAgent: ReturnType<typeof ytdl.createAgent> | undefined;
const cookies = loadCookies();
if (cookies) {
  ytdlAgent = ytdl.createAgent(cookies);
}

export interface YouTubeVideoInfo {
  title: string;
  duration: number;
}

/**
 * Convert YouTube Shorts URL to standard watch URL
 */
export function normalizeYouTubeUrl(url: string): string {
  const trimmed = url.trim();
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) {
    return `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
  }
  return trimmed;
}

export function validateYouTubeUrl(url: string): boolean {
  const normalized = normalizeYouTubeUrl(url);
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/.test(normalized);
}

function runFfmpeg(args: string[], timeoutMs = 60_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    const chunks: Buffer[] = [];
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`ffmpeg timeout (${timeoutMs / 1000}s)`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg failed (exit ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg execution error: ${err.message}`));
    });
  });
}

export async function getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
  const normalized = normalizeYouTubeUrl(url);
  const opts = ytdlAgent ? { agent: ytdlAgent } : {};
  const info = await ytdl.getInfo(normalized, opts);
  const title = info.videoDetails.title || 'untitled';
  const duration = parseInt(info.videoDetails.lengthSeconds || '0', 10);
  return { title, duration };
}

export async function downloadYouTube(url: string): Promise<{ buffer: Buffer; title: string }> {
  if (!validateYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL');
  }

  const normalized = normalizeYouTubeUrl(url);
  const info = await getVideoInfo(url);

  if (info.duration > MAX_DURATION_SECONDS) {
    throw new Error(`Only videos under 10 minutes are supported (current: ${Math.ceil(info.duration / 60)} min)`);
  }

  console.log(`[YouTube] Download started: "${info.title}" (${info.duration}s)`);

  const tmpDir = await mkdtemp(join(tmpdir(), 'napzzak-'));
  const rawPath = join(tmpDir, 'raw.mp4');
  const outPath = join(tmpDir, 'output.mp4');

  try {
    // Step 1: Download with ytdl-core (video+audio combined format preferred)
    const stream = ytdl(normalized, {
      filter: 'audioandvideo',
      quality: 'highest',
      ...(ytdlAgent ? { agent: ytdlAgent } : {}),
    });

    // Timeout guard
    const downloadPromise = pipeline(stream, createWriteStream(rawPath));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Download timeout (${DOWNLOAD_TIMEOUT_MS / 1000}s)`)), DOWNLOAD_TIMEOUT_MS)
    );

    await Promise.race([downloadPromise, timeoutPromise]);

    // Step 2: Re-encode to Bedrock-compatible MP4 with ffmpeg
    await runFfmpeg([
      '-y',
      '-i', rawPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outPath,
    ], 120_000);

    // Step 3: Read file
    const buffer = await readFile(outPath);

    if (buffer.length === 0) {
      throw new Error('Converted video is empty');
    }
    if (buffer.length > MAX_BUFFER_SIZE) {
      throw new Error('Video size exceeds 100MB. Please try a shorter video');
    }

    console.log(`[YouTube] Download complete: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    return { buffer, title: info.title };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
