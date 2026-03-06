import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { promises as fs } from 'fs';

const REGION = process.env.AWS_REGION || 'us-east-1';
const EMBEDDINGS_MODEL_ID = 'amazon.nova-2-multimodal-embeddings-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

export async function getImageEmbedding(imagePath: string): Promise<number[]> {
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const requestBody = {
    schemaVersion: 'nova-multimodal-embed-v1',
    taskType: 'SINGLE_EMBEDDING',
    singleEmbeddingParams: {
      embeddingPurpose: 'GENERIC_INDEX',
      embeddingDimension: 384,
      image: {
        format: 'jpeg',
        source: { bytes: base64Image },
      },
    },
  };

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: EMBEDDINGS_MODEL_ID,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json',
    })
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const embedding = responseBody.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Nova Embeddings 응답에 유효한 embedding이 없습니다');
  }
  return embedding as number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 프레임 목록에서 시각적으로 중복되는 장면을 제거합니다.
 * Nova Multimodal Embeddings로 각 프레임을 벡터화한 뒤,
 * 코사인 유사도가 threshold 이상인 프레임을 제거합니다.
 *
 * @returns 중복이 제거된 프레임의 원본 인덱스 배열
 */
export async function deduplicateFrames(
  framePaths: string[],
  similarityThreshold = 0.95
): Promise<number[]> {
  if (framePaths.length <= 4) {
    return framePaths.map((_, i) => i);
  }

  console.log(`[Embeddings] ${framePaths.length}개 프레임 임베딩 생성 중...`);
  const embeddings: number[][] = [];
  for (const path of framePaths) {
    try {
      const embedding = await getImageEmbedding(path);
      embeddings.push(embedding);
    } catch (err) {
      console.warn(`[Embeddings] 프레임 임베딩 실패, 건너뜀:`, err);
      embeddings.push([]);
    }
  }

  const keptIndices: number[] = [0];

  for (let i = 1; i < embeddings.length; i++) {
    if (!embeddings[i] || embeddings[i].length === 0) {
      keptIndices.push(i);
      continue;
    }

    let isDuplicate = false;
    for (const keptIdx of keptIndices) {
      if (!embeddings[keptIdx] || embeddings[keptIdx].length === 0) continue;
      const sim = cosineSimilarity(embeddings[i], embeddings[keptIdx]);
      if (sim >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      keptIndices.push(i);
    }
  }

  console.log(`[Embeddings] ${framePaths.length}개 → ${keptIndices.length}개 (${framePaths.length - keptIndices.length}개 중복 제거)`);
  return keptIndices;
}
