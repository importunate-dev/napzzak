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

/** 아트 스타일별 프롬프트 프리픽스 */
const ART_STYLE_PREFIX: Record<ArtStyle, string> = {
  GRAPHIC_NOVEL_ILLUSTRATION: 'Professional graphic novel illustration style, bold ink outlines, dramatic shading, rich colors.',
  SOFT_DIGITAL_PAINTING: 'Soft digital painting style, warm colors, gentle brushstrokes, dreamy atmosphere.',
  FLAT_VECTOR_ILLUSTRATION: 'Clean flat vector illustration style, bold shapes, minimal shading, vibrant solid colors.',
  '3D_ANIMATED_FAMILY_FILM': '3D animated family film style, Pixar-quality rendering, expressive characters, cinematic lighting.',
};

/**
 * 패널별 개별 이미지 생성 프롬프트를 구성합니다.
 * 캐릭터 일관성을 위해 characterDescriptions를 모든 패널에 공통으로 넣습니다.
 */
function buildPanelPrompt(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string,
  storyContext: string
): string {
  const stylePrefix = ART_STYLE_PREFIX[artStyle];
  const parts: string[] = [
    stylePrefix,
    'Single comic panel illustration. No text, no speech bubbles, no letters, no words, no captions, no writing of any kind.',
  ];

  // 캐릭터 일관성 정보 (분석 단계에서 추출)
  if (characterDescriptions) {
    parts.push(`Characters: ${characterDescriptions.slice(0, 200)}`);
  }

  // 스토리 컨텍스트 (이 패널이 전체 이야기의 어느 위치인지)
  if (storyContext) {
    parts.push(`Story context: ${storyContext.slice(0, 100)}`);
  }

  // 패널 description (더 길게 허용 - 200자)
  parts.push(`Scene: ${panel.description.slice(0, 200)}`);

  // 감정 힌트
  parts.push(`Mood/emotion: ${panel.emotion}`);

  const prompt = parts.join(' ').slice(0, 1024);
  return prompt;
}

/**
 * 단일 만화 페이지를 위한 통합 프롬프트 (기존 방식, 폴백용)
 */
function buildComicPagePrompt(
  panels: Panel[],
  artStyle: ArtStyle,
  characterDescriptions: string
): string {
  const layout = panels.length <= 4 ? '2x2' : '2x3';
  const stylePrefix = ART_STYLE_PREFIX[artStyle];

  const parts: string[] = [
    stylePrefix,
    `Single comic page with ${panels.length} panels arranged in a ${layout} grid layout.`,
    'Absolutely NO text, NO speech bubbles, NO dialogue, NO letters, NO words, NO captions anywhere in the image. Pure visual storytelling only.',
  ];

  if (characterDescriptions) {
    parts.push(`Characters throughout: ${characterDescriptions.slice(0, 200)}`);
  }

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    parts.push(`Panel ${i + 1}: ${p.description.slice(0, 120)}. Emotion: ${p.emotion}.`);
  }

  const prompt = parts.join(' ').slice(0, 1024);
  return prompt;
}

/** 강화된 negativeText - 텍스트/말풍선 관련 키워드 대량 추가 */
const NEGATIVE_TEXT = [
  // 텍스트 관련
  'text', 'letters', 'words', 'writing', 'captions', 'subtitles', 'titles',
  'typography', 'font', 'handwriting', 'calligraphy', 'alphabet',
  // 말풍선 관련
  'speech bubbles', 'thought bubbles', 'dialogue balloons', 'word balloons',
  'chat bubbles', 'comic bubbles', 'callout', 'speech balloon',
  // 품질 관련
  'watermarks', 'logos', 'signatures', 'blurry', 'low quality', 'distorted',
  'deformed', 'ugly', 'duplicate', 'cropped badly',
  // 실사 방지 (만화 스타일 유지)
  'photorealistic', 'photograph', 'real person', 'screenshot',
].join(', ');

/**
 * 패널 하나에 대한 개별 이미지를 생성합니다.
 * 이 방식이 단일 페이지 통합 생성보다 품질이 훨씬 좋습니다.
 */
export async function generatePanelImage(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string = '',
  storyContext: string = ''
): Promise<Buffer> {
  const prompt = buildPanelPrompt(panel, artStyle, characterDescriptions, storyContext);

  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      negativeText: NEGATIVE_TEXT,
    },
    imageGenerationConfig: {
      width: 1024,
      height: 1024,
      quality: 'premium',
      cfgScale: 8.0,
      seed: 42 + panel.panelId, // 패널마다 다른 시드로 다양성 확보
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
    throw new Error(`Nova Canvas error (panel ${panel.panelId}): ${errMsg}`);
  }

  const images = responseBody.images;
  if (!images || images.length === 0) {
    throw new Error(`Nova Canvas가 패널 ${panel.panelId} 이미지를 반환하지 않았습니다`);
  }

  return Buffer.from(images[0], 'base64');
}

/**
 * 단일 만화 페이지 이미지를 생성합니다 (폴백/레거시 방식).
 * 가능하면 generatePanelImage를 패널별로 호출하는 방식을 추천합니다.
 */
export async function generateSingleComicPage(
  panels: Panel[],
  artStyle: ArtStyle,
  characterDescriptions: string = ''
): Promise<Buffer> {
  const prompt = buildComicPagePrompt(panels, artStyle, characterDescriptions);

  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      negativeText: NEGATIVE_TEXT,
    },
    imageGenerationConfig: {
      width: 2048,
      height: panels.length <= 4 ? 2048 : 1536,
      quality: 'premium',
      cfgScale: 8.0,
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