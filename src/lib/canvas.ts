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

/** Art style prompt prefix (concise: ~60 chars) */
export const ART_STYLE_PREFIX: Record<ArtStyle, string> = {
  GRAPHIC_NOVEL_ILLUSTRATION: 'Graphic novel style, bold ink outlines, dramatic shading.',
  SOFT_DIGITAL_PAINTING: 'Soft digital painting, warm colors, dreamy atmosphere.',
  FLAT_VECTOR_ILLUSTRATION: 'Flat vector illustration, bold shapes, vibrant colors.',
  '3D_ANIMATED_FAMILY_FILM': '3D animated style, Pixar-quality, cinematic lighting.',
};

const PROMPT_LIMIT = 1024;
const NO_TEXT_DIRECTIVE = 'No text, no speech bubbles, no writing.';

/**
 * Builds a panel image prompt using priority-based budget allocation.
 *
 * Tier 1 (required, never trimmed): Art style prefix, Mood, "No text" directive
 * Tier 2 (high): Panel description (~45%), Character descriptions (~35%)
 * Tier 3 (medium): Setting, Narrative context
 * Tier 4 (low, removed first): Previous/Next scene context
 */
export function buildPanelPrompt(
  panel: Panel,
  artStyle: ArtStyle,
  characterDescriptions: string,
): string {
  const stylePrefix = ART_STYLE_PREFIX[artStyle];
  const moodText = `Mood: ${panel.emotion}.`;

  // ── Tier 1: Reserved budget (never trimmed) ──
  const tier1Parts = [stylePrefix, moodText, NO_TEXT_DIRECTIVE];
  const tier1Joined = tier1Parts.join(' ');
  const tier1Len = tier1Joined.length; // ~120-140 chars

  // Available budget = 1024 - tier1 - space separators (spaces between 3 parts)
  // ── Tier 2: Panel description + Character descriptions ──

  // ── Assembly: Style → Description → Characters → Mood → NoText ──
  const parts: string[] = [stylePrefix];
  parts.push(panel.description);

  // Add briefly to avoid duplicate descriptions
  if (characterDescriptions) {
    parts.push(`Characters: ${characterDescriptions}`);
  }
  parts.push(moodText);
  parts.push(NO_TEXT_DIRECTIVE);

  const prompt = parts.join(' ');

  // Safety guard — should not trigger under normal conditions
  if (prompt.length > PROMPT_LIMIT) {
    console.warn(`[buildPanelPrompt] Budget overflow: ${prompt.length}/${PROMPT_LIMIT}, trimming.`);
    return prompt.slice(0, PROMPT_LIMIT);
  }

  return prompt;
}

/**
 * Combined prompt for a single comic page (legacy method, fallback)
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

/** Enhanced negativeText - extensive text/speech bubble related keywords */
export const NEGATIVE_TEXT = [
  // Text related
  'text', 'letters', 'words', 'writing', 'captions', 'subtitles', 'titles',
  'typography', 'font', 'handwriting', 'calligraphy', 'alphabet',
  // Speech bubble related
  'speech bubbles', 'thought bubbles', 'dialogue balloons', 'word balloons',
  'chat bubbles', 'comic bubbles', 'callout', 'speech balloon',
  // Quality related
  'watermarks', 'logos', 'signatures', 'blurry', 'low quality', 'distorted',
  'deformed', 'ugly', 'duplicate', 'cropped badly',
  // Prevent photorealism (maintain comic style)
  'photorealistic', 'photograph', 'real person', 'screenshot',
].join(', ');

/**
 * Generates an individual image for a single panel.
 * This approach produces much better quality than single-page generation.
 */
/**
 * Generates a deterministic hash seed from a string.
 * Returns the same seed for identical input to maintain style consistency across panels.
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
  adjacentPanels?: { prev?: Panel; next?: Panel },
  setting?: string
): Promise<Buffer> {
  const prompt = buildPanelPrompt(panel, artStyle, characterDescriptions);

  // Fixed seed based on characterDescriptions for character/style consistency across panels
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
    throw new Error(`Nova Canvas did not return an image for panel ${panel.panelId}`);
  }

  return Buffer.from(images[0], 'base64');
}

/**
 * Generates a single comic page image (fallback/legacy method).
 * It is recommended to call generatePanelImage per panel when possible.
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
    throw new Error('Nova Canvas did not return an image');
  }

  return Buffer.from(images[0], 'base64');
}
