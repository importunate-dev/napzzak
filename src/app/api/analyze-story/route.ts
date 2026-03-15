import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  stepA_DialogueVerification,
  stepB_ActionSequenceAnalysis,
  stepC_Synthesis,
  stepD_ContradictionResolution,
  validatePass1Quality,
  verifyAnalysis,
  extractPanelStructure,
  type VideoDeepAnalysis,
  type NovaAnalysisResult,
} from '@/lib/bedrock';
import { uploadToS3, uploadImageAndGetUrl } from '@/lib/s3';
import { downloadYouTube, validateYouTubeUrl, normalizeYouTubeUrl } from '@/lib/youtube';
import { transcribeFromVideo, type TranscribeResult } from '@/lib/transcribe';
import { extractKeyframes } from '@/lib/pipeline';
import { getBufferDuration } from '@/lib/ffmpeg';
import { generatePanelImage } from '@/lib/canvas';
import type { ArtStyle, Panel } from '@/lib/types';

export const maxDuration = 300;

const ART_STYLE_PREFIX: Record<ArtStyle, string> = {
  GRAPHIC_NOVEL_ILLUSTRATION: 'Graphic novel style, bold ink outlines, dramatic shading.',
  SOFT_DIGITAL_PAINTING: 'Soft digital painting, warm colors, dreamy atmosphere.',
  FLAT_VECTOR_ILLUSTRATION: 'Flat vector illustration, bold shapes, vibrant colors.',
  '3D_ANIMATED_FAMILY_FILM': '3D animated style, Pixar-quality, cinematic lighting.',
};

const NEGATIVE_TEXT = [
  'text', 'letters', 'words', 'writing', 'captions', 'subtitles', 'titles',
  'typography', 'font', 'handwriting', 'calligraphy', 'alphabet',
  'speech bubbles', 'thought bubbles', 'dialogue balloons', 'word balloons',
  'chat bubbles', 'comic bubbles', 'callout', 'speech balloon',
  'watermarks', 'logos', 'signatures', 'blurry', 'low quality', 'distorted',
  'deformed', 'ugly', 'duplicate', 'cropped badly',
  'photorealistic', 'photograph', 'real person', 'screenshot',
].join(', ');

function buildPanelPrompt(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string,
  _storyContext: string,
  adjacentPanels?: { prev?: Panel; next?: Panel }
): string {
  const stylePrefix = ART_STYLE_PREFIX[artStyle];

  const parts: string[] = [stylePrefix];

  // 인접 패널 컨텍스트 추가
  if (adjacentPanels?.prev) {
    parts.push(`Previous scene: ${adjacentPanels.prev.description.slice(0, 80)}.`);
  }
  if (adjacentPanels?.next) {
    parts.push(`Next scene: ${adjacentPanels.next.description.slice(0, 80)}.`);
  }

  parts.push(panel.description.slice(0, 400));

  if (characterDescriptions) {
    const hasAdjacent = adjacentPanels?.prev || adjacentPanels?.next;
    parts.push(characterDescriptions.slice(0, hasAdjacent ? 200 : 500));
  }

  parts.push(`Mood: ${panel.emotion}.`);
  parts.push('No text, no speech bubbles, no writing.');

  return parts.join(' ').slice(0, 1024);
}

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const { url } = body;

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'YouTube URL이 필요합니다' }, { status: 400 });
  }

  const normalizedUrl = normalizeYouTubeUrl(url);
  if (!validateYouTubeUrl(url)) {
    return NextResponse.json({ error: '유효하지 않은 YouTube URL입니다' }, { status: 400 });
  }

  try {
    // 1. YouTube 다운로드
    console.log(`[analyze-story] YouTube 다운로드 시작: ${normalizedUrl}`);
    const { buffer, title } = await downloadYouTube(normalizedUrl);
    console.log(`[analyze-story] 다운로드 완료: "${title}" (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    // 2. S3 업로드
    const tempId = uuidv4();
    const videoKey = `temp/${tempId}/original.mp4`;
    const s3Uri = await uploadToS3(videoKey, buffer, 'video/mp4');
    const bucketOwner = process.env.AWS_ACCOUNT_ID!;

    // 3. AWS Transcribe
    let transcribeResult: TranscribeResult | null = null;
    let transcriptText: string | undefined;
    try {
      console.log(`[analyze-story] Transcribe 시작...`);
      transcribeResult = await transcribeFromVideo(buffer, tempId);
      if (transcribeResult.fullText.trim().length > 0) {
        transcriptText = transcribeResult.segments
          .map(s => {
            const speaker = s.speaker ? `[${s.speaker}]` : '';
            const time = `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s]`;
            return `${time} ${speaker} ${s.text}`;
          })
          .join('\n');
        console.log(`[analyze-story] Transcribe 완료: ${transcribeResult.segments.length}개 세그먼트`);
      } else {
        console.log(`[analyze-story] Transcribe: 대사 없음`);
      }
    } catch (err) {
      console.warn(`[analyze-story] Transcribe 실패 (계속 진행):`, err);
    }

    // 4. ffprobe로 정확한 duration 추출 + 키프레임 추출
    let videoDuration: number | undefined;
    try {
      videoDuration = await getBufferDuration(buffer);
      console.log(`[analyze-story] 영상 길이: ${videoDuration}s`);
    } catch (err) {
      console.warn(`[analyze-story] duration 추출 실패 (30s 기본값 사용):`, err);
    }

    let frameImages: string[] | undefined;
    try {
      frameImages = await extractKeyframes(buffer, videoDuration ?? 30);
      console.log(`[analyze-story] 키프레임 ${frameImages.length}장 추출`);
    } catch (err) {
      console.warn(`[analyze-story] 키프레임 추출 실패:`, err);
    }

    // 5+6. Step A + B: 병렬 분석
    console.log(`[analyze-story] Step A + B 병렬 시작...`);
    const [stepAResult, stepBResult] = await Promise.all([
      stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages, videoDuration),
      stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, transcriptText, frameImages, videoDuration),
    ]);

    // Step D: 모순 해결 (Debate Agent)
    console.log(`[analyze-story] Step D (Debate) 시작...`);
    const debateResult = await stepD_ContradictionResolution(stepAResult, stepBResult, videoDuration);

    // 7. Step C: 종합 분석
    console.log(`[analyze-story] Step C 시작...`);
    let stepCResult: VideoDeepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, videoDuration, debateResult);

    // ffprobe 측정값으로 duration 덮어쓰기 (AI hallucination 방지)
    if (videoDuration !== undefined) {
      stepCResult.duration = videoDuration;
    }

    // 8. 품질 검증
    const qualityCheck = validatePass1Quality(stepCResult);
    console.log(`[analyze-story] 품질 검증: ${qualityCheck.valid ? 'PASS' : 'FAIL'} — ${qualityCheck.reason}`);
    if (!qualityCheck.valid) {
      console.warn(`[analyze-story] 품질 불합격, 재시도...`);
      stepCResult = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, videoDuration, debateResult);
      if (videoDuration !== undefined) {
        stepCResult.duration = videoDuration;
      }
    }

    // 9. 반박 검증
    console.log(`[analyze-story] 반박 검증 시작...`);
    const verifiedResult: VideoDeepAnalysis = await verifyAnalysis(s3Uri, bucketOwner, stepCResult);

    // ffprobe 측정값으로 duration 덮어쓰기 (검증 후에도 적용)
    if (videoDuration !== undefined) {
      verifiedResult.duration = videoDuration;
    }

    // 10. Pass 2: 패널 구조 추출
    console.log(`[analyze-story] Pass 2 시작...`);
    const pass2Result: NovaAnalysisResult = await extractPanelStructure(s3Uri, bucketOwner, verifiedResult);

    // 11. 이미지 생성
    console.log(`[analyze-story] 이미지 생성 시작 (${pass2Result.panels.length}개 패널)...`);
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
    }));

    for (let i = 0; i < allPanels.length; i++) {
      const panel = allPanels[i];
      const p = pass2Result.panels[i];
      const adjacent = {
        prev: i > 0 ? allPanels[i - 1] : undefined,
        next: i < allPanels.length - 1 ? allPanels[i + 1] : undefined,
      };

      const prompt = buildPanelPrompt(panel, artStyle, pass2Result.characterDescriptions || '', pass2Result.summary, adjacent);
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
          adjacent
        );
        const imageKey = `temp/${tempId}/debug-panel-${p.panelId}.png`;
        imageUrl = await uploadImageAndGetUrl(imageKey, imageBuffer);
        console.log(`[analyze-story] 패널 ${p.panelId} 이미지 생성 완료`);
      } catch (err) {
        console.error(`[analyze-story] 패널 ${p.panelId} 이미지 생성 실패:`, err);
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

    console.log(`[analyze-story] 풀 파이프라인 완료`);

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
    console.error(`[analyze-story] 오류:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
