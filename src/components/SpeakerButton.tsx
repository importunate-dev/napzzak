'use client';

interface Props {
  isLoading: boolean;
  isPlaying: boolean;
  onClick: () => void;
  size?: 'sm' | 'md';
}

export default function SpeakerButton({ isLoading, isPlaying, onClick, size = 'md' }: Props) {
  const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`
        ${sizeClass} rounded-full flex items-center justify-center
        transition-all duration-200 shrink-0
        ${isPlaying
          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
          : isLoading
            ? 'bg-gray-700 text-gray-400 animate-pulse'
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600 hover:text-white'}
      `}
      title={isPlaying ? '정지' : '대사 듣기'}
    >
      {isLoading ? (
        <svg className={`${iconSize} animate-spin`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : isPlaying ? (
        <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
          <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
