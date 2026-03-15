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

/** 아트 스타일별 프롬프트 프리픽스 (간결화: ~40자 이내) */
const ART_STYLE_PREFIX: Record<ArtStyle, string> = {
  GRAPHIC_NOVEL_ILLUSTRATION: 'Graphic novel style, bold ink outlines, dramatic shading.',
  SOFT_DIGITAL_PAINTING: 'Soft digital painting, warm colors, dreamy atmosphere.',
  FLAT_VECTOR_ILLUSTRATION: 'Flat vector illustration, bold shapes, vibrant colors.',
  '3D_ANIMATED_FAMILY_FILM': '3D animated style, Pixar-quality, cinematic lighting.',
};

/**
 * 패널별 개별 이미지 생성 프롬프트를 구성합니다.
 * 캐릭터 일관성을 위해 characterDescriptions를 모든 패널에 공통으로 넣습니다.
 */
function buildPanelPrompt(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string,
  storyContext: string,
  adjacentPanels?: { prev?: Panel; next?: Panel }
): string {
  const stylePrefix = ART_STYLE_PREFIX[artStyle];

  const parts: string[] = [stylePrefix];

  // 인접 패널 컨텍스트 추가 (최대 ~180자)
  if (adjacentPanels?.prev) {
    parts.push(`Previous scene: ${adjacentPanels.prev.description.slice(0, 80)}.`);
  }
  if (adjacentPanels?.next) {
    parts.push(`Next scene: ${adjacentPanels.next.description.slice(0, 80)}.`);
  }

  parts.push(panel.description.slice(0, 500));

  if (characterDescriptions) {
    const hasAdjacent = adjacentPanels?.prev || adjacentPanels?.next;
    parts.push(characterDescriptions.slice(0, hasAdjacent ? 200 : 350));
  }

  parts.push(`Mood: ${panel.emotion}`);
  parts.push('No text, no speech bubbles, no writing.');

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
/**
 * 문자열에서 결정론적 해시 시드를 생성합니다.
 * 동일 입력이면 항상 같은 시드를 반환하여 패널 간 스타일 일관성을 유지합니다.
 */
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100000;
}

export async function generatePanelImage(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string = '',
  storyContext: string = '',
  adjacentPanels?: { prev?: Panel; next?: Panel }
): Promise<Buffer> {
  const prompt = buildPanelPrompt(panel, artStyle, characterDescriptions, storyContext, adjacentPanels);

  // characterDescriptions 기반 고정 시드로 패널 간 캐릭터/스타일 일관성 유지
  const baseSeed = hashSeed(characterDescriptions + artStyle);
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
      cfgScale: 10.0,
      seed: baseSeed + panel.panelId,
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