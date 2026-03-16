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

export default function ScrollComic({ storyJson }: Props) {
  const panels = storyJson.panels ?? [];
  const narration = useNarration();

  const displayText = (panel: (typeof panels)[0]) =>
    (storyJson.dialogueLanguage === 'ko' && panel.translation ? panel.translation : panel.dialogue) ?? '';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-gray-300 text-lg">{storyJson.summary}</p>
      </div>

      <div className="space-y-3">
        {panels.map((panel, index) => {
          const emotionStyle = EMOTION_STYLES[panel.emotion] || EMOTION_STYLES.neutral;
          const isClimax = index === storyJson.climaxIndex;

          return (
            <div
              key={panel.panelId}
              className={`relative pl-16 p-4 rounded-2xl border-2 ${emotionStyle.border} ${
                isClimax ? 'ring-2 ring-yellow-400/30' : ''
              }`}
            >
              <div className={`
                absolute left-4 top-6 w-5 h-5 rounded-full border-2 z-10
                ${isClimax ? 'bg-yellow-500 border-yellow-400 scale-125' : 'bg-gray-900 border-gray-600'}
              `} />

                <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-500">
                    Panel {panel.panelId}
                    {isClimax && <span className="ml-2 text-yellow-400 font-medium">CLIMAX</span>}
                  </span>
                  {displayText(panel) && <p className="text-gray-300 text-sm mt-1">{displayText(panel)}</p>}
                </div>
                {displayText(panel) && (
                  <SpeakerButton
                    isLoading={narration.isLoading && narration.activeCutId === panel.panelId}
                    isPlaying={narration.isPlaying && narration.activeCutId === panel.panelId}
                    onClick={() => narration.play(panel.panelId, panel.dialogue ?? '')}
                    size="sm"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
