import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { v4 as uuidv4 } from 'uuid';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = 'amazon.nova-2-sonic-v1:0';

const http2Handler = new NodeHttp2Handler({
  requestTimeout: 60000,
  sessionTimeout: 60000,
  disableConcurrentStreams: false,
  maxConcurrentStreams: 10,
});

const sonicClient = new BedrockRuntimeClient({
  region: REGION,
  requestHandler: http2Handler,
});

interface SonicEvent {
  event: Record<string, unknown>;
}

function createSessionEvents(
  text: string,
  voiceId: string
): SonicEvent[] {
  const promptName = uuidv4();
  const systemContentName = uuidv4();
  const audioContentName = uuidv4();
  const userContentName = uuidv4();

  // Nova Sonic은 speech-to-speech 모델이므로 최소 하나의 오디오 콘텐츠가 필요합니다.
  // TTS 모드에서는 짧은 무음 오디오를 제공합니다.
  // 10ms silence at 24kHz 16-bit mono = 480 bytes
  const silenceBuffer = Buffer.alloc(480).toString('base64');

  return [
    {
      event: {
        sessionStart: {
          inferenceConfiguration: {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
          },
        },
      },
    },
    {
      event: {
        promptStart: {
          promptName,
          textOutputConfiguration: { mediaType: 'text/plain' },
          audioOutputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            voiceId,
            encoding: 'base64',
            audioType: 'SPEECH',
          },
        },
      },
    },
    {
      event: {
        contentStart: {
          promptName,
          contentName: systemContentName,
          type: 'TEXT',
          interactive: false,
          role: 'SYSTEM',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    {
      event: {
        textInput: {
          promptName,
          contentName: systemContentName,
          content:
            'You are a voice narrator for a comic strip. Read the given text expressively as if narrating a comic panel. Keep the delivery natural and dramatic.',
        },
      },
    },
    {
      event: {
        contentEnd: { promptName, contentName: systemContentName },
      },
    },
    // 오디오 콘텐츠 블록 (Nova Sonic 필수 요구사항)
    {
      event: {
        contentStart: {
          promptName,
          contentName: audioContentName,
          type: 'AUDIO',
          interactive: false,
          role: 'USER',
          audioInputConfiguration: {
            mediaType: 'audio/lpcm',
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            audioType: 'SPEECH',
            encoding: 'base64',
          },
        },
      },
    },
    {
      event: {
        audioInput: {
          promptName,
          contentName: audioContentName,
          content: silenceBuffer,
        },
      },
    },
    {
      event: {
        contentEnd: { promptName, contentName: audioContentName },
      },
    },
    // 텍스트 입력 (읽어줄 내용)
    {
      event: {
        contentStart: {
          promptName,
          contentName: userContentName,
          type: 'TEXT',
          interactive: false,
          role: 'USER',
          textInputConfiguration: { mediaType: 'text/plain' },
        },
      },
    },
    {
      event: {
        textInput: {
          promptName,
          contentName: userContentName,
          content: text,
        },
      },
    },
    {
      event: {
        contentEnd: { promptName, contentName: userContentName },
      },
    },
    {
      event: { promptEnd: { promptName } },
    },
    {
      event: { sessionEnd: {} },
    },
  ];
}

/**
 * Nova 2 Sonic을 사용하여 텍스트를 음성으로 변환합니다.
 * 24kHz 16-bit mono LPCM 오디오 데이터를 반환합니다.
 */
export async function generateSpeech(
  text: string,
  voiceId = 'matthew'
): Promise<Buffer> {
  const events = createSessionEvents(text, voiceId);
  const encoder = new TextEncoder();

  async function* generateChunks() {
    for (const event of events) {
      yield {
        chunk: {
          bytes: encoder.encode(JSON.stringify(event)),
        },
      };
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  const command = new InvokeModelWithBidirectionalStreamCommand({
    modelId: MODEL_ID,
    body: generateChunks(),
  });

  const response = await sonicClient.send(command);

  const audioChunks: Buffer[] = [];

  for await (const event of response.body!) {
    if (event.chunk?.bytes) {
      try {
        const text = new TextDecoder().decode(event.chunk.bytes);
        const json = JSON.parse(text);

        if (json.event?.audioOutput?.content) {
          const audioBytes = Buffer.from(json.event.audioOutput.content, 'base64');
          audioChunks.push(audioBytes);
        }
      } catch {
        // skip non-JSON or parsing errors
      }
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('Nova 2 Sonic이 오디오를 생성하지 못했습니다');
  }

  return Buffer.concat(audioChunks);
}

/**
 * LPCM (24kHz 16bit mono) 데이터를 WAV 포맷으로 변환합니다.
 */
export function lpcmToWav(pcmData: Buffer): Buffer {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
