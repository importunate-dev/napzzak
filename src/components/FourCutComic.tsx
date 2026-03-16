'use client';

import { StoryJson } from '@/lib/types';
import { useNarration } from '@/hooks/useNarration';
import SpeakerButton from './SpeakerButton';

interface Props {
  storyJson: StoryJson;
}

const EMOTION_STYLES: Record<string, { border: string; label: string }> = {
  joy: { border: 'border-yellow-400', label: 'Joy' },
  sadness: { border: 'border-blue-400', label: 'Sadness' },
  surprise: { border: 'border-purple-400', label: 'Surprise' },
  anger: { border: 'border-red-400', label: 'Anger' },
  fear: { border: 'border-gray-400', label: 'Fear' },
  neutral: { border: 'border-gray-600', label: 'Neutral' },
};

export default function FourCutComic({ storyJson }: Props) {
  const panels = storyJson.panels ?? [];
  const top4 = panels.slice(0, 4);
  const climaxPanelId = panels[storyJson.climaxIndex]?.panelId;
  const narration = useNarration();

  const displayText = (panel: (typeof panels)[0]) =>
    (storyJson.dialogueLanguage === 'ko' && panel.translation ? panel.translation : panel.dialogue) ?? '';

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-gray-300 text-lg leading-relaxed">{storyJson.summary}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
        {top4.map((panel, index) => {
          const emotionStyle = EMOTION_STYLES[panel.emotion] || EMOTION_STYLES.neutral;
          const isClimax = panel.panelId === climaxPanelId;

          return (
            <div
              key={panel.panelId}
              className={`
                relative bg-gray-900 rounded-2xl overflow-hidden p-4
                border-2 ${emotionStyle.border}
                ${isClimax ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-gray-950' : ''}
                transition-transform hover:scale-[1.02]
              `}
            >
              <div className="absolute top-3 left-3 z-10 w-9 h-9 bg-black/70 backdrop-blur rounded-full flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>

              {isClimax && (
                <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-yellow-500 text-black text-xs font-bold rounded-full">
                  CLIMAX
                </div>
              )}

              <div className="pt-10 space-y-3">
                {displayText(panel) && (
                  <div className="relative bg-white text-gray-900 rounded-2xl px-4 py-3">
                    <div className="absolute -top-2 left-6 w-4 h-4 bg-white rotate-45" />
                    <div className="relative flex items-start gap-2">
                      <p className="text-sm font-medium leading-relaxed flex-1">
                        {displayText(panel)}
                      </p>
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
                  <span>Panel {panel.panelId}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
