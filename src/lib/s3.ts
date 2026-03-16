import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StoryJson } from './types';

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

const s3Client = new S3Client({ region: REGION });

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `s3://${BUCKET_NAME}/${key}`;
}

export async function uploadFrameAndGetUrl(key: string, body: Buffer): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: 'image/jpeg',
  }));

  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }), { expiresIn: 86400 });
}

export async function uploadImageAndGetUrl(key: string, body: Buffer, contentType = 'image/png'): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }), { expiresIn: 86400 });
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Cannot download ${key} from S3`);
  return Buffer.from(bytes);
}

export async function getPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }), { expiresIn: 86400 });
}

export async function saveStoryJson(jobId: string, storyJson: StoryJson): Promise<void> {
  const key = `videos/${jobId}/story.json`;
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(storyJson),
    ContentType: 'application/json',
  }));
}

export async function loadStoryJson(jobId: string): Promise<StoryJson | null> {
  try {
    const key = `videos/${jobId}/story.json`;
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    const body = await response.Body?.transformToString();
    if (!body) return null;

    const storyJson = JSON.parse(body) as StoryJson;

    const comicPageKey = `videos/${jobId}/comic-page.png`;
    try {
      storyJson.comicPageUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: comicPageKey,
      }), { expiresIn: 86400 });
    } catch {
      storyJson.comicPageUrl = '';
    }

    return storyJson;
  } catch {
    return null;
  }
}

export function getS3Uri(key: string): string {
  return `s3://${BUCKET_NAME}/${key}`;
}

export function getBucketName(): string {
  return BUCKET_NAME;
}
