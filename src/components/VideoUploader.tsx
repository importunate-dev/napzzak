'use client';

import { useState, useRef, useCallback } from 'react';

import { ArtStyle } from '@/lib/types';

type InputMode = 'file' | 'youtube';

interface Props {
  onUploadComplete: (jobId: string) => void;
  artStyle?: ArtStyle;
}

export default function VideoUploader({ onUploadComplete, artStyle }: Props) {
  const [mode, setMode] = useState<InputMode>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('영상 파일만 업로드할 수 있습니다.');
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('파일 크기는 100MB 이하여야 합니다.');
      return;
    }

    setError(null);
    setFileName(file.name);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('video', file);
      if (artStyle) formData.append('artStyle', artStyle);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '업로드에 실패했습니다');
      }

      const { jobId } = await response.json();
      onUploadComplete(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
      setIsUploading(false);
    }
  }, [onUploadComplete]);

  const handleYouTubeSubmit = useCallback(async () => {
    const trimmed = youtubeUrl.trim();
    if (!trimmed) {
      setError('YouTube URL을 입력해 주세요.');
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const response = await fetch('/api/upload-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
          artStyle: artStyle || 'GRAPHIC_NOVEL_ILLUSTRATION',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'YouTube 영상 처리에 실패했습니다');
      }

      const { jobId } = await response.json();
      onUploadComplete(jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'YouTube 영상 처리에 실패했습니다.');
      setIsUploading(false);
    }
  }, [youtubeUrl, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const switchMode = (newMode: InputMode) => {
    if (isUploading) return;
    setMode(newMode);
    setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Tab Switcher */}
      <div className="flex mb-6 bg-gray-900 rounded-xl p-1">
        <button
          onClick={() => switchMode('file')}
          disabled={isUploading}
          className={`
            flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200
            ${mode === 'file'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'}
            ${isUploading ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          파일 업로드
        </button>
        <button
          onClick={() => switchMode('youtube')}
          disabled={isUploading}
          className={`
            flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200
            ${mode === 'youtube'
              ? 'bg-gray-800 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'}
            ${isUploading ? 'cursor-not-allowed opacity-50' : ''}
          `}
        >
          YouTube 링크
        </button>
      </div>

      {/* File Upload Tab */}
      {mode === 'file' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-2xl p-20 text-center cursor-pointer
            transition-all duration-300 ease-out
            ${isDragging
              ? 'border-blue-500 bg-blue-500/5 scale-[1.02]'
              : 'border-gray-800 hover:border-gray-600 hover:bg-gray-900/50'}
            ${isUploading ? 'pointer-events-none' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />

          {isUploading ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-white font-medium">{fileName}</p>
                <p className="text-gray-500 text-sm mt-1">업로드 중...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-6xl">🎬</div>
              <div>
                <p className="text-xl font-semibold text-white">
                  영상을 드래그하거나 클릭하세요
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  MP4, MOV 등 · 최대 100MB · 30초~1분 권장
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* YouTube Tab */}
      {mode === 'youtube' && (
        <div className="border-2 border-gray-800 rounded-2xl p-12 text-center">
          {isUploading ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="text-white font-medium">YouTube 영상 다운로드 중...</p>
                <p className="text-gray-500 text-sm mt-1">영상 길이에 따라 시간이 걸릴 수 있습니다</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="text-5xl">▶</div>
                <p className="text-gray-400 text-sm">
                  YouTube 영상 URL을 붙여넣으세요 · 10분 이하
                </p>
              </div>

              <div className="flex gap-3">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleYouTubeSubmit()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="
                    flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl
                    text-white placeholder-gray-600 text-sm
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                    transition-colors
                  "
                />
                <button
                  onClick={handleYouTubeSubmit}
                  disabled={!youtubeUrl.trim()}
                  className="
                    px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800
                    disabled:text-gray-600 rounded-xl font-semibold text-sm
                    transition-colors whitespace-nowrap
                  "
                >
                  변환하기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
