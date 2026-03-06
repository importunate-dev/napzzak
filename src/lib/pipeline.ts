import { uploadToS3, uploadImageAndGetUrl, saveStoryJson } from '@/lib/s3';
import { analyzeVideo } from '@/lib/bedrock';
import { generateSingleComicPage } from '@/lib/canvas';
import { updateJob, isJobCancelled } from '@/lib/store';
import { StoryJson, Panel, ArtStyle } from '@/lib/types';

class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = 'JobCancelledError';
  }
}

async function assertNotCancelled(jobId: string) {
  if (await isJobCancelled(jobId)) {
    throw new JobCancelledError(jobId);
  }
}

export async function processVideo(
  jobId: string,
  buffer: Buffer,
  artStyle: ArtStyle = 'GRAPHIC_NOVEL_ILLUSTRATION'
) {
  const videoKey = `videos/${jobId}/original.mp4`;
  const s3Uri = await uploadToS3(videoKey, buffer, 'video/mp4');
  await updateJob(jobId, { status: 'processing', videoKey, progress: 'uploaded' });

  try {
    await assertNotCancelled(jobId);
    await updateJob(jobId, { progress: 'analyzing', progressDetail: 'Nova 2 Lite 영상 분석 중' });

    const bucketOwner = process.env.AWS_ACCOUNT_ID!;
    console.log(`[Job ${jobId}] Nova 2 Lite 영상 분석 시작 (대사 없는 만화)...`);
    const analysis = await analyzeVideo(s3Uri, bucketOwner);
    console.log(`[Job ${jobId}] 분석 완료: ${analysis.panels.length}개 패널`);

    await assertNotCancelled(jobId);
    await updateJob(jobId, { progress: 'generating_comic', progressDetail: 'Nova Canvas 만화 이미지 생성 중' });

    console.log(`[Job ${jobId}] Nova Canvas 단일 만화 페이지 생성 시작 (${artStyle})...`);
    const panelsForCanvas: Panel[] = analysis.panels.map((p) => ({
      ...p,
      emotion: p.emotion as Panel['emotion'],
    }));
    const comicPageBuffer = await generateSingleComicPage(panelsForCanvas, artStyle);
    console.log(`[Job ${jobId}] Nova Canvas 만화 이미지 생성 완료`);

    await assertNotCancelled(jobId);

    const comicPageKey = `videos/${jobId}/comic-page.png`;
    const comicPageUrl = await uploadImageAndGetUrl(comicPageKey, comicPageBuffer);

    const panels: Panel[] = analysis.panels.map((p) => ({
      panelId: p.panelId,
      description: p.description,
      emotion: p.emotion as Panel['emotion'],
    }));

    const storyJson: StoryJson = {
      videoId: jobId,
      duration: analysis.duration,
      summary: analysis.summary,
      climaxIndex: Math.min(analysis.climaxIndex, panels.length - 1),
      panels,
      comicPageUrl,
      novaModelsUsed: ['Nova 2 Lite (영상 분석)', 'Nova Canvas (만화 이미지 생성)'],
      hasAudioDialogue: analysis.hasAudioDialogue ?? false,
      artStyle,
      dialogueLanguage: 'ko',
    };

    await saveStoryJson(jobId, storyJson);
    await updateJob(jobId, { status: 'completed', storyJson, progress: 'completed', progressDetail: undefined });
    console.log(`[Job ${jobId}] 완료 (${panels.length}패널, 모델: ${storyJson.novaModelsUsed.join(', ')})`);
  } catch (err) {
    if (err instanceof JobCancelledError) {
      console.log(`[Job ${jobId}] 취소됨`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: 'failed', error: message, progressDetail: `오류: ${message}` });
    throw err;
  }
}
