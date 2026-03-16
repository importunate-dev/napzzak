import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  stepA_DialogueVerification,
  stepB_ActionSequenceAnalysis,
  stepC_Synthesis,
  stepD_ContradictionResolution,
  validatePass1Quality,
  verifyAnalysis,
  extractPanelStructureMultiAgent,
  type VideoDeepAnalysis,
  type NovaAnalysisResult,
} from '@/lib/bedrock';
import { uploadToS3, uploadImageAndGetUrl } from '@/lib/s3';
import { downloadYouTube, validateYouTubeUrl, normalizeYouTubeUrl } from '@/lib/youtube';
import { transcribeFromVideo, type TranscribeResult } from '@/lib/transcribe';
import { extractKeyframes } from '@/lib/pipeline';
import { getBufferDuration } from '@/lib/ffmpeg';
import { generatePanelImage, buildPanelPrompt, NEGATIVE_TEXT } from '@/lib/canvas';
import type { ArtStyle, Panel } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
  }

  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  if (!validateYouTubeUrl(url)) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    // 1. YouTube download
    console.log(`[analyze-story] YouTube download started: ${normalizedUrl}`);
    const { buffer, title } = await downloadYouTube(normalizedUrl);
    console.log(`[analyze-story] Download complete: "${title}" (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    // 2. S3 upload
    const tempId = uuidv4();
    const videoKey = `temp/${tempId}/original.mp4`;
    const s3Uri = await uploadToS3(videoKey, buffer, 'video/mp4');
    const bucketOwner = process.env.AWS_ACCOUNT_ID!;

    // 3. AWS Transcribe
    let transcribeResult: TranscribeResult | null = null;
    let transcriptText: string | undefined;
    try {
      console.log(`[analyze-story] Starting Transcribe...`);
      transcribeResult = await transcribeFromVideo(buffer, tempId);
      if (transcribeResult.fullText.trim().length > 0) {
        transcriptText = transcribeResult.segments
          .map(s => {
            const speaker = s.speaker ? `[${s.speaker}]` : '';
            const time = `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s]`;
            return `${time} ${speaker} ${s.text}`;
          })
          .join('\n');
        console.log(`[analyze-story] Transcribe complete: ${transcribeResult.segments.length} segments`);
      } else {
        console.log(`[analyze-story] Transcribe: No dialogue found`);
      }
    } catch (err) {
      console.warn(`[analyze-story] Transcribe failed (continuing):`, err);
    }

    // 4. Extract accurate duration with ffprobe + keyframe extraction
    let videoDuration: number | undefined;
    try {
      videoDuration = await getBufferDuration(buffer);
      console.log(`[analyze-story] Video duration: ${videoDuration}s`);
    } catch (err) {
      console.warn(`[analyze-story] Duration extraction failed (using 30s default):`, err);
    }

    let frameImages: string[] | undefined;
    try {
      frameImages = await extractKeyframes(buffer, videoDuration ?? 30);
      console.log(`[analyze-story] ${frameImages.length} keyframes extracted`);
    } catch (err) {
      console.warn(`[analyze-story] Keyframe extraction failed:`, err);
    }

    // 5+6. Step A + B: Parallel analysis
    console.log(`[analyze-story] Step A + B parallel start...`);
    const [stepAResult, stepBResult] = await Promise.all([
      stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages, videoDuration),
      stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, transcriptText, frameImages, videoDuration),
    ]);

    // Step D: Contradiction resolution (Debate Agent)
    console.log(`[analyze-story] Step D (Debate) starting...`);
    const debateResult = await stepD_ContradictionResolution(stepAResult, stepBResult, videoDuration);

    // 7. Step C: Synthesis analysis
    console.log(`[analyze-story] Step C starting...`);
    let stepCResult: VideoDeepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, videoDuration, debateResult);

    // Override duration with ffprobe measurement (prevent AI hallucination)
    if (videoDuration !== undefined) {
      stepCResult.duration = videoDuration;
    }

    // 8. Quality validation
    const qualityCheck = validatePass1Quality(stepCResult);
    console.log(`[analyze-story] Quality check: ${qualityCheck.valid ? 'PASS' : 'FAIL'} — ${qualityCheck.reason}`);
    if (!qualityCheck.valid) {
      console.warn(`[analyze-story] Quality check failed, retrying...`);
      stepCResult = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, videoDuration, debateResult);
      if (videoDuration !== undefined) {
        stepCResult.duration = videoDuration;
      }
    }

    // 9. Challenge verification
    console.log(`[analyze-story] Starting challenge verification...`);
    const verifiedResult: VideoDeepAnalysis = await verifyAnalysis(s3Uri, bucketOwner, stepCResult);

    // Override duration with ffprobe measurement (applied after verification too)
    if (videoDuration !== undefined) {
      verifiedResult.duration = videoDuration;
    }

    // 10. Pass 2: Multi-agent panel structure extraction
    console.log(`[analyze-story] Pass 2 (multi-agent) starting...`);
    const pass2Result: NovaAnalysisResult = await extractPanelStructureMultiAgent(s3Uri, bucketOwner, verifiedResult);

    // 11. Image generation
    console.log(`[analyze-story] Image generation started (${pass2Result.panels.length} panels)...`);
    const artStyle: ArtStyle = 'GRAPHIC_NOVEL_ILLUSTRATION';
    const imagePrompts: Array<{ panelId: number; prompt: string; negativeText: string }> = [];
    const panelsWithImages: Array<{
      panelId: number;
      description: string;
      emotion: string;
      dialogue?: string;
      dialogueKo?: string;
      imageUrl?: string;
    }> = [];

    const allPanels: Panel[] = pass2Result.panels.map(p => ({
      panelId: p.panelId,
      description: p.description,
      emotion: p.emotion as Panel['emotion'],
      dialogue: p.dialogue || undefined,
      dialogueKo: p.dialogueKo || undefined,
      narrativeContext: p.narrativeContext || undefined,
    }));

    for (let i = 0; i < allPanels.length; i++) {
      const panel = allPanels[i];
      const p = pass2Result.panels[i];
      const adjacent = {
        prev: i > 0 ? allPanels[i - 1] : undefined,
        next: i < allPanels.length - 1 ? allPanels[i + 1] : undefined,
      };

      const prompt = buildPanelPrompt(panel, artStyle, pass2Result.characterDescriptions || '');
      imagePrompts.push({
        panelId: p.panelId,
        prompt,
        negativeText: NEGATIVE_TEXT,
      });

      let imageUrl: string | undefined;
      try {
        const imageBuffer = await generatePanelImage(
          panel,
          artStyle,
          pass2Result.characterDescriptions || '',
          pass2Result.summary,
          adjacent,
          pass2Result.setting
        );
        const imageKey = `temp/${tempId}/debug-panel-${p.panelId}.png`;
        imageUrl = await uploadImageAndGetUrl(imageKey, imageBuffer);
        console.log(`[analyze-story] Panel ${p.panelId} image generation complete`);
      } catch (err) {
        console.error(`[analyze-story] Panel ${p.panelId} image generation failed:`, err);
      }

      panelsWithImages.push({
        panelId: p.panelId,
        description: p.description,
        emotion: p.emotion,
        dialogue: p.dialogue || undefined,
        dialogueKo: p.dialogueKo || undefined,
        imageUrl,
      });
    }

    console.log(`[analyze-story] Full pipeline complete`);

    return NextResponse.json({
      title,
      url: normalizedUrl,
      transcribe: transcribeResult ? {
        fullText: transcribeResult.fullText,
        segments: transcribeResult.segments,
        languageCode: transcribeResult.languageCode,
      } : null,
      keyframeCount: frameImages?.length ?? 0,
      steps: {
        stepA: stepAResult,
        stepB: stepBResult,
        stepC: stepCResult,
        qualityCheck,
        verified: verifiedResult,
        pass2: pass2Result,
        imagePrompts,
      },
      panels: panelsWithImages,
    });
  } catch (err) {
    console.error(`[analyze-story] Error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
