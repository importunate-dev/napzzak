#!/usr/bin/env node
/**
 * YouTube 링크 파이프라인 자동 테스트 스크립트
 * Usage: node test-pipeline.mjs
 */

const BASE_URL = 'http://localhost:3000';
const YOUTUBE_URL = 'https://www.youtube.com/shorts/hMhE7KvzZ8s';
const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 600_000; // 10분

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function submitJob(url) {
  console.log(`\n🚀 작업 제출: ${url}`);
  const res = await fetch(`${BASE_URL}/api/upload-youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, artStyle: 'GRAPHIC_NOVEL_ILLUSTRATION' }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`제출 실패 [${res.status}]: ${text}`);
  }

  const data = JSON.parse(text);
  if (!data.jobId) throw new Error(`jobId 없음: ${text}`);
  console.log(`✅ jobId: ${data.jobId}`);
  return data.jobId;
}

async function pollJob(jobId) {
  const start = Date.now();
  let lastDetail = '';

  while (true) {
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error('⏱ 타임아웃 (10분 초과)');
    }

    const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`폴링 실패 [${res.status}]: ${text}`);
    }

    const data = JSON.parse(text);
    const detail = data.progressDetail || data.progress || data.status;

    if (detail !== lastDetail) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  [${elapsed}s] ${detail}`);
      lastDetail = detail;
    }

    if (data.status === 'completed') {
      return data;
    }

    if (data.status === 'failed') {
      throw new Error(`❌ 작업 실패: ${data.error}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('napzzak 파이프라인 테스트');
  console.log('='.repeat(60));

  // 서버 준비 대기
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok || res.status === 404) break;
    } catch {
      console.log(`서버 대기 중... (${i + 1}/10)`);
      await sleep(3000);
    }
  }

  try {
    const jobId = await submitJob(YOUTUBE_URL);
    console.log(`\n📊 진행 상황 모니터링...`);
    const result = await pollJob(jobId);

    console.log('\n' + '='.repeat(60));
    console.log('✅ 완료!');
    console.log(`  summary: ${result.storyJson?.summary}`);
    console.log(`  패널 수: ${result.storyJson?.panels?.length}`);
    console.log(`  isPanelMode: ${result.storyJson?.isPanelMode}`);
    console.log(`  comicPageUrl: ${result.storyJson?.comicPageUrl ? '있음' : '없음'}`);
    const panelsWithImage = result.storyJson?.panels?.filter((p) => p.imageUrl).length ?? 0;
    console.log(`  이미지 있는 패널: ${panelsWithImage}/${result.storyJson?.panels?.length}`);
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ 오류:', err.message);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

run();
