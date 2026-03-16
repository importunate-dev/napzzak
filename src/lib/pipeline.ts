import { uploadToS3, uploadImageAndGetUrl, saveStoryJson, downloadFromS3 } from '@/lib/s3';
import { analyzeVideo } from '@/lib/bedrock';
import { generatePanelImage, generateSingleComicPage } from '@/lib/canvas';
import { updateJob, isJobCancelled } from '@/lib/store';
import { StoryJson, Panel, ArtStyle } from '@/lib/types';
import { transcribeFromVideo, type TranscribeResult } from '@/lib/transcribe';
import { extractFrames, saveVideoToTemp, cleanupTemp, getBufferDuration } from '@/lib/ffmpeg';
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

const MODELS_USED = [
  'Nova Pro (Video Analysis)',
  'AWS Transcribe (Dialogue Extraction)',
  'Nova Canvas (Per-panel Image Generation)',
];

async function generatePanelImages(
  jobId: string,
  panels: Panel[],
  artStyle: ArtStyle,
  characterDescriptions: string,
  summary: string,
  setting?: string,
): Promise<Panel[]> {
  const updatedPanels: Panel[] = [];

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_panels',
      progressDetail: `Generating image for panel ${i + 1}/${panels.length}`,
    });

    console.log(`[Job ${jobId}] Generating panel ${i + 1}/${panels.length}...`);

    try {
      const imageBuffer = await generatePanelImage(
        panel,
        artStyle,
        characterDescriptions,
        summary,
        {
          prev: i > 0 ? panels[i - 1] : undefined,
          next: i < panels.length - 1 ? panels[i + 1] : undefined,
        },
        setting
      );

      const panelImageKey = `videos/${jobId}/panel-${panel.panelId}.png`;
      const panelImageUrl = await uploadImageAndGetUrl(panelImageKey, imageBuffer);

      updatedPanels.push({ ...panel, imageUrl: panelImageUrl });
      console.log(`[Job ${jobId}] Panel ${i + 1} generation complete`);
    } catch (err) {
      console.error(`[Job ${jobId}] Panel ${i + 1} generation failed:`, err);
      updatedPanels.push({ ...panel });
    }
  }

  return updatedPanels;
}

/**
 * Extracts keyframes from video buffer and converts to base64.
 */
export async function extractKeyframes(videoBuffer: Buffer, duration: number): Promise<string[]> {
  let videoPath = '';
  try {
    videoPath = await saveVideoToTemp(videoBuffer);

    // Extract keyframes at 0.5s intervals (no limit)
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

    console.log(`[Keyframes] ${frameImages.length} frames extracted`);
    return frameImages;
  } finally {
    if (videoPath) await cleanupTemp(videoPath);
  }
}

export async function processVideo(
  jobId: string,
  buffer: Buffer,
  artStyle: ArtStyle = 'GRAPHIC_NOVEL_ILLUSTRATION',
  youtubeUrl?: string,
) {
  const videoKey = `videos/${jobId}/original.mp4`;
  const s3Uri = await uploadToS3(videoKey, buffer, 'video/mp4');
  await updateJob(jobId, { status: 'processing', videoKey, progress: 'uploaded' });

  try {
    const bucketOwner = process.env.AWS_ACCOUNT_ID!;

    // Step 0a: Extract dialogue with AWS Transcribe
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'transcribing',
      progressDetail: 'Extracting dialogue with AWS Transcribe...',
    });

    let transcribeResult: TranscribeResult | null = null;
    let transcriptText: string | undefined;
    try {
      console.log(`[Job ${jobId}] Starting Transcribe...`);
      transcribeResult = await transcribeFromVideo(buffer, jobId);
      if (transcribeResult.fullText.trim().length > 0) {
        transcriptText = transcribeResult.segments
          .map(s => {
            const speaker = s.speaker ? `[${s.speaker}]` : '';
            const time = `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s]`;
            return `${time} ${speaker} ${s.text}`;
          })
          .join('\n');
        console.log(`[Job ${jobId}] Transcribe complete: ${transcribeResult.segments.length} segments`);
      } else {
        console.log(`[Job ${jobId}] Transcribe: No dialogue found`);
      }
    } catch (err) {
      console.warn(`[Job ${jobId}] Transcribe failed (continuing):`, err);
    }

    // Step 0b: Extract accurate duration with ffprobe + keyframe extraction
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'extracting_frames',
      progressDetail: 'Measuring video duration + extracting keyframes...',
    });

    let videoDuration: number | undefined;
    try {
      videoDuration = await getBufferDuration(buffer);
      console.log(`[Job ${jobId}] Video duration: ${videoDuration}s`);
    } catch (err) {
      console.warn(`[Job ${jobId}] Duration extraction failed (using 30s default):`, err);
    }

    let frameImages: string[] | undefined;
    try {
      console.log(`[Job ${jobId}] Starting keyframe extraction...`);
      frameImages = await extractKeyframes(buffer, videoDuration ?? 30);
      console.log(`[Job ${jobId}] ${frameImages.length} keyframes extracted`);
    } catch (err) {
      console.warn(`[Job ${jobId}] Keyframe extraction failed (continuing):`, err);
    }

    // Analysis stage: Nova Pro
    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'analyzing_pass1_stepA',
      progressDetail: 'Starting Nova Pro analysis pipeline',
    });
    console.log(`[Job ${jobId}] Starting Nova Pro analysis pipeline...`);

    const analysis = await analyzeVideo(s3Uri, bucketOwner, async (stage) => {
      const stageMap: Record<string, { progress: string; detail: string }> = {
        pass1_stepA: { progress: 'analyzing_pass1_stepA', detail: 'Nova Pro dialogue/audio analysis (Step A: Speaker identification)' },
        pass1_stepB: { progress: 'analyzing_pass1_stepB', detail: 'Nova Pro interaction analysis (Step B: Causality)' },
        pass1_debate: { progress: 'analyzing_pass1_debate', detail: 'Nova Pro resolving contradictions (Step D: Conflict analysis)' },
        pass1_stepC: { progress: 'analyzing_pass1_stepC', detail: 'Nova Pro story synthesis (Step C: Story arc)' },
        verifying: { progress: 'verifying', detail: 'Nova Pro verifying analysis with challenge questions' },
        pass2: { progress: 'analyzing_pass2', detail: 'Nova Pro extracting comic panel structure (Pass 2)' },
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
      duration: videoDuration,
    });

    console.log(`[Job ${jobId}] Analysis complete: ${analysis.panels.length} panels`);

    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_panels',
      progressDetail: `Starting Nova Canvas per-panel image generation (${analysis.panels.length} panels)`,
    });

    const panels: Panel[] = analysis.panels.map((p) => ({
      panelId: p.panelId,
      description: p.description,
      emotion: p.emotion as Panel['emotion'],
      dialogue: p.dialogue || undefined,
      dialogueKo: p.dialogueKo || undefined,
      narrativeContext: p.narrativeContext || undefined,
    }));

    console.log(`[Job ${jobId}] Starting per-panel image generation (${artStyle})...`);
    const panelsWithImages = await generatePanelImages(
      jobId,
      panels,
      artStyle,
      analysis.characterDescriptions || '',
      analysis.summary,
      analysis.setting,
    );

    await assertNotCancelled(jobId);
    await updateJob(jobId, {
      progress: 'generating_comic',
      progressDetail: 'Nova Canvas generating combined comic page',
    });

    console.log(`[Job ${jobId}] Generating combined comic page...`);
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
      console.warn(`[Job ${jobId}] Combined comic page generation failed (falling back to panel mode):`, err);
    }

    await assertNotCancelled(jobId);

    const storyJson: StoryJson = {
      videoId: jobId,
      duration: videoDuration ?? analysis.duration,
      summary: analysis.summary,
      summaryKo: analysis.summaryKo,
      climaxIndex: Math.min(analysis.climaxIndex, panelsWithImages.length - 1),
      panels: panelsWithImages,
      comicPageUrl,
      modelsUsed: MODELS_USED,
      novaModelsUsed: MODELS_USED,
      modelProvider: 'NOVA',
      hasAudioDialogue: analysis.hasAudioDialogue ?? false,
      artStyle,
      dialogueLanguage: 'en',
      characterDescriptions: analysis.characterDescriptions,
      isPanelMode: true,
      transcribeText: transcribeResult?.fullText || undefined,
      youtubeUrl,
    };

    await saveStoryJson(jobId, storyJson);

    await updateJob(jobId, {
      status: 'completed',
      storyJson,
      progress: 'completed',
      progressDetail: 'Comic generation complete!',
    });

    console.log(`[Job ${jobId}] Full pipeline complete`);
  } catch (err) {
    if (err instanceof JobCancelledError) {
      console.log(`[Job ${jobId}] Job was cancelled.`);
      return;
    }

    console.error(`[Job ${jobId}] Pipeline error:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
