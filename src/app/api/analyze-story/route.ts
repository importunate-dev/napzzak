import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeVideoDeep, type VideoDeepAnalysis } from '@/lib/bedrock';
import { uploadToS3 } from '@/lib/s3';
import { downloadYouTube, validateYouTubeUrl, normalizeYouTubeUrl } from '@/lib/youtube';
import { transcribeFromVideo, type TranscribeResult } from '@/lib/transcribe';
import { extractFrames, saveVideoToTemp, cleanupTemp } from '@/lib/ffmpeg';
import { promises as fs } from 'fs';

export const maxDuration = 300;

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

    // 3. AWS Transcribe로 대사 추출 (병렬 가능하지만 순차로 진행)
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

    // 4. 키프레임 추출
    let frameImages: string[] | undefined;
    try {
      const videoPath = await saveVideoToTemp(buffer);
      const timestamps: number[] = [];
      for (let t = 0; t < 30 && timestamps.length < 10; t += 3) {
        timestamps.push(t);
      }
      const framePaths = await extractFrames(videoPath, timestamps);
      frameImages = [];
      for (const fp of framePaths) {
        try {
          const buf = await fs.readFile(fp);
          frameImages.push(buf.toString('base64'));
        } catch {
          // skip
        }
      }
      await cleanupTemp(videoPath);
      console.log(`[analyze-story] 키프레임 ${frameImages.length}장 추출`);
    } catch (err) {
      console.warn(`[analyze-story] 키프레임 추출 실패:`, err);
    }

    // 5. 개선된 3단계 CoT Pass 1 실행
    console.log(`[analyze-story] 3단계 CoT 분석 시작...`);
    const analysis: VideoDeepAnalysis = await analyzeVideoDeep(s3Uri, bucketOwner, {
      transcriptText,
      frameImages,
    });
    console.log(`[analyze-story] 분석 완료`);

    return NextResponse.json({
      title,
      url: normalizedUrl,
      analysis,
      transcribe: transcribeResult ? {
        fullText: transcribeResult.fullText,
        segments: transcribeResult.segments,
        languageCode: transcribeResult.languageCode,
      } : null,
    });
  } catch (err) {
    console.error(`[analyze-story] 오류:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
