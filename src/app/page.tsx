'use client';

import { useState, useCallback } from 'react';
import VideoUploader from '@/components/VideoUploader';
import ProcessingStatus from '@/components/ProcessingStatus';
import StyleSwitcher from '@/components/StyleSwitcher';
import ComicPageView from '@/components/ComicPageView';
import Link from 'next/link';
import { MainBounceAnimation } from '@/components/NapzzakAnimation';
import { StoryJson, ArtStyle } from '@/lib/types';

type AppState = 'upload' | 'processing' | 'result';

export default function Home() {
  const [state, setState] = useState<AppState>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [storyJson, setStoryJson] = useState<StoryJson | null>(null);
  const [artStyle, setArtStyle] = useState<ArtStyle>('GRAPHIC_NOVEL_ILLUSTRATION');
  const [isRestyling, setIsRestyling] = useState(false);

  const handleUploadComplete = (id: string) => {
    setJobId(id);
    setState('processing');
  };

  const handleProcessingComplete = (story: StoryJson) => {
    setStoryJson(story);
    setArtStyle(story.artStyle || 'GRAPHIC_NOVEL_ILLUSTRATION');
    setState('result');
  };

  const handleReset = () => {
    setState('upload');
    setJobId(null);
    setStoryJson(null);
    setArtStyle('GRAPHIC_NOVEL_ILLUSTRATION');
  };

  const handleStyleChange = useCallback(async (newStyle: ArtStyle) => {
    if (!jobId || !storyJson || isRestyling) return;
    if (newStyle === artStyle) return;

    setIsRestyling(true);
    setArtStyle(newStyle);
    try {
      const res = await fetch('/api/restyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, artStyle: newStyle }),
      });
      if (!res.ok) throw new Error('그림체 변경 실패');
      const data = await res.json();
      setStoryJson(data.storyJson);
    } catch (err) {
      console.error('Restyle error:', err);
      setArtStyle(storyJson.artStyle);
    } finally {
      setIsRestyling(false);
    }
  }, [jobId, storyJson, artStyle, isRestyling]);

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* 헤더: 마스코트 폴짝 + 납짝 타이틀 */}
        <header className="mb-12">
          <div className="flex flex-col items-center gap-4">
            <MainBounceAnimation />
            <p className="text-gray-400 text-lg">
              영상을 올리면, AI가 만화로 납짝 만들어 드려요
            </p>
          </div>
        </header>

        {state === 'upload' && (
          <>
            <div className="max-w-2xl mx-auto mb-8 space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <StyleSwitcher
                  current={artStyle}
                  onChange={setArtStyle}
                />
              </div>
              <p className="text-center text-gray-600 text-xs">
                만화 그림체를 선택한 뒤 영상을 올려주세요 (대사 없는 시각적 만화로 변환됩니다)
              </p>
            </div>
            <VideoUploader
              onUploadComplete={handleUploadComplete}
              artStyle={artStyle}
            />
          </>
        )}

        {state === 'processing' && jobId && (
          <ProcessingStatus
            jobId={jobId}
            onComplete={handleProcessingComplete}
            onError={handleReset}
          />
        )}

        {state === 'result' && storyJson && (
          <>
            <div className="flex justify-center mb-8">
              <StyleSwitcher
                current={artStyle}
                onChange={handleStyleChange}
                disabled={isRestyling}
              />
            </div>

            {isRestyling && (
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-gray-900 px-4 py-2 rounded-full text-sm text-gray-300">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  그림체 변환 중...
                </div>
              </div>
            )}

            <ComicPageView storyJson={storyJson} />

            <div className="text-center mt-12 space-y-3">
              <button
                onClick={handleReset}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
              >
                다른 영상 변환하기
              </button>
              {storyJson.novaModelsUsed && storyJson.novaModelsUsed.length > 0 && (
                <p className="text-gray-600 text-xs">
                  {storyJson.novaModelsUsed.join(' · ')} · Nova 2 Sonic (음성 내레이션)
                </p>
              )}
              {(!storyJson.novaModelsUsed || storyJson.novaModelsUsed.length === 0) && (
                <p className="text-gray-600 text-xs">Powered by Amazon Nova AI</p>
              )}
            </div>
          </>
        )}
        {/* 제작자 페이지 링크 */}
        <div className="text-center mt-12 pb-4">
          <Link
            href="/creators"
            className="text-sm text-gray-500 hover:text-purple-400 transition-colors"
          >
            제작자 &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
