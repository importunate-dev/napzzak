import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob, createJob, cancelJob } from '@/lib/store';
import { loadStoryJson } from '@/lib/s3';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  let job = await getJob(jobId);

  if (job) {
    return NextResponse.json({
      status: job.status,
      storyJson: job.storyJson ?? null,
      error: job.error ?? null,
      progress: job.progress ?? null,
      progressDetail: job.progressDetail ?? null,
    });
  }

  const storyJson = await loadStoryJson(jobId);
  if (storyJson) {
    await createJob(jobId);
    await updateJob(jobId, { status: 'completed', storyJson });
    return NextResponse.json({
      status: 'completed' as const,
      storyJson,
      error: null,
      progress: 'completed',
      progressDetail: null,
    });
  }

  return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const cancelled = await cancelJob(jobId);

  if (!cancelled) {
    return NextResponse.json(
      { error: '취소할 수 없는 작업입니다' },
      { status: 400 }
    );
  }

  console.log(`[Job ${jobId}] 사용자가 작업 취소 요청`);
  return NextResponse.json({ status: 'cancelled' });
}
