'use client';

import { useState, useRef, useCallback } from 'react';

interface NarrationState {
  isLoading: boolean;
  isPlaying: boolean;
  activeCutId: number | null;
  error: string | null;
}

export function useNarration() {
  const [state, setState] = useState<NarrationState>({
    isLoading: false,
    isPlaying: false,
    activeCutId: null,
    error: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState({ isLoading: false, isPlaying: false, activeCutId: null, error: null });
  }, []);

  const play = useCallback(
    async (cutId: number, text: string, voiceId?: string) => {
      if (state.activeCutId === cutId && state.isPlaying) {
        stop();
        return;
      }

      stop();
      setState({ isLoading: true, isPlaying: false, activeCutId: cutId, error: null });

      try {
        const cacheKey = `${voiceId || 'default'}:${text}`;
        let audioUrl = cacheRef.current.get(cacheKey);

        if (!audioUrl) {
          const res = await fetch('/api/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, ...(voiceId && { voiceId }) }),
          });

          if (!res.ok) {
            let errorMsg = '음성 생성 실패';
            try {
              const errBody = await res.json();
              if (errBody.error) errorMsg = errBody.error;
              if (errBody.message) errorMsg = errBody.message;
            } catch {
              errorMsg = `음성 생성 실패 (${res.status}: ${res.statusText})`;
            }
            setState({ isLoading: false, isPlaying: false, activeCutId: null, error: errorMsg });
            return;
          }

          const blob = await res.blob();
          audioUrl = URL.createObjectURL(blob);
          cacheRef.current.set(cacheKey, audioUrl);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setState({ isLoading: false, isPlaying: true, activeCutId: cutId, error: null });
        };

        audio.onended = () => {
          setState({ isLoading: false, isPlaying: false, activeCutId: null, error: null });
        };

        audio.onerror = () => {
          setState({ isLoading: false, isPlaying: false, activeCutId: null, error: '오디오 재생에 실패했습니다' });
        };

        await audio.play();
      } catch (err) {
        console.error('[Narration]', err);
        const message = err instanceof Error ? err.message : '음성 생성 중 오류가 발생했습니다';
        setState({ isLoading: false, isPlaying: false, activeCutId: null, error: message });
      }
    },
    [state.activeCutId, state.isPlaying, stop]
  );

  return { ...state, play, stop };
}
