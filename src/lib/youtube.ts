import ytdl from '@distube/ytdl-core';

const MAX_DURATION_SECONDS = 600; // 10분
const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB
const DOWNLOAD_TIMEOUT_MS = 120_000; // 2분
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

/** YOUTUBE_COOKIES env: 브라우저에서 EditThisCookie로 추출한 쿠키 배열 JSON */
function getYouTubeAgent(): ReturnType<typeof ytdl.createAgent> | undefined {
  const raw = process.env.YOUTUBE_COOKIES;
  if (!raw || raw.trim() === '') return undefined;
  try {
    const cookies = JSON.parse(raw) as Array<{ name: string; value: string; domain?: string; path?: string }>;
    if (!Array.isArray(cookies) || cookies.length === 0) return undefined;
    return ytdl.createAgent(cookies);
  } catch {
    return undefined;
  }
}

const youtubeAgent = getYouTubeAgent();

export interface YouTubeVideoInfo {
  title: string;
  duration: number;
}

/**
 * YouTube Shorts URL (youtube.com/shorts/VIDEO_ID)을
 * 일반 watch URL (youtube.com/watch?v=VIDEO_ID)로 변환
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
  return ytdl.validateURL(normalized);
}

export async function getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
  const normalized = normalizeYouTubeUrl(url);
  const options = youtubeAgent ? { agent: youtubeAgent } : undefined;
  const info = await ytdl.getInfo(normalized, options);
  const duration = parseInt(info.videoDetails.lengthSeconds, 10);
  return {
    title: info.videoDetails.title,
    duration,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`다운로드 타임아웃 (${ms / 1000}초)`)), ms)
    ),
  ]);
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('playable formats') ||
    msg.includes('No such format') ||
    msg.includes('Status code: 403') ||
    msg.includes('Status code: 429')
  );
}

export async function downloadYouTube(url: string): Promise<{ buffer: Buffer; title: string }> {
  const normalized = normalizeYouTubeUrl(url);

  if (!validateYouTubeUrl(url)) {
    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  const info = await withTimeout(getVideoInfo(url), 30_000);

  if (info.duration > MAX_DURATION_SECONDS) {
    throw new Error(`10분 이하 영상만 지원합니다 (현재: ${Math.ceil(info.duration / 60)}분)`);
  }

  const downloadOptions = {
    filter: 'audioandvideo' as const,
    quality: [22, 18] as [number, number],
    ...(youtubeAgent && { agent: youtubeAgent }),
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = ytdl(normalized, downloadOptions);
      const chunks: Buffer[] = [];
      let totalSize = 0;

      const downloadPromise = (async () => {
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalSize += buf.length;
          if (totalSize > MAX_BUFFER_SIZE) {
            stream.destroy();
            throw new Error('영상 크기가 100MB를 초과합니다. 더 짧은 영상을 시도해 주세요');
          }
          chunks.push(buf);
        }
        return { buffer: Buffer.concat(chunks), title: info.title };
      })();

      return await withTimeout(downloadPromise, DOWNLOAD_TIMEOUT_MS);
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        console.warn(
          `[YouTube] 다운로드 실패, 재시도 중... (${attempt + 1}/${MAX_RETRIES + 1})`,
          err instanceof Error ? err.message : err
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }

  throw new Error('YouTube 다운로드에 실패했습니다 (최대 재시도 초과)');
}
