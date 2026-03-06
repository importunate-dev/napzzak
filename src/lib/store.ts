import {
  createJobRecord,
  getJobRecord,
  updateJobRecord,
  cancelJobRecord,
} from './dynamodb';
import { Job, JobStatus, JobProgress, StoryJson } from './types';

export async function createJob(id: string, source?: string): Promise<Job> {
  return createJobRecord(id, source);
}

export async function getJob(id: string): Promise<Job | undefined> {
  return getJobRecord(id);
}

export async function updateJob(
  id: string,
  updates: Partial<{
    status: JobStatus;
    videoKey: string;
    storyJson: StoryJson;
    error: string;
    progress: JobProgress;
    progressDetail: string;
  }>
): Promise<Job | undefined> {
  return updateJobRecord(id, updates);
}

export async function cancelJob(id: string): Promise<boolean> {
  return cancelJobRecord(id);
}

export async function isJobCancelled(id: string): Promise<boolean> {
  const job = await getJobRecord(id);
  return job?.status === 'cancelled';
}
