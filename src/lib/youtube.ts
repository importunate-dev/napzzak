import { spawn } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const MAX_DURATION_SECONDS = 600; // 10분
const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT_MS = 180_000; // 3분

// yt-dlp 실행 파일 경로 (환경변수로 오버라이드 가능)
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

// ffmpeg-static 경로
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FFMPEG_PATH: string = process.env.FFMPEG_PATH || require('ffmpeg-static') as string;

export interface YouTubeVideoInfo {
  title: string;
  duration: number;
}

/**
 * YouTube Shorts URL을 일반 watch URL로 변환
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

function runYtdlp(args: string[], timeoutMs = DOWNLOAD_TIMEOUT_MS): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, args);
    const chunks: Buffer[] = [];
    let stderr = '';
    let totalSize = 0;

    proc.stdout.on('data', (d: Buffer) => {
      totalSize += d.length;
      if (totalSize > MAX_BUFFER_SIZE) {
        proc.kill();
        reject(new Error('영상 크기가 100MB를 초과합니다. 더 짧은 영상을 시도해 주세요'));
        return;
      }
      chunks.push(d);
    });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`yt-dlp 타임아웃 (${timeoutMs / 1000}초)`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout: Buffer.concat(chunks), stderr });
      } else {
        reject(new Error(`yt-dlp 실패 (exit ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp 실행 오류: ${err.message}`));
    });
  });
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
      reject(new Error(`ffmpeg 타임아웃 (${timeoutMs / 1000}초)`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg 실패 (exit ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg 실행 오류: ${err.message}`));
    });
  });
}

export async function getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
  const normalized = normalizeYouTubeUrl(url);
  const { stdout } = await runYtdlp([
    '--print', '%(title)s\n%(duration)s',
    '--no-playlist',
    normalized,
  ], 30_000);
  const lines = stdout.toString().trim().split('\n');
  const title = lines[0] || 'untitled';
  const duration = parseInt(lines[1] || '0', 10);
  return { title, duration };
}

export async function downloadYouTube(url: string): Promise<{ buffer: Buffer; title: string }> {
  if (!validateYouTubeUrl(url)) {
    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  const normalized = normalizeYouTubeUrl(url);
  const info = await getVideoInfo(url);

  if (info.duration > MAX_DURATION_SECONDS) {
    throw new Error(`10분 이하 영상만 지원합니다 (현재: ${Math.ceil(info.duration / 60)}분)`);
  }

  console.log(`[YouTube] 다운로드 시작: "${info.title}" (${info.duration}초)`);

  // 임시 디렉토리에 다운로드
  const tmpDir = await mkdtemp(join(tmpdir(), 'napzzak-'));
  const rawPath = join(tmpDir, 'raw.%(ext)s');
  const outPath = join(tmpDir, 'output.mp4');

  try {
    // 1단계: yt-dlp로 파일 다운로드
    await runYtdlp([
      '-f', 'bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
      '--ffmpeg-location', FFMPEG_PATH,
      '--merge-output-format', 'mp4',
      '-o', rawPath,
      '--no-playlist',
      normalized,
    ]);

    // yt-dlp가 실제로 쓴 파일 경로 확인
    const { stdout: realPathBuf } = await runYtdlp([
      '-f', 'bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
      '--get-filename',
      '-o', rawPath,
      '--no-playlist',
      normalized,
    ], 30_000);
    const downloadedPath = realPathBuf.toString().trim();

    // 2단계: ffmpeg으로 Bedrock 호환 MP4로 리인코딩
    // -c:v copy 로 비디오 재인코딩 없이 컨테이너만 정리 (빠름)
    await runFfmpeg([
      '-y',
      '-i', downloadedPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outPath,
    ], 120_000);

    // 3단계: 파일 읽기
    const { readFile } = await import('fs/promises');
    const buffer = await readFile(outPath);

    if (buffer.length === 0) {
      throw new Error('변환된 영상이 비어있습니다');
    }
    if (buffer.length > MAX_BUFFER_SIZE) {
      throw new Error('영상 크기가 100MB를 초과합니다. 더 짧은 영상을 시도해 주세요');
    }

    console.log(`[YouTube] 다운로드 완료: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    return { buffer, title: info.title };
  } finally {
    // 임시 파일 정리
    const { rm } = await import('fs/promises');
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
