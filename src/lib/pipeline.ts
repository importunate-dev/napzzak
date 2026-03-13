import { uploadToS3, uploadImageAndGetUrl, saveStoryJson, downloadFromS3 } from '@/lib/s3';
import { analyzeVideo } from '@/lib/bedrock';
import { generatePanelImage, generateSingleComicPage } from '@/lib/canvas';
import { updateJob, isJobCancelled } from '@/lib/store';
import { StoryJson, Panel, ArtStyle } from '@/lib/types';
import { transcribeFromVideo, type TranscribeResult } from '@/lib/transcribe';
import { extractFrames, saveVideoToTemp, cleanupTemp } from '@/lib/ffmpeg';
import { promises as fs } from 'fs';

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

async function generatePanelImages(
  jobId: string,
  panels: Panel[],
  artStyle: ArtStyle,
  characterDescriptions: string,
  summary: string
): Promise<Panel[]> {
  const updatedPanels: Panel[] = [];

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_panels',
      progressDetail: `패널 ${i + 1}/${panels.length} 이미지 생성 중`,
    });

    console.log(`[Job ${jobId}] 패널 ${i + 1}/${panels.length} 생성 중...`);

    try {
      const imageBuffer = await generatePanelImage(
        panel,
        artStyle,
        characterDescriptions,
        summary
      );

      const panelImageKey = `videos/${jobId}/panel-${panel.panelId}.png`;
      const panelImageUrl = await uploadImageAndGetUrl(panelImageKey, imageBuffer);

      updatedPanels.push({ ...panel, imageUrl: panelImageUrl });
      console.log(`[Job ${jobId}] 패널 ${i + 1} 생성 완료`);
    } catch (err) {
      console.error(`[Job ${jobId}] 패널 ${i + 1} 생성 실패:`, err);
      updatedPanels.push({ ...panel });
    }
  }

  return updatedPanels;
}

/**
 * 영상 버퍼에서 키프레임을 추출하고 base64로 변환합니다.
 */
async function extractKeyframes(videoBuffer: Buffer, duration: number): Promise<string[]> {
  let videoPath = '';
  try {
    videoPath = await saveVideoToTemp(videoBuffer);

    // 0.5초 간격으로 키프레임 추출 (제한 없음)
    const interval = 0.5;
    const timestamps: number[] = [];
    for (let t = 0; t < duration; t += interval) {
      timestamps.push(t);
    }

    const framePaths = await extractFrames(videoPath, timestamps);
    const frameImages: string[] = [];

    for (const framePath of framePaths) {
      try {
        const frameBuffer = await fs.readFile(framePath);
        frameImages.push(frameBuffer.toString('base64'));
      } catch {
        // skip failed frames
      }
    }

    console.log(`[Keyframes] ${frameImages.length}장 추출 완료`);
    return frameImages;
  } finally {
    if (videoPath) await cleanupTemp(videoPath);
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
    const bucketOwner = process.env.AWS_ACCOUNT_ID!;

    // Step 0a: AWS Transcribe로 대사 추출
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'transcribing',
      progressDetail: 'AWS Transcribe로 대사 추출 중...',
    });

    let transcribeResult: TranscribeResult | null = null;
    let transcriptText: string | undefined;
    try {
      console.log(`[Job ${jobId}] Transcribe 시작...`);
      transcribeResult = await transcribeFromVideo(buffer, jobId);
      if (transcribeResult.fullText.trim().length > 0) {
        transcriptText = transcribeResult.segments
          .map(s => {
            const speaker = s.speaker ? `[${s.speaker}]` : '';
            const time = `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s]`;
            return `${time} ${speaker} ${s.text}`;
          })
          .join('\n');
        console.log(`[Job ${jobId}] Transcribe 완료: ${transcribeResult.segments.length}개 세그먼트`);
      } else {
        console.log(`[Job ${jobId}] Transcribe: 대사 없음`);
      }
    } catch (err) {
      console.warn(`[Job ${jobId}] Transcribe 실패 (계속 진행):`, err);
    }

    // Step 0b: 키프레임 추출
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'extracting_frames',
      progressDetail: '키프레임 추출 중...',
    });

    let frameImages: string[] | undefined;
    try {
      console.log(`[Job ${jobId}] 키프레임 추출 시작...`);
      // 일단 대략 30초 기준으로 추출 (정확한 duration은 분석 후 알 수 있음)
      frameImages = await extractKeyframes(buffer, 30);
      console.log(`[Job ${jobId}] 키프레임 ${frameImages.length}장 추출 완료`);
    } catch (err) {
      console.warn(`[Job ${jobId}] 키프레임 추출 실패 (계속 진행):`, err);
    }

    // Pass 1 + Verification + Pass 2
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'analyzing_pass1_stepA',
      progressDetail: 'Nova 분석 파이프라인 시작 (Lite→Pro 듀얼 모델)',
    });

    console.log(`[Job ${jobId}] 개선된 분석 파이프라인 시작...`);

    const analysis = await analyzeVideo(s3Uri, bucketOwner, async (stage) => {
      const stageMap: Record<string, { progress: string; detail: string }> = {
        pass1_stepA: { progress: 'analyzing_pass1_stepA', detail: 'Nova 2 Lite 대사/오디오 분석 중 (Step A: 화자 식별)' },
        pass1_stepB: { progress: 'analyzing_pass1_stepB', detail: 'Nova 2 Lite 상호작용 분석 중 (Step B: 인과관계)' },
        pass1_stepC: { progress: 'analyzing_pass1_stepC', detail: 'Nova 2 Pro 스토리 종합 중 (Step C: 스토리 아크)' },
        verifying: { progress: 'verifying', detail: 'Nova 2 Pro 반박 질문으로 분석 결과 검증 중' },
        pass2: { progress: 'analyzing_pass2', detail: 'Nova 2 Pro 만화 패널 구조 추출 중 (Pass 2)' },
      };
      const info = stageMap[stage];
      if (info) {
        await updateJob(jobId, {
          progress: info.progress as import('@/lib/types').JobProgress,
          progressDetail: info.detail,
        });
      }
    }, {
      transcriptText,
      frameImages,
    });
    console.log(`[Job ${jobId}] 분석 완료: ${analysis.panels.length}개 패널`);

    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_panels',
      progressDetail: `Nova Canvas 패널별 이미지 생성 시작 (${analysis.panels.length}개)`,
    });

    const panels: Panel[] = analysis.panels.map((p) => ({
      panelId: p.panelId,
      description: p.description,
      emotion: p.emotion as Panel['emotion'],
      dialogue: p.dialogue || undefined,
      dialogueKo: p.dialogueKo || undefined,
    }));

    console.log(`[Job ${jobId}] 패널별 이미지 생성 시작 (${artStyle})...`);
    const panelsWithImages = await generatePanelImages(
      jobId,
      panels,
      artStyle,
      analysis.characterDescriptions || '',
      analysis.summary
    );

    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_comic',
      progressDetail: 'Nova Canvas 통합 만화 페이지 생성 중',
    });

    console.log(`[Job ${jobId}] 통합 만화 페이지 생성 중...`);
    let comicPageUrl = '';
    try {
      const comicPageBuffer = await generateSingleComicPage(
        panels,
        artStyle,
        analysis.characterDescriptions || ''
      );
      const comicPageKey = `videos/${jobId}/comic-page.png`;
      comicPageUrl = await uploadImageAndGetUrl(comicPageKey, comicPageBuffer);
    } catch (err) {
      console.warn(`[Job ${jobId}] 통합 만화 페이지 생성 실패 (패널 모드로 폴백):`, err);
    }

    await assertNotCancelled(jobId);

    const storyJson: StoryJson = {
      videoId: jobId,
      duration: analysis.duration,
      summary: analysis.summary,
      summaryKo: analysis.summaryKo,
      climaxIndex: Math.min(analysis.climaxIndex, panelsWithImages.length - 1),
      panels: panelsWithImages,
      comicPageUrl,
      novaModelsUsed: [
        'Nova 2 Lite (Step A/B 추출 분석)',
        'Nova 2 Pro (Step C 스토리 종합 + Pass 2 패널 기획 + 반박 검증)',
        'AWS Transcribe (대사 추출)',
        'Nova Canvas (패널별 이미지 생성)',
      ],
      hasAudioDialogue: analysis.hasAudioDialogue ?? false,
      artStyle,
      dialogueLanguage: 'en',
      characterDescriptions: analysis.characterDescriptions,
      isPanelMode: true,
      transcribeText: transcribeResult?.fullText || undefined,
    };

    await saveStoryJson(jobId, storyJson);

    await updateJob(jobId, {
      status: 'completed',
      storyJson,
      progress: 'completed',
      progressDetail: '만화 생성 완료!',
    });

    console.log(`[Job ${jobId}] 전체 파이프라인 완료`);
  } catch (err) {
    if (err instanceof JobCancelledError) {
      console.log(`[Job ${jobId}] 작업이 취소되었습니다.`);
      return;
    }

    console.error(`[Job ${jobId}] 파이프라인 오류:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
