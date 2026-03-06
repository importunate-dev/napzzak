import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Job, JobStatus, JobProgress, StoryJson } from './types';

const REGION = process.env.AWS_REGION || 'us-east-1';

function getTableName(): string {
  const accountId = process.env.AWS_ACCOUNT_ID;
  return process.env.DYNAMODB_TABLE_NAME || (accountId ? `napzzak-jobs-${accountId}` : 'napzzak-jobs');
}

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export type { JobProgress };

export interface JobRecord {
  id: string;
  status: JobStatus;
  videoKey?: string;
  storyJson?: StoryJson;
  error?: string;
  progress?: JobProgress;
  progressDetail?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

function toJob(record: JobRecord | null): Job | undefined {
  if (!record) return undefined;
  return {
    id: record.id,
    status: record.status,
    videoKey: record.videoKey,
    storyJson: record.storyJson,
    error: record.error,
    progress: record.progress,
    progressDetail: record.progressDetail,
    createdAt: record.createdAt,
  };
}

export async function createJobRecord(id: string, source?: string): Promise<Job> {
  const now = Date.now();
  const record: JobRecord = {
    id,
    status: 'uploading',
    createdAt: now,
    updatedAt: now,
    source,
  };

  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: record,
      ConditionExpression: 'attribute_not_exists(id)',
    })
  ).catch((e) => {
    if (e.name === 'ConditionalCheckFailedException') {
      return;
    }
    throw e;
  });

  return toJob(record)!;
}

export async function getJobRecord(id: string): Promise<Job | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: { id },
    })
  );

  const record = result.Item as JobRecord | undefined;
  return toJob(record ?? null);
}

export async function updateJobRecord(
  id: string,
  updates: Partial<Omit<JobRecord, 'id' | 'createdAt'>>
): Promise<Job | undefined> {
  const now = Date.now();
  const setParts: string[] = ['#updatedAt = :updatedAt'];
  const exprNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const exprValues: Record<string, unknown> = { ':updatedAt': now };

  if (updates.status !== undefined) {
    setParts.push('#status = :status');
    exprNames['#status'] = 'status';
    exprValues[':status'] = updates.status;
  }
  if (updates.videoKey !== undefined) {
    setParts.push('videoKey = :videoKey');
    exprValues[':videoKey'] = updates.videoKey;
  }
  if (updates.storyJson !== undefined) {
    setParts.push('storyJson = :storyJson');
    exprValues[':storyJson'] = updates.storyJson;
  }
  if (updates.error !== undefined) {
    setParts.push('#error = :error');
    exprNames['#error'] = 'error';
    exprValues[':error'] = updates.error;
  }
  if (updates.progress !== undefined) {
    setParts.push('progress = :progress');
    exprValues[':progress'] = updates.progress;
  }
  if (updates.progressDetail !== undefined) {
    setParts.push('progressDetail = :progressDetail');
    exprValues[':progressDetail'] = updates.progressDetail;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { id },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
      ExpressionAttributeValues: exprValues,
    })
  );

  return getJobRecord(id);
}

export async function cancelJobRecord(id: string): Promise<boolean> {
  const job = await getJobRecord(id);
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) {
    return false;
  }

  await updateJobRecord(id, { status: 'cancelled' });
  return true;
}

export async function ensureTableExists(): Promise<void> {
  const tableName = getTableName();

  try {
    await client.send(
      new DescribeTableCommand({ TableName: tableName })
    );
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === 'ResourceNotFoundException') {
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );
    } else {
      throw e;
    }
  }
}
