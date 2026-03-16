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
      return NextResponse.json({ error: 'jobId and artStyle are required' }, { status: 400 });
    }

    const storyJson = await loadStoryJson(jobId);
    if (!storyJson) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!storyJson.panels || storyJson.panels.length === 0) {
      return NextResponse.json({ error: 'No panel information available' }, { status: 400 });
    }

    console.log(`[Restyle ${jobId}] Style change: ${artStyle}`);

    const comicPageBuffer = await generateSingleComicPage(storyJson.panels, artStyle);

    const comicPageKey = `videos/${jobId}/comic-page.png`;
    storyJson.comicPageUrl = await uploadImageAndGetUrl(comicPageKey, comicPageBuffer);
    storyJson.artStyle = artStyle;

    await saveStoryJson(jobId, storyJson);

    console.log(`[Restyle ${jobId}] Complete`);

    return NextResponse.json({ storyJson });
  } catch (err) {
    console.error('[Restyle] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'An error occurred while changing the art style' },
      { status: 500 }
    );
  }
}
