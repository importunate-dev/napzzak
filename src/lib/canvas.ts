import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ArtStyle, Panel } from './types';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = 'amazon.nova-canvas-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

function getErrorMessage(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
    if (o.error && typeof o.error === 'object' && typeof (o.error as Record<string, unknown>).message === 'string') {
      return (o.error as Record<string, unknown>).message as string;
    }
  }
  return '';
}

function buildComicPrompt(panels: Panel[]): string {
  const layout = panels.length <= 4 ? '2x2' : '2x3';
  const parts: string[] = [
    `Single SILENT comic page with ${panels.length} panels in a ${layout} grid. No speech bubbles, no dialogue. Professional comic illustration style. Visual storytelling only.`,
  ];

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const desc = p.description.slice(0, 70);
    parts.push(`Panel ${i + 1}: ${desc}.`);
  }

  const prompt = parts.join(' ').slice(0, 1024);
  return prompt;
}

export async function generateSingleComicPage(
  panels: Panel[],
  artStyle: ArtStyle
): Promise<Buffer> {
  const prompt = buildComicPrompt(panels);

  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      negativeText: 'watermarks, logos, distorted text, blurry',
      style: artStyle,
    },
    imageGenerationConfig: {
      width: 2048,
      height: panels.length <= 4 ? 2048 : 1536,
      quality: 'premium',
      cfgScale: 7.0,
      seed: 42,
      numberOfImages: 1,
    },
  };

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json',
    })
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
    error?: string;
    images?: string[];
  };
  const errMsg = getErrorMessage(responseBody) || (responseBody.error ?? '');

  if (errMsg) {
    throw new Error(`Nova Canvas error: ${errMsg}`);
  }

  const images = responseBody.images;
  if (!images || images.length === 0) {
    throw new Error('Nova Canvas가 이미지를 반환하지 않았습니다');
  }

  return Buffer.from(images[0], 'base64');
}
