'use client';

import { useEffect, useState, useCallback } from 'react';
import { StoryJson } from '@/lib/types';

interface Props {
  jobId: string;
  onComplete: (storyJson: StoryJson) => void;
  onError: () => void;
}

const PROGRESS_TO_STEP: Record<string, number> = {
  uploaded: 0,
  analyzing: 1,
  generating_comic: 2,
  completed: 3,
};

const STEPS = [
  { label: 'S3에 영상 업로드 완료', icon: '☁️' },
  { label: 'AI가 영상을 분석하고 있어요', icon: '🧠' },
  { label: '만화 이미지를 생성하고 있어요', icon: '🖌️' },
  { label: '만화 완성!', icon: '🎨' },
];

const CANCEL_SUGGEST_SECONDS = 180; // 3분

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
          setCurrentStep(3);
          setTimeout(() => stableOnComplete(data.storyJson), 800);
          return;
        }

        if (data.status === 'failed') {
          setError(data.error || '처리 중 오류가 발생했습니다.');
          return;
        }

        if (data.status === 'cancelled') {
          onError();
          return;
        }

        setTimeout(poll, 3000);
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearInterval(elapsedTimer);
    };
  }, [jobId, stableOnComplete, onError]);

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="text-6xl mb-6">😢</div>
        <p className="text-red-400 text-lg mb-2">처리에 실패했습니다</p>
        <p className="text-gray-500 text-sm mb-8">{error}</p>
        <button
          onClick={onError}
          className="px-6 py-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 transition font-medium"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <div className="text-center mb-12">
        <div className="text-7xl mb-4 animate-bounce">{STEPS[Math.min(currentStep, 3)].icon}</div>
        <p className="text-gray-500 text-sm">
          경과 시간: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </p>
      </div>

      <div className="space-y-4">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className={`
              flex items-center gap-4 p-4 rounded-xl transition-all duration-500
              ${i <= currentStep ? 'opacity-100' : 'opacity-30'}
              ${i === currentStep ? 'bg-gray-900' : ''}
            `}
          >
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0
              transition-colors duration-300
              ${i < currentStep
                ? 'bg-emerald-600 text-white'
                : i === currentStep
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-gray-800 text-gray-500'}
            `}>
              {i < currentStep ? '✓' : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`font-medium block ${i === currentStep ? 'text-white' : 'text-gray-500'}`}>
                {step.label}
              </span>
              {i === currentStep && progressDetail && (
                <span className="text-xs text-gray-500 block mt-0.5 truncate">
                  {progressDetail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCancelSuggest && !isCancelling && (
        <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-amber-400 text-sm mb-3">
            처리 시간이 길어지고 있습니다. 취소하고 다시 시도해 보세요.
          </p>
          <button
            onClick={handleCancel}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-semibold transition-colors"
          >
            작업 취소
          </button>
        </div>
      )}

      <div className="mt-10 text-center">
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="text-gray-600 hover:text-gray-400 text-sm transition-colors disabled:opacity-50"
        >
          {isCancelling ? '취소 중...' : '취소'}
        </button>
      </div>
    </div>
  );
}
