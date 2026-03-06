'use client';

import { useState, useRef, useCallback } from 'react';

interface NarrationState {
  isLoading: boolean;
  isPlaying: boolean;
  activeCutId: number | null;
}

export function useNarration() {
  const [state, setState] = useState<NarrationState>({
    isLoading: false,
    isPlaying: false,
    activeCutId: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState({ isLoading: false, isPlaying: false, activeCutId: null });
  }, []);

  const play = useCallback(
    async (cutId: number, text: string) => {
      if (state.activeCutId === cutId && state.isPlaying) {
        stop();
        return;
      }

      stop();
      setState({ isLoading: true, isPlaying: false, activeCutId: cutId });

      try {
        let audioUrl = cacheRef.current.get(text);

        if (!audioUrl) {
          const res = await fetch('/api/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });

          if (!res.ok) {
            throw new Error('음성 생성 실패');
          }

          const blob = await res.blob();
          audioUrl = URL.createObjectURL(blob);
          cacheRef.current.set(text, audioUrl);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setState({ isLoading: false, isPlaying: true, activeCutId: cutId });
        };

        audio.onended = () => {
          setState({ isLoading: false, isPlaying: false, activeCutId: null });
        };

        audio.onerror = () => {
          setState({ isLoading: false, isPlaying: false, activeCutId: null });
        };

        await audio.play();
      } catch (err) {
        console.error('[Narration]', err);
        setState({ isLoading: false, isPlaying: false, activeCutId: null });
      }
    },
    [state.activeCutId, state.isPlaying, stop]
  );

  return { ...state, play, stop };
}
