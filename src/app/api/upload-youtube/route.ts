import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob, updateJob } from '@/lib/store';
import { processVideo } from '@/lib/pipeline';
import { downloadYouTube, validateYouTubeUrl, normalizeYouTubeUrl } from '@/lib/youtube';
import { ArtStyle } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { url?: string; artStyle?: ArtStyle };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const { url, artStyle } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'YouTube URL이 필요합니다' }, { status: 400 });
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  if (!validateYouTubeUrl(url)) {
    return NextResponse.json({ error: '유효하지 않은 YouTube URL입니다' }, { status: 400 });
  }

  const jobId = uuidv4();
  await createJob(jobId, normalizedUrl);

  processYouTube(jobId, normalizedUrl, artStyle).catch((error) => {
    console.error(`[Job ${jobId}] YouTube 처리 실패:`, error);
    void updateJob(jobId, { status: 'failed', error: error.message });
  });

  return NextResponse.json({ jobId });
}

async function processYouTube(
  jobId: string,
  url: string,
  artStyle?: ArtStyle,
) {
  console.log(`[Job ${jobId}] YouTube 다운로드 시작: ${url}`);
  const { buffer, title } = await downloadYouTube(url);
  console.log(`[Job ${jobId}] 다운로드 완료: "${title}" (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  await processVideo(jobId, buffer, artStyle || 'GRAPHIC_NOVEL_ILLUSTRATION');
}
