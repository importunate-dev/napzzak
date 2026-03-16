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
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
  }

  const { url, artStyle } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  if (!validateYouTubeUrl(url)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  const jobId = uuidv4();
  await createJob(jobId, normalizedUrl);

  processYouTube(jobId, normalizedUrl, artStyle).catch((error) => {
    console.error(`[Job ${jobId}] YouTube processing failed:`, error);
    const msg = /Sign in|bot|confirm/i.test(error.message)
      ? 'YouTube is blocking this request. Please download the video and use File Upload instead.'
      : error.message;
    void updateJob(jobId, { status: 'failed', error: msg });
  });

  return NextResponse.json({ jobId });
}

async function processYouTube(
  jobId: string,
  url: string,
  artStyle?: ArtStyle,
) {
  console.log(`[Job ${jobId}] YouTube download started: ${url}`);
  const { buffer, title } = await downloadYouTube(url);
  console.log(`[Job ${jobId}] Download complete: "${title}" (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

  await processVideo(jobId, buffer, artStyle || 'GRAPHIC_NOVEL_ILLUSTRATION', url);
}
