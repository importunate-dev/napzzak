import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
} from '@aws-sdk/client-transcribe';
import { uploadToS3 } from '@/lib/s3';
import { saveVideoToTemp, cleanupTemp } from '@/lib/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

const transcribeClient = new TranscribeClient({ region: REGION });

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  speaker?: string;
  text: string;
}

export interface TranscribeResult {
  fullText: string;
  segments: TranscriptSegment[];
  languageCode?: string;
}

/**
 * 영상 버퍼에서 오디오를 추출하고 AWS Transcribe로 대사를 추출합니다.
 */
export async function transcribeFromVideo(
  videoBuffer: Buffer,
  jobId: string
): Promise<TranscribeResult> {
  let videoPath = '';
  let audioPath = '';

  try {
    // 1. 영상을 임시 파일로 저장
    videoPath = await saveVideoToTemp(videoBuffer);

    // 2. ffmpeg으로 오디오 추출
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'napzzak-audio-'));
    audioPath = path.join(tmpDir, 'audio.mp3');
    await extractAudio(videoPath, audioPath);
    console.log(`[Transcribe] 오디오 추출 완료: ${audioPath}`);

    // 3. S3에 오디오 업로드
    const audioBuffer = await fs.readFile(audioPath);
    const audioKey = `temp/${jobId}/audio.mp3`;
    await uploadToS3(audioKey, audioBuffer, 'audio/mpeg');
    const s3AudioUri = `s3://${BUCKET_NAME}/${audioKey}`;
    console.log(`[Transcribe] S3 업로드 완료: ${s3AudioUri}`);

    // 4. AWS Transcribe 실행
    const transcriptionJobName = `napzzak-${jobId}-${Date.now()}`;
    await transcribeClient.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName,
        Media: { MediaFileUri: s3AudioUri },
        MediaFormat: 'mp3',
        IdentifyLanguage: true,
        LanguageOptions: ['ko-KR', 'en-US', 'ja-JP', 'zh-CN'],
        Settings: {
          ShowSpeakerLabels: true,
          MaxSpeakerLabels: 5,
        },
      })
    );
    console.log(`[Transcribe] 작업 시작: ${transcriptionJobName}`);

    // 5. 완료 대기
    const result = await waitForTranscription(transcriptionJobName);
    return result;
  } finally {
    // 임시 파일 정리
    if (videoPath) await cleanupTemp(videoPath);
    if (audioPath) {
      try {
        await fs.rm(path.dirname(audioPath), { recursive: true });
      } catch {
        // ignore
      }
    }
  }
}

function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .audioChannels(1)
      .audioFrequency(16000)
      .output(audioPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

async function waitForTranscription(jobName: string): Promise<TranscribeResult> {
  const MAX_WAIT_MS = 120_000; // 2분
  const POLL_INTERVAL_MS = 3_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const response = await transcribeClient.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );

    const status = response.TranscriptionJob?.TranscriptionJobStatus;

    if (status === TranscriptionJobStatus.COMPLETED) {
      const transcriptUri = response.TranscriptionJob?.Transcript?.TranscriptFileUri;
      if (!transcriptUri) {
        throw new Error('Transcribe 완료했지만 결과 URI가 없습니다');
      }

      const languageCode = response.TranscriptionJob?.LanguageCode;
      return await fetchAndParseTranscript(transcriptUri, languageCode);
    }

    if (status === TranscriptionJobStatus.FAILED) {
      const reason = response.TranscriptionJob?.FailureReason;
      throw new Error(`Transcribe 실패: ${reason}`);
    }

    // 대기
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Transcribe 타임아웃 (2분 초과)');
}

async function fetchAndParseTranscript(
  transcriptUri: string,
  languageCode?: string
): Promise<TranscribeResult> {
  const response = await fetch(transcriptUri);
  if (!response.ok) {
    throw new Error(`Transcribe 결과 다운로드 실패: ${response.status}`);
  }

  const data = await response.json();
  const segments: TranscriptSegment[] = [];

  // speaker label 매핑 구성
  const speakerMap = new Map<string, string>();
  if (data.results?.speaker_labels?.segments) {
    for (const seg of data.results.speaker_labels.segments) {
      for (const item of seg.items || []) {
        speakerMap.set(item.start_time, seg.speaker_label);
      }
    }
  }

  // items에서 세그먼트 구성
  const items = data.results?.items || [];
  let currentSegment: TranscriptSegment | null = null;

  for (const item of items) {
    if (item.type === 'pronunciation') {
      const startTime = parseFloat(item.start_time || '0');
      const endTime = parseFloat(item.end_time || '0');
      const speaker = speakerMap.get(item.start_time) || undefined;
      const text = item.alternatives?.[0]?.content || '';

      if (
        !currentSegment ||
        (currentSegment.speaker !== speaker) ||
        (startTime - currentSegment.endTime > 1.5)
      ) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = { startTime, endTime, speaker, text };
      } else {
        currentSegment.endTime = endTime;
        currentSegment.text += ' ' + text;
      }
    } else if (item.type === 'punctuation' && currentSegment) {
      currentSegment.text += item.alternatives?.[0]?.content || '';
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  const fullText = segments.map((s) => s.text).join(' ');
  console.log(`[Transcribe] 파싱 완료: ${segments.length}개 세그먼트, "${fullText.slice(0, 100)}..."`);

  return {
    fullText,
    segments,
    languageCode,
  };
}
