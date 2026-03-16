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
    return NextResponse.json({ error: 'A video file is required' }, { status: 400 });
  }

  if (!file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files can be uploaded' }, { status: 400 });
  }

  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json({ error: 'File size must be 100MB or less' }, { status: 400 });
  }

  const jobId = uuidv4();
  const buffer = Buffer.from(await file.arrayBuffer());

  await createJob(jobId, 'file');

  processVideo(jobId, buffer, artStyle).catch((error) => {
    console.error(`[Job ${jobId}] Processing failed:`, error);
    void updateJob(jobId, { status: 'failed', error: error.message });
  });

  return NextResponse.json({ jobId });
}
