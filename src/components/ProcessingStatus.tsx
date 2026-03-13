'use client';

import { useEffect, useState, useCallback } from 'react';
import { StoryJson } from '@/lib/types';
import { StageAnimation } from '@/components/NapzzakAnimation';

interface Props {
  jobId: string;
  onComplete: (storyJson: StoryJson) => void;
  onError: () => void;
}

const PROGRESS_TO_STEP: Record<string, number> = {
  uploaded: 0,
  transcribing: 1,
  extracting_frames: 2,
  analyzing_pass1_stepA: 3,
  analyzing_pass1_stepB: 4,
  analyzing_pass1_stepC: 5,
  verifying: 6,
  analyzing_pass2: 7,
  generating_panels: 8,
  generating_comic: 9,
  completed: 10,
  // 레거시 호환
  analyzing: 3,
  analyzing_pass1: 3,
  analyzing_pass1_stepB_identify: 4,
  analyzing_pass1_stepB_track: 4,
  analyzing_pass1_stepB_merge: 4,
};

const STEPS = [
  { label: 'S3에 영상 업로드 완료', icon: '☁️' },
  { label: 'AWS Transcribe로 대사를 추출하고 있어요', icon: '🎙️' },
  { label: '키프레임을 추출하고 있어요', icon: '🖼️' },
  { label: 'Nova Lite가 대사와 화자를 분석하고 있어요 (Step A)', icon: '🗣️' },
  { label: 'Nova Lite가 인물 간 상호작용을 분석하고 있어요 (Step B)', icon: '🔍' },
  { label: 'Nova Pro가 스토리를 종합하고 있어요 (Step C)', icon: '🧩' },
  { label: 'Nova Pro가 반박 검증으로 정확도를 높이고 있어요', icon: '✅' },
  { label: 'Nova Pro가 만화 패널 구조를 설계하고 있어요', icon: '🧠' },
  { label: '패널별 만화 이미지를 생성하고 있어요', icon: '🖌️' },
  { label: '통합 만화 페이지를 생성하고 있어요', icon: '📄' },
  { label: '만화 완성!', icon: '🎨' },
];

const CANCEL_SUGGEST_SECONDS = 180;

export default function ProcessingStatus({ jobId, onComplete, onError }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelSuggest, setShowCancelSuggest] = useState(false);

  const stableOnComplete = useCallback(onComplete, []);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        onError();
      } else {
        setIsCancelling(false);
      }
    } catch {
      setIsCancelling(false);
    }
  }, [jobId, onError]);

  useEffect(() => {
    let cancelled = false;
    const startTime = Date.now();

    const elapsedTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(sec);
      if (sec >= CANCEL_SUGGEST_SECONDS) {
        setShowCancelSuggest(true);
      }
    }, 1000);

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.progress && PROGRESS_TO_STEP[data.progress] !== undefined) {
          setCurrentStep(PROGRESS_TO_STEP[data.progress]);
        }
        if (data.progressDetail) {
          setProgressDetail(data.progressDetail);
        }

        if (data.status === 'completed' && data.storyJson) {
          setCurrentStep(STEPS.length - 1);
          setTimeout(() => stableOnComplete(data.storyJson), 800);
          return;
        }

        if (data.status === 'failed') {
          setError(data.error || '처리 중 오류가 발생했습니다.');
          return;
        }

        if (data.status === 'cancelled') {
          return;
        }

        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearInterval(elapsedTimer);
    };
  }, [jobId, stableOnComplete]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-4">
        <div className="text-6xl">😞</div>
        <h2 className="text-xl font-bold text-red-400">처리 실패</h2>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={onError}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const percent = Math.round((currentStep / (STEPS.length - 1)) * 100);
  const currentLabel = STEPS[currentStep]?.label || '';

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 단계별 애니메이션 */}
      <div className="flex justify-center pt-4 pb-2">
        <StageAnimation step={currentStep} />
      </div>

      {/* 현재 단계 텍스트 */}
      <p className="text-center text-blue-300 font-semibold text-sm min-h-[1.5em]">
        {currentLabel}
      </p>

      {/* 프로그레스 바 */}
      <div className="space-y-2">
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{percent}%</span>
          <span>{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* 상세 진행 정보 */}
      {progressDetail && (
        <p className="text-center text-gray-400 text-xs">{progressDetail}</p>
      )}

      {/* 취소 버튼 */}
      <div className="text-center">
        {showCancelSuggest && !isCancelling && (
          <p className="text-yellow-500 text-xs mb-2">
            처리가 오래 걸리고 있습니다. 취소 후 다시 시도해 보세요.
          </p>
        )}
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="px-4 py-2 text-sm text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {isCancelling ? '취소 중...' : '처리 취소'}
        </button>
      </div>
    </div>
  );
}
