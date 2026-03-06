import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob, updateJob } from '@/lib/store';
import { processVideo } from '@/lib/pipeline';
import { ArtStyle } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('video') as File | null;
  const artStyle = (formData.get('artStyle') as ArtStyle) || 'GRAPHIC_NOVEL_ILLUSTRATION';

  if (!file) {
    return NextResponse.json({ error: '영상 파일이 필요합니다' }, { status: 400 });
  }

  if (!file.type.startsWith('video/')) {
    return NextResponse.json({ error: '영상 파일만 업로드 가능합니다' }, { status: 400 });
  }

  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: '파일 크기는 100MB 이하여야 합니다' }, { status: 400 });
  }

  const jobId = uuidv4();
  const buffer = Buffer.from(await file.arrayBuffer());

  await createJob(jobId, 'file');

  processVideo(jobId, buffer, artStyle).catch((error) => {
    console.error(`[Job ${jobId}] 처리 실패:`, error);
    void updateJob(jobId, { status: 'failed', error: error.message });
  });

  return NextResponse.json({ jobId });
}
