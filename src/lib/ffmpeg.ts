import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export async function extractFrames(videoPath: string, timestamps: number[]): Promise<string[]> {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'napzzak-frames-'));
  const framePaths: string[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const outputPath = path.join(outputDir, `frame-${i}.jpg`);
    await extractSingleFrame(videoPath, timestamps[i], outputPath);
    framePaths.push(outputPath);
  }

  return framePaths;
}

function extractSingleFrame(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .outputOptions(['-q:v', '2'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

export async function saveVideoToTemp(buffer: Buffer): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'napzzak-video-'));
  const videoPath = path.join(tmpDir, 'input.mp4');
  await fs.writeFile(videoPath, buffer);
  return videoPath;
}

export async function cleanupTemp(...paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      await fs.rm(dir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
