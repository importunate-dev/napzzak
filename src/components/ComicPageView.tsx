'use client';

import { StoryJson } from '@/lib/types';
import { useNarration } from '@/hooks/useNarration';
import SpeakerButton from './SpeakerButton';

const EMOTION_STYLES: Record<string, { border: string; label: string }> = {
  joy: { border: 'border-yellow-400', label: '기쁨' },
  sadness: { border: 'border-blue-400', label: '슬픔' },
  surprise: { border: 'border-purple-400', label: '놀람' },
  anger: { border: 'border-red-400', label: '분노' },
  fear: { border: 'border-gray-400', label: '공포' },
  neutral: { border: 'border-gray-600', label: '평온' },
};

interface Props {
  storyJson: StoryJson;
}

export default function ComicPageView({ storyJson }: Props) {
  const comicPageUrl = storyJson.comicPageUrl;
  const narration = useNarration();

  if (!comicPageUrl) {
    return null;
  }

  const displayText = (panel: (typeof storyJson.panels)[0]) =>
    (storyJson.dialogueLanguage === 'ko' && panel.translation ? panel.translation : panel.dialogue) ?? '';
  const hasAnyDialogue = storyJson.panels?.some((p) => displayText(p)) ?? false;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-gray-300 text-lg">{storyJson.summary}</p>
      </div>

      <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-xl mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comicPageUrl}
          alt="만화 페이지"
          className="w-full h-auto"
        />
      </div>

      {hasAnyDialogue && storyJson.panels && storyJson.panels.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 mb-4">패널별 대사 (음성 재생)</h3>
          {storyJson.panels.map((panel, index) => {
            const text = displayText(panel);
            if (!text) return null;
            const emotionStyle = EMOTION_STYLES[panel.emotion] || EMOTION_STYLES.neutral;
            const isClimax = index === storyJson.climaxIndex;

            return (
              <div
                key={panel.panelId}
                className={`flex items-center justify-between gap-4 p-4 rounded-xl border ${emotionStyle.border} ${
                  isClimax ? 'ring-2 ring-yellow-400/30' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-500 mr-2">
                    패널 {panel.panelId}
                    {isClimax && (
                      <span className="ml-2 text-yellow-400 font-medium">CLIMAX</span>
                    )}
                  </span>
                  <p className="text-gray-300 text-sm mt-0.5">{text}</p>
                </div>
                <SpeakerButton
                  isLoading={narration.isLoading && narration.activeCutId === panel.panelId}
                  isPlaying={narration.isPlaying && narration.activeCutId === panel.panelId}
                  onClick={() => narration.play(panel.panelId, panel.dialogue ?? '')}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
