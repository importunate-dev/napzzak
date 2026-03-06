import { NextRequest, NextResponse } from 'next/server';
import { loadStoryJson, uploadImageAndGetUrl, saveStoryJson } from '@/lib/s3';
import { generateSingleComicPage } from '@/lib/canvas';
import { ArtStyle } from '@/lib/types';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { jobId, artStyle } = (await request.json()) as {
      jobId: string;
      artStyle: ArtStyle;
    };

    if (!jobId || !artStyle) {
      return NextResponse.json({ error: 'jobId와 artStyle이 필요합니다' }, { status: 400 });
    }

    const storyJson = await loadStoryJson(jobId);
    if (!storyJson) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    if (!storyJson.panels || storyJson.panels.length === 0) {
      return NextResponse.json({ error: '패널 정보가 없습니다' }, { status: 400 });
    }

    console.log(`[Restyle ${jobId}] 그림체 변경: ${artStyle}`);

    const comicPageBuffer = await generateSingleComicPage(storyJson.panels, artStyle);

    const comicPageKey = `videos/${jobId}/comic-page.png`;
    storyJson.comicPageUrl = await uploadImageAndGetUrl(comicPageKey, comicPageBuffer);
    storyJson.artStyle = artStyle;

    await saveStoryJson(jobId, storyJson);

    console.log(`[Restyle ${jobId}] 완료`);

    return NextResponse.json({ storyJson });
  } catch (err) {
    console.error('[Restyle] 오류:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '그림체 변경 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
