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
    throw new Error('No valid embedding found in Nova Embeddings response');
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
 * Removes visually duplicate scenes from the frame list.
 * Vectorizes each frame using Nova Multimodal Embeddings,
 * then removes frames with cosine similarity above the threshold.
 *
 * @returns Array of original indices of deduplicated frames
 */
export async function deduplicateFrames(
  framePaths: string[],
  similarityThreshold = 0.95
): Promise<number[]> {
  if (framePaths.length <= 4) {
    return framePaths.map((_, i) => i);
  }

  console.log(`[Embeddings] Generating embeddings for ${framePaths.length} frames...`);
  const embeddings: number[][] = [];
  for (const path of framePaths) {
    try {
      const embedding = await getImageEmbedding(path);
      embeddings.push(embedding);
    } catch (err) {
      console.warn(`[Embeddings] Frame embedding failed, skipping:`, err);
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

  console.log(`[Embeddings] ${framePaths.length} → ${keptIndices.length} (${framePaths.length - keptIndices.length} duplicates removed)`);
  return keptIndices;
}
