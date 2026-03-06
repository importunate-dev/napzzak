'use client';

import { StoryJson, Panel } from '@/lib/types';
import { useNarration } from '@/hooks/useNarration';
import SpeakerButton from './SpeakerButton';

interface Props {
  storyJson: StoryJson;
}

const EMOTION_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  joy: { border: 'border-yellow-400', bg: 'bg-yellow-400/5', label: '기쁨' },
  sadness: { border: 'border-blue-400', bg: 'bg-blue-400/5', label: '슬픔' },
  surprise: { border: 'border-purple-400', bg: 'bg-purple-400/5', label: '놀람' },
  anger: { border: 'border-red-400', bg: 'bg-red-400/5', label: '분노' },
  fear: { border: 'border-gray-400', bg: 'bg-gray-400/5', label: '공포' },
  neutral: { border: 'border-gray-600', bg: 'bg-gray-800/50', label: '평온' },
};

function getCardSpan(panelIndex: number, isClimax: boolean): string {
  if (isClimax) return 'sm:col-span-2 sm:row-span-2';
  if (panelIndex < 2) return 'sm:col-span-2';
  return '';
}

export default function MasonryComic({ storyJson }: Props) {
  const panels = storyJson.panels ?? [];
  const narration = useNarration();

  const displayText = (panel: Panel) =>
    (storyJson.dialogueLanguage === 'ko' && panel.translation ? panel.translation : panel.dialogue) ?? '';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-gray-300 text-lg">{storyJson.summary}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-auto">
        {panels.map((panel, index) => {
          const emotionStyle = EMOTION_STYLES[panel.emotion] || EMOTION_STYLES.neutral;
          const isClimax = index === storyJson.climaxIndex;
          const span = getCardSpan(index, isClimax);

          return (
            <div
              key={panel.panelId}
              className={`
                relative rounded-2xl overflow-hidden border-2 p-4
                ${emotionStyle.border} ${emotionStyle.bg}
                ${span}
                ${isClimax ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-gray-950' : ''}
                transition-transform hover:scale-[1.02]
              `}
            >
              <div className="absolute top-3 left-3 z-10 w-8 h-8 bg-black/70 backdrop-blur rounded-full flex items-center justify-center text-xs font-bold">
                {panel.panelId}
              </div>

              {isClimax && (
                <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-yellow-500 text-black text-xs font-bold rounded-full">
                  CLIMAX
                </div>
              )}

              <div className="pt-8 space-y-2">
                {displayText(panel) && (
                  <div className="relative bg-white text-gray-900 rounded-xl px-3 py-2">
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-white rotate-45" />
                    <div className="relative flex items-start gap-2">
                      <p className="text-xs font-medium leading-relaxed flex-1">{displayText(panel)}</p>
                      <SpeakerButton
                        isLoading={narration.isLoading && narration.activeCutId === panel.panelId}
                        isPlaying={narration.isPlaying && narration.activeCutId === panel.panelId}
                        onClick={() => narration.play(panel.panelId, panel.dialogue ?? '')}
                        size="sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                  <span>{emotionStyle.label}</span>
                  <span>패널 {panel.panelId}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
