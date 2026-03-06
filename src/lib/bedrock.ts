import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type SystemContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

export interface NovaAnalysisResult {
  duration: number;
  fullVideoTimelineSummary?: string;
  summary: string;
  climaxIndex: number;
  hasAudioDialogue: boolean;
  panels: Array<{
    panelId: number;
    description: string;
    emotion: string;
  }>;
}

export async function analyzeVideo(
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
      {
        video: {
          format: 'mp4',
          source: {
            s3Location: {
              uri: s3Uri,
              bucketOwner,
            },
          },
        },
      } as ContentBlock,
      {
        text: `Watch this video carefully. Understand the complete narrative arc and the TRUE context of the situation.
Although the final output will be a SILENT comic page, you MUST pay close attention to the audio, dialogue, and sound effects to understand what is actually happening. Do not guess based on visuals alone.

Return JSON with this exact structure:
{
  "duration": <total video duration in seconds>,
  "contextAnalysis": "<Explain the true situation by combining audio (dialogue/sounds) and visual cues. What is actually going on?>",
  "fullVideoTimelineSummary": "<detailed summary of the ENTIRE video from start to end - beginning, middle, and ending.>",
  "summary": "<one-line summary in English of the full story>",
  "climaxIndex": <0-based index of the most dramatic/important panel>,
  "hasAudioDialogue": <true if the video contains spoken words, false otherwise>,
  "panels": [
    {
      "panelId": 1,
      "description": "<concise scene description in English for image generation, under 80 chars. Describe the visual action/moment ONLY - no dialogue>",
      "emotion": "<one of: joy, sadness, surprise, anger, fear, neutral>"
    }
  ]
}

Rules:
- Write "contextAnalysis" and "fullVideoTimelineSummary" first to fully grasp the story.
- Extract 4 to 6 panels in chronological order.
- "description" must be VISUAL only (max ~80 chars). Focus on character actions and expressions. No dialogue in the description.
- The climax panel should be the most dramatic moment.`,
      },
    ],
  };

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        messages: [userMessage],
        system: [systemPrompt],
        inferenceConfig: {
          maxTokens: 8192,
          temperature: 0.45,
          topP: 0.9,
        },
      })
    );

    const stopReason = response.stopReason;
    const outputContent = response.output?.message?.content;


    if (!outputContent || outputContent.length === 0) {
      throw new Error('Nova 2 Lite가 빈 응답을 반환했습니다');
    }

    const textBlock = outputContent.find((b) => 'text' in b);
    if (!textBlock || !('text' in textBlock)) {
      throw new Error('Nova 2 Lite 응답에 텍스트가 없습니다');
    }

    const content = textBlock.text as string;

    if (stopReason === 'max_tokens') {
      console.warn(`[Nova] 응답이 토큰 한도로 잘림 (시도 ${attempt + 1}/${MAX_RETRIES + 1})`);
      if (attempt < MAX_RETRIES) continue;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova] JSON 파싱 실패, 재시도 (시도 ${attempt + 1}/${MAX_RETRIES + 1})`);
        continue;
      }
      throw new Error('Nova 응답에서 JSON을 파싱할 수 없습니다: ' + content.slice(0, 200));
    }

    let result: NovaAnalysisResult;
    try {
      result = JSON.parse(jsonMatch[0]) as NovaAnalysisResult;
    } catch {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova] JSON 구문 오류, 재시도 (시도 ${attempt + 1}/${MAX_RETRIES + 1})`);
        continue;
      }
      throw new Error('Nova 응답 JSON 구문 오류: ' + content.slice(0, 200));
    }

    if (!result.panels || result.panels.length < 4) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova] 패널 수 부족 (${result.panels?.length}개), 재시도`);
        continue;
      }
      throw new Error(
        `Nova가 충분한 패널을 반환하지 않았습니다 (최소 4개 필요, 받은 수: ${result.panels?.length})`
      );
    }

    return result;
  }

  throw new Error('Nova 분석에 실패했습니다 (최대 재시도 초과)');
}
