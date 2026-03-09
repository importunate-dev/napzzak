import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type SystemContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { TranscribeResult } from '@/lib/transcribe';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

// ─── Pass 1: 영상 심층 분석 결과 ───

export interface VideoDeepAnalysis {
  duration: number;
  genre: string;
  hasAudioDialogue: boolean;
  characters: Array<{
    name: string;
    appearance: string;
    role: string;
  }>;
  timeline: Array<{
    timeRange: string;
    description: string;
    speakers?: string[];
    dialogue?: string;
  }>;
  fullStorySummary: string;
  keyMoments: string[];
}

// ─── Pass 2: 만화 패널 구조 ───

export interface NovaAnalysisResult {
  duration: number;
  summary: string;
  climaxIndex: number;
  hasAudioDialogue: boolean;
  characterDescriptions: string;
  panels: Array<{
    panelId: number;
    description: string;
    emotion: string;
    dialogue?: string;
    dialogueKo?: string;
  }>;
}

// ─── 유틸: Bedrock 호출 + JSON 파싱 ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromResponse(response: any): string {
  const outputContent = response?.output?.message?.content;
  if (!outputContent || outputContent.length === 0) {
    throw new Error('Bedrock: 빈 응답');
  }

  const textBlock = outputContent.find((b: ContentBlock) => 'text' in b);
  if (!textBlock || !('text' in textBlock)) {
    throw new Error('Bedrock: 텍스트 없음');
  }

  return textBlock.text as string;
}

function parseJsonFromText<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON 파싱 불가: ' + text.slice(0, 300));
  }
  return JSON.parse(jsonMatch[0]) as T;
}

function buildVideoContentBlock(s3Uri: string, bucketOwner: string): ContentBlock {
  return {
    video: {
      format: 'mp4',
      source: {
        s3Location: { uri: s3Uri, bucketOwner },
      },
    },
  } as ContentBlock;
}

function buildFrameContentBlocks(frameImages: string[]): ContentBlock[] {
  return frameImages.map((base64, i) => ({
    image: {
      format: 'jpeg',
      source: { bytes: Buffer.from(base64, 'base64') },
    },
  } as ContentBlock));
}

// ─────────────────────────────────────────────
// Pass 1 Step A: 대사/오디오 검증
// ─────────────────────────────────────────────

async function stepA_DialogueVerification(
  s3Uri: string,
  bucketOwner: string,
  transcriptText?: string,
  frameImages?: string[]
): Promise<string> {
  const transcriptSection = transcriptText
    ? `\n\n=== AWS TRANSCRIBE RESULT (ground truth for dialogue) ===\n${transcriptText}\n=== END TRANSCRIBE ===\n\nThe above is the accurate text of what was spoken. But the speaker labels (spk_0, spk_1) are NOT mapped to specific people yet. YOUR JOB is to match each speaker label to a specific person you can SEE in the video.`
    : '';

  const systemPrompt: SystemContentBlock = {
    text: `You are a forensic video-audio analyst. Your SOLE job is to determine EXACTLY who speaks each line of dialogue.

METHODOLOGY - you MUST follow these steps:
1. First, LIST every person visible in the video by their appearance (e.g., "Person A: woman with dark hair in brown top", "Person B: man in blue shirt sitting at table").
2. For each line of dialogue, CHECK who is speaking by observing:
   - LIP MOVEMENTS: Whose mouth is moving when the words are heard?
   - CAMERA FOCUS: Is the camera showing the speaker or the listener?
   - BODY LANGUAGE: Who is gesturing while speaking?
   - SPATIAL POSITION: Where is the sound coming from relative to the people?
3. NEVER assume the person shown on screen is the speaker — sometimes the camera shows the LISTENER's reaction.
4. If Transcribe labels are provided (spk_0, spk_1), create a MAPPING TABLE: "spk_0 = [Person by appearance]", "spk_1 = [Person by appearance]".

Respond in plain text (NOT JSON). Be detailed and precise.`,
  };

  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
  ];

  if (frameImages && frameImages.length > 0) {
    contentBlocks.push(...buildFrameContentBlocks(frameImages.slice(0, 5)));
  }

  contentBlocks.push({
    text: `Watch this video carefully and analyze ALL dialogue/audio.${transcriptSection}

STEP 1 - CHARACTER INVENTORY:
List every person visible. Describe each by appearance ONLY (hair, clothing, body type, position).

STEP 2 - SPEAKER MAPPING:
For EACH line of dialogue:
- Quote the exact words spoken
- State the timestamp
- Identify the speaker by APPEARANCE (check lip movements!)
- State your CONFIDENCE (high/medium/low) and WHY you think this person is the speaker
- Note: the person SHOWN on screen may be the LISTENER, not the speaker

STEP 3 - SPEAKER LABEL MAPPING (if Transcribe data provided):
Create a table mapping Transcribe speaker IDs to visual characters:
- spk_0 = [describe person by appearance]
- spk_1 = [describe person by appearance]
Explain your reasoning for each mapping.

STEP 4 - DIALOGUE CONTEXT:
For each line, also note:
- The TONE (angry, playful, surprised, mocking, etc.)
- Who they are speaking TO
- Whether the dialogue is MIMICRY/IMITATION of someone else's voice or genuine speech
- Any NON-VERBAL sounds (gasps, laughter, thuds, etc.)`,
  } as ContentBlock);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 4096, temperature: 0.2, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  console.log(`[Nova Step A] 대사 분석 완료 (${text.length}자)`);
  return text;
}

// ─────────────────────────────────────────────
// Pass 1 Step B: 인물별 개별 행동 추적 + 인과관계
// ─────────────────────────────────────────────

/** B-0: 등장인물 목록 추출 (짧은 호출) */
async function stepB0_IdentifyCharacters(
  s3Uri: string,
  bucketOwner: string,
  frameImages?: string[]
): Promise<string[]> {
  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
  ];

  if (frameImages && frameImages.length > 0) {
    contentBlocks.push(...buildFrameContentBlocks(frameImages.slice(0, 3)));
  }

  contentBlocks.push({
    text: `List every person who appears in this video.
For each person, provide ONLY a short visual description of their appearance (clothing, hair, build).
Format: one person per line, like:
- man in light blue shirt and dark vest
- woman in white shirt and blue jeans

ONLY list people. No other text.`,
  } as ContentBlock);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [{ text: 'List all people visible in the video by their appearance. One per line. No extra text.' }],
      inferenceConfig: { maxTokens: 1024, temperature: 0.1, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  // 각 줄에서 인물 설명 추출
  const characters = text
    .split('\n')
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(line => line.length > 3);

  console.log(`[Nova Step B-0] ${characters.length}명 인물 식별: ${characters.join(' / ')}`);
  return characters;
}

/** B-1: 특정 인물 한 명의 행동만 추적 */
async function stepB1_TrackSingleCharacter(
  s3Uri: string,
  bucketOwner: string,
  characterDesc: string,
  frameImages?: string[]
): Promise<string> {
  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
  ];

  if (frameImages && frameImages.length > 0) {
    contentBlocks.push(...buildFrameContentBlocks(frameImages.slice(0, 5)));
  }

  contentBlocks.push({
    text: `TARGET PERSON: "${characterDesc}"

Watch the ENTIRE video and track ONLY this person. Ignore all other people.

For this person ONLY, answer:
1. STARTING POSITION: Where are they at the very beginning? (sitting/standing, where in the room, facing which direction)
2. TIMELINE OF ACTIONS: List every action this person takes, in chronological order:
   [TIME] → [action] (describe hands, body movement, facial expression)
3. MOVEMENT PATH: Do they move from one place to another? Where do they walk to?
4. HAND ACTIONS: What do their hands do? (pick up object, gesture, hold phone, wave, point, touch someone, etc.)
5. FACIAL EXPRESSIONS: What emotions do they show and when? (calm → surprised → angry, etc.)
6. INTERACTIONS: Do they approach anyone? Touch anyone? Look at anyone?
7. PRETEND ACTIONS: Do they pretend/mime/imitate anything? If so, what exactly do they pretend to do?

IMPORTANT: Report ONLY what "${characterDesc}" does. Do NOT describe other people's actions.`,
  } as ContentBlock);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [{
        text: `You are tracking a single person in a video. Focus EXCLUSIVELY on the person described as "${characterDesc}". Report only their actions, movements, and expressions. Ignore everyone else. Be precise about hand movements and body position.`,
      }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.2, topP: 0.9 },
    })
  );

  return extractTextFromResponse(response);
}

/** B-2: 개별 추적 결과를 종합하여 인과관계 도출 */
async function stepB2_MergeAndCausation(
  s3Uri: string,
  bucketOwner: string,
  characterTrackings: Array<{ character: string; tracking: string }>
): Promise<string> {
  const trackingReport = characterTrackings
    .map(ct => `=== TRACKING: "${ct.character}" ===\n${ct.tracking}\n=== END ===`)
    .join('\n\n');

  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
    {
      text: `Below are INDEPENDENT tracking reports for each person in this video.
Each report tracks ONLY that person's actions. Now compare them to find cause-effect relationships.

${trackingReport}

Based on the individual tracking reports above, determine:

1. TIMELINE MERGE: Interleave all actions into a single chronological timeline.
   Format: [TIME] [Person] → [Action]

2. CAUSE → EFFECT:
   For each reaction, identify what CAUSED it:
   - CAUSE: "[Person A description] did [X]"
   - EFFECT: "[Person B description] reacted with [Y]"
   - EVIDENCE: Which tracking report confirms this?

3. WHO IS THE INITIATOR?
   - Who performs an action FIRST that triggers a reaction in someone else?
   - Who is acting vs who is reacting?

4. PRETEND/PRANK ACTIONS:
   - If one person pretends to do something (e.g., mimics a phone call), state clearly:
     "The [person description] PRETENDS to [action]. This is NOT real."
   - Who is the prankster and who is the target?

5. EMOTIONAL FLOW:
   For each person, describe their emotional arc:
   [Person description]: [emotion at start] → [trigger event] → [emotion change] → [final emotion]`,
    } as ContentBlock,
  ];

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [{
        text: `You are merging per-character tracking reports into a unified timeline with cause-effect analysis. The individual reports are the ground truth for each person's actions — trust them. Your job is to find how one person's action triggered another person's reaction. Respond in plain text.`,
      }],
      inferenceConfig: { maxTokens: 4096, temperature: 0.2, topP: 0.9 },
    })
  );

  return extractTextFromResponse(response);
}

/** Step B 통합: 인물별 추적 → 병합 → 인과관계 */
async function stepB_ActionSequenceAnalysis(
  s3Uri: string,
  bucketOwner: string,
  frameImages?: string[]
): Promise<string> {
  // B-0: 인물 식별
  const characters = await stepB0_IdentifyCharacters(s3Uri, bucketOwner, frameImages);

  if (characters.length === 0) {
    console.warn('[Nova Step B] 인물 미식별, 폴백으로 전체 분석');
    characters.push('the main person in the video');
  }

  // B-1: 인물별 개별 추적 (최대 4명)
  const trackTargets = characters.slice(0, 4);
  const trackings: Array<{ character: string; tracking: string }> = [];

  for (const char of trackTargets) {
    console.log(`[Nova Step B-1] "${char}" 추적 중...`);
    const tracking = await stepB1_TrackSingleCharacter(s3Uri, bucketOwner, char, frameImages);
    trackings.push({ character: char, tracking });
    console.log(`[Nova Step B-1] "${char}" 추적 완료 (${tracking.length}자)`);
  }

  // B-2: 병합 + 인과관계 도출
  console.log('[Nova Step B-2] 개별 추적 결과 병합 중...');
  const merged = await stepB2_MergeAndCausation(s3Uri, bucketOwner, trackings);
  console.log(`[Nova Step B] 행동 순서 분석 완료 (${merged.length}자)`);

  return merged;
}

// ─────────────────────────────────────────────
// Pass 1 Step C: 종합 (Step A + B → JSON)
// ─────────────────────────────────────────────

async function stepC_Synthesis(
  s3Uri: string,
  bucketOwner: string,
  stepAResult: string,
  stepBResult: string,
  transcriptText?: string
): Promise<VideoDeepAnalysis> {
  const transcriptNote = transcriptText
    ? `\n\n=== GROUND TRUTH TRANSCRIPT ===\n${transcriptText}\n=== END ===\nUse this transcript as the authoritative source for dialogue content.`
    : '';

  const systemPrompt: SystemContentBlock = {
    text: `You are an expert video analyst synthesizing multiple analysis passes into a final result.

ABSOLUTE PRIORITY RULES for resolving conflicts:
1. WHO SAID each line of dialogue → Trust Step A's speaker mapping (lip movement analysis)
2. WHO DID each physical action → Trust Step B's PER-CHARACTER tracking. Step B tracked each person INDIVIDUALLY, so each person's actions are guaranteed to be correctly attributed to THAT person.
3. WHAT was said → Trust Transcribe ground truth (if provided), then Step A
4. CAUSE → EFFECT order → Trust Step B's merged timeline and cause-effect analysis
5. If Step A says "Person X spoke" but Step B's individual tracking of Person X shows their mouth was closed → trust Step B

You MUST respond with valid JSON only. No markdown, no explanation, no extra text.`,
  };

  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
    {
      text: `Synthesize these two expert analyses into a final result.

=== DIALOGUE ANALYSIS (Step A: Speaker Attribution) ===
${stepAResult}
=== END DIALOGUE ANALYSIS ===

=== ACTION SEQUENCE ANALYSIS (Step B: Movement & Causation) ===
${stepBResult}
=== END ACTION SEQUENCE ANALYSIS ===${transcriptNote}

SYNTHESIS RULES:
1. For "speakers" field: Use Step A's speaker-to-appearance mapping. Each speaker must be identified by their VISUAL APPEARANCE.
2. For "description" field: Use Step B's PER-CHARACTER tracking results. Step B tracked each person SEPARATELY, so if Step B says "the woman in white shirt" did something, that is RELIABLE because the model was ONLY watching that person.
3. If Step A and Step B conflict about WHO does an action, ALWAYS trust Step B's per-character tracking (it cannot confuse subjects because it tracks one person at a time).
4. Pay special attention to Step B's PRETEND/PRANK analysis and CAUSE → EFFECT chain.
5. For pretend/mimicry actions: clearly state WHO is pretending and that it is pretend, not real.

Return JSON:
{
  "duration": <total video duration in seconds>,
  "genre": "<type of video>",
  "hasAudioDialogue": <true/false>,
  "characters": [
    {
      "name": "<descriptive label by appearance, e.g. 'Woman in brown top'>",
      "appearance": "<DETAILED physical description, MINIMUM 50 characters>",
      "role": "<role: initiator/prankster/reactor/victim/observer/etc.>"
    }
  ],
  "timeline": [
    {
      "timeRange": "<e.g. '0:00-0:10'>",
      "description": "<what happens — MUST correctly state WHO does WHAT based on Step B's evidence>",
      "speakers": ["<speaker identified by appearance from Step A>"],
      "dialogue": "<VERBATIM dialogue — attributed to correct speaker from Step A>"
    }
  ],
  "fullStorySummary": "<comprehensive summary: WHO (by appearance) initiates WHAT action → WHO reacts HOW → final outcome. MUST include correct cause-effect chain from Step B. Minimum 80 characters.>",
  "keyMoments": ["<moment with correct subject attribution>", "..."]
}

FINAL CHECK before responding:
- For each timeline entry, verify: Is the SUBJECT of the action the same person Step B identified?
- For each dialogue, verify: Is the SPEAKER the same person Step A identified via lip movements?
- Does fullStorySummary correctly state who is the prankster and who is the victim (if applicable)?`,
    } as ContentBlock,
  ];

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrockClient.send(
        new ConverseCommand({
          modelId: MODEL_ID,
          messages: [{ role: 'user', content: contentBlocks }],
          system: [systemPrompt],
          inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
        })
      );

      const text = extractTextFromResponse(response);
      const result = parseJsonFromText<VideoDeepAnalysis>(text);

      if (!result.characters) result.characters = [];
      if (!result.timeline) result.timeline = [];

      console.log(`[Nova Step C] 종합 완료: ${result.characters.length}명, ${result.timeline.length}개 세그먼트`);
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova Step C] 오류, 재시도 (${attempt + 1}): ${err}`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Nova Step C: 최대 재시도 초과');
}

// ─────────────────────────────────────────────
// Pass 1 통합: 3단계 Chain-of-Thought
// ─────────────────────────────────────────────

export async function analyzeVideoDeep(
  s3Uri: string,
  bucketOwner: string,
  options?: {
    transcriptText?: string;
    frameImages?: string[];
  }
): Promise<VideoDeepAnalysis> {
  const { transcriptText, frameImages } = options || {};

  console.log('[Nova Pass 1] Step A: 대사/오디오 검증 시작...');
  const stepAResult = await stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages);

  console.log('[Nova Pass 1] Step B: 행동 순서 분석 시작...');
  const stepBResult = await stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, frameImages);

  console.log('[Nova Pass 1] Step C: 종합 시작...');
  const result = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText);

  return result;
}

// ─────────────────────────────────────────────
// 품질 검증 게이트
// ─────────────────────────────────────────────

function validatePass1Quality(result: VideoDeepAnalysis): { valid: boolean; reason: string } {
  if (!result.fullStorySummary || result.fullStorySummary.length < 50) {
    return { valid: false, reason: `fullStorySummary too short (${result.fullStorySummary?.length ?? 0} chars, need 50+)` };
  }

  if (result.hasAudioDialogue) {
    const dialogueCount = result.timeline.filter(t => t.dialogue && t.dialogue.trim().length > 0).length;
    if (dialogueCount === 0) {
      return { valid: false, reason: 'hasAudioDialogue=true but no dialogue found in timeline' };
    }
  }

  if (result.characters.length > 0) {
    const allTooShort = result.characters.every(c => !c.appearance || c.appearance.length < 20);
    if (allTooShort) {
      return { valid: false, reason: 'All character appearances are under 20 chars' };
    }
  }

  return { valid: true, reason: 'OK' };
}

// ─────────────────────────────────────────────
// 반박 질문 기반 검증 (Adversarial Verification)
// ─────────────────────────────────────────────

async function verifyAnalysis(
  s3Uri: string,
  bucketOwner: string,
  analysis: VideoDeepAnalysis
): Promise<VideoDeepAnalysis> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a critical reviewer who looks for ERRORS in video analysis. You will challenge the analysis with specific adversarial questions, then produce a corrected version.
You MUST respond with valid JSON only. No markdown, no explanation.`,
  };

  const analysisJson = JSON.stringify(analysis, null, 2);

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Here is an analysis of this video. Your job is to CHALLENGE it and FIX errors.

${analysisJson}

Answer these adversarial questions by re-watching the video:

1. SPEAKER ATTRIBUTION: For each line of dialogue, verify WHO actually said it. Could the speaker be someone else? Check lip movements.

2. ACTION REVERSAL TEST: If you swap the subject and object of each action (e.g., "A pranks B" → "B pranks A"), does the SWAPPED version actually match the video better? If yes, the original analysis has the wrong subject.

3. CAUSE-EFFECT CHECK: For each event, is the stated cause actually what triggered it? Or did something else happen first? Could the cause-effect be reversed?

4. PRETEND vs REAL: Are any actions in the video PRETENDED/FAKED (e.g., pretending to be on the phone)? Does the analysis correctly distinguish pretend actions from real ones?

5. DIALOGUE-ACTION CONSISTENCY: Does each person's dialogue match their actions? If someone says "What are you doing?" are they the one performing the action or observing someone else's action?

After answering these questions, return the CORRECTED analysis as JSON with the same structure. Fix any errors you found. If the analysis is correct, return it unchanged.`,
      } as ContentBlock,
    ],
  };

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        messages: [userMessage],
        system: [systemPrompt],
        inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
      })
    );

    const text = extractTextFromResponse(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Nova Verify] JSON 파싱 실패, 원본 분석 유지');
      return analysis;
    }

    const verified = JSON.parse(jsonMatch[0]) as VideoDeepAnalysis;
    console.log('[Nova Verify] 반박 검증 완료');
    return verified;
  } catch (err) {
    console.warn('[Nova Verify] 검증 실패, 원본 분석 유지:', err);
    return analysis;
  }
}

// ─────────────────────────────────────────────
// Pass 2: 심층 분석 기반 만화 패널 구조 추출
// ─────────────────────────────────────────────

async function extractPanelStructure(
  s3Uri: string,
  bucketOwner: string,
  deepAnalysis: VideoDeepAnalysis
): Promise<NovaAnalysisResult> {
  const characterBriefing = deepAnalysis.characters
    .map(c => `  - ${c.name}: ${c.appearance} (Role: ${c.role})`)
    .join('\n');

  const timelineBriefing = deepAnalysis.timeline
    .map(t => {
      let entry = `  [${t.timeRange}] ${t.description}`;
      if (t.speakers?.length) entry += ` (Speakers: ${t.speakers.join(', ')})`;
      if (t.dialogue) entry += `\n    Dialogue: "${t.dialogue}"`;
      return entry;
    })
    .join('\n');

  const keyMomentsBriefing = deepAnalysis.keyMoments
    .map((m, i) => `  ${i + 1}. ${m}`)
    .join('\n');

  const analysisContext = `=== VIDEO ANALYSIS BRIEFING ===
Genre: ${deepAnalysis.genre}
Duration: ${deepAnalysis.duration}s
Has Audio Dialogue: ${deepAnalysis.hasAudioDialogue}

Characters:
${characterBriefing}

Full Story:
${deepAnalysis.fullStorySummary}

Key Moments:
${keyMomentsBriefing}

Timeline:
${timelineBriefing}
=== END BRIEFING ===`;

  const systemPrompt: SystemContentBlock = {
    text: `You are a comic book artist who converts video stories into comic panels.
You have already analyzed this video in detail. Use the provided analysis to create accurate comic panels.

The comic will be SILENT (no text in images), but dialogue will be overlaid separately by the frontend.
So you must still extract the key dialogue for each panel.

You MUST respond with valid JSON only. No markdown, no explanation.`,
  };

  const charDescs = deepAnalysis.characters
    .map(c => `${c.name}: ${c.appearance}`)
    .join('; ');

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Here is the detailed analysis of this video:
${analysisContext}

Now create 4 to 6 comic panels that tell this story visually.

Return JSON with this exact structure:
{
  "duration": ${deepAnalysis.duration},
  "summary": "<one-line English summary of the story>",
  "climaxIndex": <0-based index of the most dramatic/important panel>,
  "hasAudioDialogue": ${deepAnalysis.hasAudioDialogue},
  "characterDescriptions": "<combined visual description of ALL characters for consistent image generation>",
  "panels": [
    {
      "panelId": 1,
      "description": "<DETAILED scene description for image generation, 100-200 chars. Include specific character appearances, actions, expressions, setting details. Reference characters by their visual traits, not names.>",
      "emotion": "<one of: joy, sadness, surprise, anger, fear, neutral>",
      "dialogue": "<key dialogue in this moment in ENGLISH, or empty string if none>",
      "dialogueKo": "<same dialogue translated to Korean, or empty string>"
    }
  ]
}

CRITICAL RULES:
- "description" MUST reference characters by their VISUAL appearance (not names)
- "description" should be 100-200 characters, rich in visual detail
- Panels must follow chronological order and capture the ACTUAL story (use the analysis above)
- "dialogue" should contain the most important line spoken in that moment
- Select panels that together tell the complete story arc (setup → conflict → climax → resolution)
- "characterDescriptions" must be detailed enough for consistent image generation`,
      },
    ],
  };

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrockClient.send(
        new ConverseCommand({
          modelId: MODEL_ID,
          messages: [userMessage],
          system: [systemPrompt],
          inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
        })
      );

      const text = extractTextFromResponse(response);
      const result = parseJsonFromText<NovaAnalysisResult>(text);

      if (!result.panels || result.panels.length < 4) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[Nova Pass 2] 패널 수 부족 (${result.panels?.length}개), 재시도`);
          continue;
        }
        throw new Error(`Nova Pass 2: 패널 부족 (${result.panels?.length}개)`);
      }

      if (!result.characterDescriptions) {
        result.characterDescriptions = charDescs;
      }

      console.log(`[Nova Pass 2] 패널 구조 완료: ${result.panels.length}개 패널`);
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova Pass 2] 오류, 재시도 (${attempt + 1}): ${err}`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Nova Pass 2: 최대 재시도 초과');
}

// ─────────────────────────────────────────────
// 통합 분석 함수 (외부에서 호출)
// ─────────────────────────────────────────────

export type AnalysisStage = 'transcribing' | 'pass1_stepA' | 'pass1_stepB_identify' | 'pass1_stepB_track' | 'pass1_stepB_merge' | 'pass1_stepC' | 'verifying' | 'pass2';

/**
 * 개선된 영상 분석 파이프라인
 *
 * Pass 1: 3단계 Chain-of-Thought 심층 분석
 *   Step A: 대사/오디오 검증 (Transcribe 결과 활용)
 *   Step B: 행동 순서 + 인과관계 분석
 *   Step C: 종합 JSON 생성
 * Verification: 반박 질문 기반 검증
 * Pass 2: 만화 패널 구조 추출
 */
export async function analyzeVideo(
  s3Uri: string,
  bucketOwner: string,
  onProgress?: (stage: AnalysisStage) => void,
  options?: {
    transcriptText?: string;
    frameImages?: string[];
  }
): Promise<NovaAnalysisResult> {
  const { transcriptText, frameImages } = options || {};

  console.log('[Nova] === 개선된 분석 파이프라인 시작 ===');
  if (transcriptText) {
    console.log(`[Nova] Transcribe 텍스트 제공됨 (${transcriptText.length}자)`);
  }
  if (frameImages?.length) {
    console.log(`[Nova] 키프레임 ${frameImages.length}장 제공됨`);
  }

  // Pass 1: 3단계 CoT 심층 분석
  console.log('[Nova] Pass 1 Step A: 대사/오디오 검증 중...');
  onProgress?.('pass1_stepA');
  const stepAResult = await stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages);

  console.log('[Nova] Pass 1 Step B: 인물별 행동 추적 중...');
  onProgress?.('pass1_stepB_identify');
  const stepBResult = await stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, frameImages);

  console.log('[Nova] Pass 1 Step C: 종합 중...');
  onProgress?.('pass1_stepC');
  let deepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText);
  console.log(`[Nova] Pass 1 완료: "${deepAnalysis.fullStorySummary.slice(0, 100)}..."`);

  // 품질 검증 게이트
  const qualityCheck = validatePass1Quality(deepAnalysis);
  if (!qualityCheck.valid) {
    console.warn(`[Nova] Pass 1 품질 불합격: ${qualityCheck.reason} — 재시도`);
    deepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText);
    const retryCheck = validatePass1Quality(deepAnalysis);
    if (!retryCheck.valid) {
      console.warn(`[Nova] Pass 1 재시도에도 품질 불합격: ${retryCheck.reason} — 진행`);
    }
  }

  // 반박 질문 기반 검증
  console.log('[Nova] 반박 검증 중...');
  onProgress?.('verifying');
  deepAnalysis = await verifyAnalysis(s3Uri, bucketOwner, deepAnalysis);
  console.log('[Nova] 검증 완료');

  // Pass 2: 패널 구조 추출
  console.log('[Nova] Pass 2: 만화 패널 구조 추출 중...');
  onProgress?.('pass2');
  const panelStructure = await extractPanelStructure(s3Uri, bucketOwner, deepAnalysis);
  console.log(`[Nova] Pass 2 완료: ${panelStructure.panels.length}개 패널`);

  console.log('[Nova] === 분석 파이프라인 완료 ===');
  return panelStructure;
}

/**
 * 레거시 호환: 기존 1-pass 방식 (필요 시 폴백용)
 */
export async function analyzeVideoLegacy(
  s3Uri: string,
  bucketOwner: string
): Promise<NovaAnalysisResult> {
  const systemPrompt: SystemContentBlock = {
    text: `You are an expert video analyst and comic storyteller.
Your job is to watch a video and understand the ENTIRE story from beginning to end.
Then distill it into 4 to 6 panels that will form a SINGLE comic page.
These panels will be rendered as a SILENT comic - NO dialogue, NO speech bubbles. Visual storytelling only.

You MUST respond with valid JSON only. No markdown, no explanation, no extra text.`,
  };

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Watch this video carefully. Understand the complete narrative arc and the TRUE context of the situation.
Pay close attention to the audio, dialogue, and sound effects.

Return JSON:
{
  "duration": <seconds>,
  "summary": "<one-line English summary>",
  "climaxIndex": <0-based index>,
  "hasAudioDialogue": <true/false>,
  "characterDescriptions": "<visual description of all characters>",
  "panels": [
    {
      "panelId": 1,
      "description": "<100-200 char visual scene description for image generation>",
      "emotion": "<joy|sadness|surprise|anger|fear|neutral>",
      "dialogue": "<key dialogue in English>",
      "dialogueKo": "<Korean translation>"
    }
  ]
}`,
      },
    ],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 8192, temperature: 0.45, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  const result = parseJsonFromText<NovaAnalysisResult>(text);

  if (!result.panels || result.panels.length < 4) {
    throw new Error(`패널 부족: ${result.panels?.length}`);
  }

  return result;
}
