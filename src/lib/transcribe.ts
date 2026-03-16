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
 * Extracts audio from video buffer and extracts dialogue using AWS Transcribe.
 */
export async function transcribeFromVideo(
  videoBuffer: Buffer,
  jobId: string
): Promise<TranscribeResult> {
  let videoPath = '';
  let audioPath = '';

  try {
    // 1. Save video to temp file
    videoPath = await saveVideoToTemp(videoBuffer);

    // 2. Extract audio with ffmpeg
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'napzzak-audio-'));
    audioPath = path.join(tmpDir, 'audio.mp3');
    await extractAudio(videoPath, audioPath);
    console.log(`[Transcribe] Audio extraction complete: ${audioPath}`);

    // 3. Upload audio to S3
    const audioBuffer = await fs.readFile(audioPath);
    const audioKey = `temp/${jobId}/audio.mp3`;
    await uploadToS3(audioKey, audioBuffer, 'audio/mpeg');
    const s3AudioUri = `s3://${BUCKET_NAME}/${audioKey}`;
    console.log(`[Transcribe] S3 upload complete: ${s3AudioUri}`);

    // 4. Run AWS Transcribe
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
    console.log(`[Transcribe] Job started: ${transcriptionJobName}`);

    // 5. Wait for completion
    const result = await waitForTranscription(transcriptionJobName);
    return result;
  } finally {
    // Clean up temp files
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
  const MAX_WAIT_MS = 120_000; // 2 minutes
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
        throw new Error('Transcribe completed but result URI is missing');
      }

      const languageCode = response.TranscriptionJob?.LanguageCode;
      return await fetchAndParseTranscript(transcriptUri, languageCode);
    }

    if (status === TranscriptionJobStatus.FAILED) {
      const reason = response.TranscriptionJob?.FailureReason;
      throw new Error(`Transcribe failed: ${reason}`);
    }

    // Wait
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Transcribe timeout (exceeded 2 minutes)');
}

async function fetchAndParseTranscript(
  transcriptUri: string,
  languageCode?: string
): Promise<TranscribeResult> {
  const response = await fetch(transcriptUri);
  if (!response.ok) {
    throw new Error(`Transcribe result download failed: ${response.status}`);
  }

  const data = await response.json();
  const segments: TranscriptSegment[] = [];

  // Build speaker label mapping
  const speakerMap = new Map<string, string>();
  if (data.results?.speaker_labels?.segments) {
    for (const seg of data.results.speaker_labels.segments) {
      for (const item of seg.items || []) {
        speakerMap.set(item.start_time, seg.speaker_label);
      }
    }
  }

  // Build segments from items
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
  console.log(`[Transcribe] Parsing complete: ${segments.length} segments, "${fullText.slice(0, 100)}..."`);

  return {
    fullText,
    segments,
    languageCode,
  };
}
