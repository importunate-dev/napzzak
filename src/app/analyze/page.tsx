'use client';

import { useState } from 'react';

interface Character {
  name: string;
  appearance: string;
  role: string;
}

interface TimelineEntry {
  timeRange: string;
  description: string;
  speakers?: string[];
  dialogue?: string;
}

interface AnalysisResult {
  duration: number;
  genre: string;
  hasAudioDialogue: boolean;
  characters: Character[];
  timeline: TimelineEntry[];
  fullStorySummary: string;
  keyMoments: string[];
}

interface TranscriptSegment {
  startTime: number;
  endTime: number;
  speaker?: string;
  text: string;
}

interface TranscribeData {
  fullText: string;
  segments: TranscriptSegment[];
  languageCode?: string;
}

interface ApiResponse {
  title: string;
  url: string;
  analysis: AnalysisResult;
  transcribe: TranscribeData | null;
}

export default function AnalyzePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '분석 실패');
        return;
      }

      setResult(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Story Analysis Test</h1>
        <p className="text-gray-400 text-sm mb-6">
          YouTube URL을 입력하면 Transcribe + 3단계 CoT 분석 결과를 확인할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/shorts/..."
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            {loading ? '분석 중...' : '분석'}
          </button>
        </form>

        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Transcribe + 3단계 CoT 분석 중...</p>
            <p className="text-gray-500 text-sm mt-1">약 2~4분 소요됩니다</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {result && <AnalysisView data={result} />}
      </div>
    </div>
  );
}

function AnalysisView({ data }: { data: ApiResponse }) {
  const { title, url, analysis, transcribe } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="text-gray-400 text-sm mt-1">{url}</p>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="px-2 py-1 bg-gray-800 rounded">{analysis.genre}</span>
          <span className="px-2 py-1 bg-gray-800 rounded">{analysis.duration}초</span>
          <span className="px-2 py-1 bg-gray-800 rounded">
            음성 대사: {analysis.hasAudioDialogue ? 'O' : 'X'}
          </span>
          {transcribe && (
            <span className="px-2 py-1 bg-green-900/50 border border-green-800 rounded text-green-300">
              Transcribe: {transcribe.languageCode || 'auto'}
            </span>
          )}
        </div>
      </div>

      {/* Transcribe Result */}
      {transcribe && transcribe.segments.length > 0 && (
        <Section title="원본 대사 (AWS Transcribe)">
          <div className="space-y-2">
            {transcribe.segments.map((seg, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="text-blue-400 font-mono whitespace-nowrap">
                  {seg.startTime.toFixed(1)}s
                </span>
                {seg.speaker && (
                  <span className="text-purple-400 whitespace-nowrap">
                    [{seg.speaker}]
                  </span>
                )}
                <span className="text-gray-300">{seg.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-gray-800/50 rounded text-sm">
            <p className="text-gray-500 mb-1">Full Text:</p>
            <p className="text-gray-300">{transcribe.fullText}</p>
          </div>
        </Section>
      )}

      {/* Full Story Summary */}
      <Section title="Full Story Summary">
        <p className="text-gray-300 leading-relaxed">{analysis.fullStorySummary}</p>
      </Section>

      {/* Key Moments */}
      <Section title="Key Moments">
        <ul className="space-y-1">
          {analysis.keyMoments.map((m, i) => (
            <li key={i} className="text-gray-300">
              <span className="text-yellow-500 mr-2">{i + 1}.</span>
              {m}
            </li>
          ))}
        </ul>
      </Section>

      {/* Characters */}
      <Section title={`Characters (${analysis.characters.length})`}>
        <div className="space-y-3">
          {analysis.characters.map((c, i) => (
            <div key={i} className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-white">{c.name}</span>
                <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
                  {c.role}
                </span>
              </div>
              <p className="text-gray-400 text-sm">{c.appearance}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Timeline */}
      <Section title={`Timeline (${analysis.timeline.length} segments)`}>
        <div className="space-y-3">
          {analysis.timeline.map((t, i) => (
            <div key={i} className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-400 font-mono text-sm">{t.timeRange}</span>
                {t.speakers && t.speakers.length > 0 && (
                  <span className="text-xs text-gray-500">
                    [{t.speakers.join(', ')}]
                  </span>
                )}
              </div>
              <p className="text-gray-300 text-sm">{t.description}</p>
              {t.dialogue && (
                <p className="text-yellow-300/80 text-sm mt-1 italic">
                  &quot;{t.dialogue}&quot;
                </p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Raw JSON */}
      <Section title="Raw JSON">
        <pre className="p-4 bg-black rounded-lg overflow-x-auto text-xs text-gray-400 max-h-96 overflow-y-auto">
          {JSON.stringify(analysis, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
      <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}
