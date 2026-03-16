'use client';

import { useState } from 'react';
import { StoryJson, Panel, DialogueLanguage } from '@/lib/types';
import { useNarration } from '@/hooks/useNarration';
import SpeakerButton from '@/components/SpeakerButton';

interface Props {
  storyJson: StoryJson;
}

/** Extract Video ID from YouTube URL */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** Emotion-based speech bubble styles */
const EMOTION_STYLES: Record<string, string> = {
  joy: 'bg-yellow-50 border-yellow-300 text-yellow-900',
  sadness: 'bg-blue-50 border-blue-300 text-blue-900',
  surprise: 'bg-orange-50 border-orange-400 text-orange-900',
  anger: 'bg-red-50 border-red-400 text-red-900',
  fear: 'bg-purple-50 border-purple-300 text-purple-900',
  neutral: 'bg-white border-gray-300 text-gray-800',
};

/** Emotion emoji */
const EMOTION_EMOJI: Record<string, string> = {
  joy: '😄',
  sadness: '😢',
  surprise: '😲',
  anger: '😠',
  fear: '😨',
  neutral: '😐',
};

function DialogueBubble({
  panel,
  language,
  narration,
}: {
  panel: Panel;
  language: DialogueLanguage;
  narration?: {
    activeCutId: number | null;
    isLoading: boolean;
    isPlaying: boolean;
    onPlay: (cutId: number, text: string, voiceId?: string) => void;
  };
}) {
  const text = language === 'ko'
    ? (panel.dialogueKo || panel.translation || panel.dialogue)
    : panel.dialogue;

  if (!text) return null;

  const emotionStyle = EMOTION_STYLES[panel.emotion] || EMOTION_STYLES.neutral;
  const isActive = narration?.activeCutId === panel.panelId;
  const voiceId = language === 'ko' ? 'seoyeon' : 'matthew';

  return (
    <div className={`
      absolute bottom-2 left-2 right-2
      px-3 py-2 rounded-xl border-2
      text-sm font-medium leading-snug
      shadow-lg backdrop-blur-sm
      ${emotionStyle}
      bg-opacity-90
      flex items-center gap-2
    `}>
      <span className="flex-1">
        <span className="mr-1">{EMOTION_EMOJI[panel.emotion] || ''}</span>
        {text}
      </span>
      {narration && (
        <SpeakerButton
          size="sm"
          isLoading={isActive && narration.isLoading}
          isPlaying={isActive && narration.isPlaying}
          onClick={() => narration.onPlay(panel.panelId, text, voiceId)}
        />
      )}
    </div>
  );
}

function PanelCard({
  panel,
  isClimax,
  language,
  showDialogue,
  narration,
}: {
  panel: Panel;
  isClimax: boolean;
  language: DialogueLanguage;
  showDialogue: boolean;
  narration?: {
    activeCutId: number | null;
    isLoading: boolean;
    isPlaying: boolean;
    onPlay: (cutId: number, text: string, voiceId?: string) => void;
  };
}) {
  const hasImage = !!panel.imageUrl;

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl
        ${isClimax ? 'ring-4 ring-yellow-400 ring-opacity-80 shadow-2xl' : 'shadow-lg'}
        bg-gray-900 aspect-square
        transition-transform hover:scale-[1.02]
      `}
    >
      {/* Climax badge */}
      {isClimax && (
        <div className="absolute top-2 right-2 z-20 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full shadow">
          ⭐ CLIMAX
        </div>
      )}

      {/* Panel image */}
      {hasImage ? (
        <img
          src={panel.imageUrl}
          alt={panel.description}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800 p-4">
          <p className="text-gray-400 text-center text-sm">{panel.description}</p>
        </div>
      )}

      {/* Dialogue overlay (CSS rendered - fixes AI image text issues) */}
      {showDialogue && (
        <DialogueBubble panel={panel} language={language} narration={narration} />
      )}

      {/* Panel number */}
      <div className="absolute top-2 left-2 z-10 bg-black bg-opacity-60 text-white text-xs font-mono px-2 py-0.5 rounded">
        {panel.panelId}
      </div>
    </div>
  );
}

export default function ComicPageView({ storyJson }: Props) {
  const [language, setLanguage] = useState<DialogueLanguage>(
    storyJson.dialogueLanguage || 'en'
  );
  const [showDialogue, setShowDialogue] = useState(true);
  const [viewMode, setViewMode] = useState<'panel' | 'page'>(
    storyJson.isPanelMode ? 'panel' : 'page'
  );
  const { activeCutId, isLoading, isPlaying, play } = useNarration();

  const hasDialogue = storyJson.panels.some(p => p.dialogue || p.dialogueKo);
  const narrationProps = hasDialogue ? { activeCutId, isLoading, isPlaying, onPlay: play } : undefined;
  const hasPanelImages = storyJson.panels.some(p => p.imageUrl);
  const hasPageImage = !!storyJson.comicPageUrl;

  return (
    <div className="space-y-6">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* View mode toggle (per-panel / single page) */}
        {hasPanelImages && hasPageImage && (
          <div className="inline-flex bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('panel')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'panel'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🖼️ Panels
            </button>
            <button
              onClick={() => setViewMode('page')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'page'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📄 Single Page
            </button>
          </div>
        )}

        {/* Dialogue toggle */}
        {hasDialogue && viewMode === 'panel' && (
          <button
            onClick={() => setShowDialogue(!showDialogue)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showDialogue
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            💬 {showDialogue ? 'Dialogue ON' : 'Dialogue OFF'}
          </button>
        )}

        {/* Language toggle */}
        {hasDialogue && showDialogue && viewMode === 'panel' && (
          <div className="inline-flex bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                language === 'en'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ko')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                language === 'ko'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              KO
            </button>
          </div>
        )}
      </div>

      {/* Story summary */}
      <div className="text-center">
        <p className="text-gray-400 text-sm italic">
          &ldquo;{language === 'ko' && storyJson.summaryKo ? storyJson.summaryKo : storyJson.summary}&rdquo;
        </p>
      </div>

      {/* YouTube video */}
      {storyJson.youtubeUrl && (() => {
        const videoId = extractYouTubeVideoId(storyJson.youtubeUrl!);
        if (!videoId) return null;
        return (
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full rounded-xl"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="Original YouTube Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-center text-xs text-gray-500">
              <a
                href={storyJson.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-300 underline"
              >
                View original video
              </a>
            </p>
          </div>
        );
      })()}

      {/* Comic rendering */}
      {viewMode === 'panel' ? (
        /* Per-panel grid rendering */
        <div
          className={`grid gap-4 ${
            storyJson.panels.length <= 4
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-2 sm:grid-cols-3'
          }`}
        >
          {storyJson.panels.map((panel) => (
            <PanelCard
              key={panel.panelId}
              panel={panel}
              isClimax={panel.panelId - 1 === storyJson.climaxIndex}
              language={language}
              showDialogue={showDialogue}
              narration={narrationProps}
            />
          ))}
        </div>
      ) : (
        /* Single page rendering (legacy) */
        hasPageImage && (
          <div className="max-w-3xl mx-auto">
            <img
              src={storyJson.comicPageUrl}
              alt="AI Generated Comic Page"
              className="w-full rounded-xl shadow-2xl"
            />
          </div>
        )
      )}

      {/* Character info (debug/reference) */}
      {storyJson.characterDescriptions && (
        <details className="text-xs text-gray-600 mt-4">
          <summary className="cursor-pointer hover:text-gray-400">
            🎭 Character Info
          </summary>
          <p className="mt-2 p-3 bg-gray-900 rounded-lg">
            {storyJson.characterDescriptions}
          </p>
        </details>
      )}
    </div>
  );
}
