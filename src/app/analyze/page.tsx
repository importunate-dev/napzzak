'use client';

import { useState, useCallback } from 'react';

// ─── Type Definitions ───

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

interface VideoDeepAnalysis {
  duration: number;
  genre: string;
  hasAudioDialogue: boolean;
  characters: Character[];
  storyArc: {
    setup: string;
    incitingIncident: string;
    climax: string;
    resolution: string;
  };
  timeline: TimelineEntry[];
  fullStorySummary: string;
  keyMoments: string[];
}

interface PanelStructure {
  panelId: number;
  description: string;
  emotion: string;
  dialogue?: string;
  dialogueKo?: string;
}

interface NovaAnalysisResult {
  duration: number;
  summary: string;
  summaryKo?: string;
  climaxIndex: number;
  hasAudioDialogue: boolean;
  characterDescriptions: string;
  panels: PanelStructure[];
}

interface ImagePromptInfo {
  panelId: number;
  prompt: string;
  negativeText: string;
}

interface PanelWithImage {
  panelId: number;
  description: string;
  emotion: string;
  dialogue?: string;
  dialogueKo?: string;
  imageUrl?: string;
}

interface ApiResponse {
  title: string;
  url: string;
  transcribe: TranscribeData | null;
  keyframeCount: number;
  steps: {
    stepA: string;
    stepB: string;
    stepC: VideoDeepAnalysis;
    qualityCheck: { valid: boolean; reason: string };
    verified: VideoDeepAnalysis;
    pass2: NovaAnalysisResult;
    imagePrompts: ImagePromptInfo[];
  };
  panels: PanelWithImage[];
}

// ─── Common UI Components ───

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        copied
          ? 'bg-green-800 text-green-300'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'
      }`}
    >
      {copied ? 'copied' : label}
    </button>
  );
}

function Section({
  title,
  badge,
  copyText,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: string;
  copyText?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-200 hover:bg-gray-800 select-none flex items-center gap-2">
        {title}
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400 font-normal">
            {badge}
          </span>
        )}
        <span className="flex-1" />
        {copyText && <CopyButton text={copyText} />}
      </summary>
      <div className="px-5 pb-5 pt-2">{children}</div>
    </details>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black rounded-lg p-4 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed border border-gray-800 max-h-[600px] overflow-y-auto">
      {children}
    </pre>
  );
}

function StepHeader({ step, label }: { step: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-bold px-2 py-1 rounded bg-blue-900 text-blue-300">{step}</span>
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  );
}

// ─── Main Page ───

export default function AnalyzePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [progress, setProgress] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('Downloading YouTube + preprocessing...');

    try {
      const res = await fetch('/api/analyze-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        return;
      }

      setResult(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">Full Pipeline Debug Viewer</h1>
        <p className="text-gray-500 text-sm mb-6">
          Runs the same full process as the main pipeline and shows intermediate data from each step
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
            {loading ? 'Running...' : 'Run Full Pipeline'}
          </button>
        </form>

        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">{progress}</p>
            <p className="text-gray-500 text-sm mt-1">
              Full pipeline execution: Transcribe → Step A/B/C → Verification → Pass 2 → Image Generation
            </p>
            <p className="text-gray-600 text-xs mt-1">Takes approximately 5–10 minutes</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 mb-6">
            {error}
          </div>
        )}

        {result && <DebugView data={result} />}

        <div className="text-center mt-8">
          <a href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
            &larr; Home
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Generation ───

function buildFullMarkdown(data: ApiResponse): string {
  const { title, url, transcribe, keyframeCount, steps, panels } = data;
  const lines: string[] = [];

  lines.push(`# Video Analysis Debug Report`);
  lines.push('');
  lines.push(`- **Title**: ${title}`);
  lines.push(`- **URL**: ${url}`);
  lines.push(`- **Genre**: ${steps.stepC.genre}`);
  lines.push(`- **Duration**: ${steps.stepC.duration}s`);
  lines.push(`- **Audio Dialogue**: ${steps.stepC.hasAudioDialogue ? 'O' : 'X'}`);
  lines.push(`- **Keyframes**: ${keyframeCount} frames`);
  lines.push(`- **Quality Check**: ${steps.qualityCheck.valid ? 'PASS' : 'FAIL'} — ${steps.qualityCheck.reason}`);
  lines.push('');

  // Transcribe
  lines.push(`## 1. Transcribe Results`);
  lines.push('');
  if (transcribe && transcribe.segments.length > 0) {
    for (const seg of transcribe.segments) {
      const spk = seg.speaker ? ` [${seg.speaker}]` : '';
      lines.push(`- [${seg.startTime.toFixed(1)}s]${spk} ${seg.text}`);
    }
    lines.push('');
    lines.push(`> Full Text: ${transcribe.fullText}`);
  } else {
    lines.push('No dialogue');
  }
  lines.push('');

  // Step A
  lines.push(`## 2. Step A: Dialogue/Audio Analysis (Nova Pro)`);
  lines.push('');
  lines.push('```');
  lines.push(steps.stepA);
  lines.push('```');
  lines.push('');

  // Step B
  lines.push(`## 3. Step B: Interaction Analysis (Nova Pro)`);
  lines.push('');
  lines.push('```');
  lines.push(steps.stepB);
  lines.push('```');
  lines.push('');

  // Step C
  lines.push(`## 4. Step C: Comprehensive Analysis (Nova Pro)`);
  lines.push('');
  lines.push(`### Story Arc`);
  lines.push(`- **Setup**: ${steps.stepC.storyArc.setup}`);
  lines.push(`- **Inciting Incident**: ${steps.stepC.storyArc.incitingIncident}`);
  lines.push(`- **Climax**: ${steps.stepC.storyArc.climax}`);
  lines.push(`- **Resolution**: ${steps.stepC.storyArc.resolution}`);
  lines.push('');
  lines.push(`### Characters`);
  for (const c of steps.stepC.characters) {
    lines.push(`- **${c.name}** (${c.role}): ${c.appearance}`);
  }
  lines.push('');
  lines.push(`### Timeline`);
  for (const t of steps.stepC.timeline) {
    const spk = t.speakers?.length ? ` [${t.speakers.join(', ')}]` : '';
    lines.push(`- **${t.timeRange}**${spk}: ${t.description}`);
    if (t.dialogue) lines.push(`  > "${t.dialogue}"`);
  }
  lines.push('');
  lines.push(`### Full Story Summary`);
  lines.push(steps.stepC.fullStorySummary);
  lines.push('');
  lines.push(`### Key Moments`);
  for (const m of steps.stepC.keyMoments) {
    lines.push(`- ${m}`);
  }
  lines.push('');

  // Quality
  lines.push(`## 5. Quality Check`);
  lines.push(`- **Result**: ${steps.qualityCheck.valid ? 'PASS' : 'FAIL'}`);
  lines.push(`- **Reason**: ${steps.qualityCheck.reason}`);
  lines.push('');

  // Verified
  lines.push(`## 6. Challenge Verification Result (Verified)`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(steps.verified, null, 2));
  lines.push('```');
  lines.push('');

  // Pass 2
  lines.push(`## 7. Pass 2: Panel Structure`);
  lines.push('');
  lines.push(`- **Summary (EN)**: ${steps.pass2.summary}`);
  if (steps.pass2.summaryKo) lines.push(`- **Summary (KO)**: ${steps.pass2.summaryKo}`);
  lines.push(`- **Character Descriptions**: ${steps.pass2.characterDescriptions}`);
  lines.push(`- **Climax Index**: Panel ${steps.pass2.climaxIndex + 1}`);
  lines.push('');
  for (const p of steps.pass2.panels) {
    const climax = steps.pass2.panels.indexOf(p) === steps.pass2.climaxIndex ? ' **(CLIMAX)**' : '';
    lines.push(`### Panel ${p.panelId}${climax} — ${p.emotion}`);
    lines.push(`${p.description}`);
    if (p.dialogue) lines.push(`> EN: ${p.dialogue}`);
    if (p.dialogueKo) lines.push(`> KO: ${p.dialogueKo}`);
    lines.push('');
  }

  // Image Prompts
  lines.push(`## 8. Image Generation Prompts`);
  lines.push('');
  for (const ip of steps.imagePrompts) {
    lines.push(`### Panel ${ip.panelId} (${ip.prompt.length}/1024 chars)`);
    lines.push('```');
    lines.push(ip.prompt);
    lines.push('```');
    lines.push(`Negative: ${ip.negativeText}`);
    lines.push('');
  }

  // Panels with images
  lines.push(`## 9. Generated Images`);
  lines.push('');
  for (const p of panels) {
    lines.push(`### Panel ${p.panelId} — ${p.emotion}`);
    lines.push(`- **Description**: ${p.description}`);
    if (p.dialogue) lines.push(`- **Dialogue(EN)**: ${p.dialogue}`);
    if (p.dialogueKo) lines.push(`- **Dialogue(KO)**: ${p.dialogueKo}`);
    if (p.imageUrl) lines.push(`- **Image**: ${p.imageUrl}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Debug Viewer ───

function DebugView({ data }: { data: ApiResponse }) {
  const { title, url, transcribe, keyframeCount, steps, panels } = data;

  const fullMarkdown = buildFullMarkdown(data);

  // Generate per-section copy text
  const transcribeCopyText = transcribe
    ? transcribe.segments.map(s => `[${s.startTime.toFixed(1)}s] ${s.speaker ? `[${s.speaker}] ` : ''}${s.text}`).join('\n') + '\n\n' + transcribe.fullText
    : '';

  return (
    <div className="space-y-4">
      {/* Full markdown copy button */}
      <div className="flex gap-2 justify-end">
        <CopyButton text={fullMarkdown} label="Copy Full Markdown" />
        <CopyButton text={JSON.stringify(data, null, 2)} label="Copy Raw JSON" />
      </div>

      {/* 0. Basic Info */}
      <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
        <h2 className="font-bold text-lg">{title}</h2>
        <p className="text-gray-400 text-sm mt-1">{url}</p>
        <div className="flex gap-3 mt-3 text-sm flex-wrap">
          <span className="px-2 py-1 bg-gray-800 rounded">{keyframeCount} Keyframes</span>
          <span className="px-2 py-1 bg-gray-800 rounded">{steps.stepC.genre}</span>
          <span className="px-2 py-1 bg-gray-800 rounded">{steps.stepC.duration}s</span>
          <span className="px-2 py-1 bg-gray-800 rounded">
            Audio Dialogue: {steps.stepC.hasAudioDialogue ? 'O' : 'X'}
          </span>
          {transcribe && (
            <span className="px-2 py-1 bg-green-900/50 border border-green-800 rounded text-green-300">
              Transcribe: {transcribe.languageCode || 'auto'}
            </span>
          )}
          <span className={`px-2 py-1 rounded ${
            steps.qualityCheck.valid
              ? 'bg-green-900/50 border border-green-800 text-green-300'
              : 'bg-red-900/50 border border-red-800 text-red-300'
          }`}>
            Quality: {steps.qualityCheck.valid ? 'PASS' : 'FAIL'}
          </span>
        </div>
      </div>

      {/* 1. Transcribe */}
      <Section title="1. Transcribe Results" badge={transcribe ? `${transcribe.segments.length} segments` : 'None'} copyText={transcribeCopyText}>
        {transcribe && transcribe.segments.length > 0 ? (
          <>
            <div className="space-y-2 mb-3">
              {transcribe.segments.map((seg, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="text-blue-400 font-mono whitespace-nowrap">
                    {seg.startTime.toFixed(1)}s
                  </span>
                  {seg.speaker && (
                    <span className="text-purple-400 whitespace-nowrap">[{seg.speaker}]</span>
                  )}
                  <span className="text-gray-300">{seg.text}</span>
                </div>
              ))}
            </div>
            <div className="p-3 bg-gray-800/50 rounded text-sm">
              <p className="text-gray-500 mb-1">Full Text:</p>
              <p className="text-gray-300">{transcribe.fullText}</p>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-sm italic">No dialogue or Transcribe failed</p>
        )}
      </Section>

      {/* 2. Step A */}
      <Section title="2. Step A: Dialogue/Audio Analysis" badge={`${steps.stepA.length} chars`} copyText={steps.stepA}>
        <StepHeader step="Pass 1-A" label="Speaker identification + audio classification (Nova Pro)" />
        <CodeBlock>{steps.stepA}</CodeBlock>
      </Section>

      {/* 3. Step B */}
      <Section title="3. Step B: Interaction Analysis" badge={`${steps.stepB.length} chars`} copyText={steps.stepB}>
        <StepHeader step="Pass 1-B" label="Character interaction + emotion changes + causality (Nova Pro)" />
        <CodeBlock>{steps.stepB}</CodeBlock>
      </Section>

      {/* 4. Step C */}
      <Section title="4. Step C: Comprehensive Analysis (VideoDeepAnalysis)" badge={`${steps.stepC.characters.length} characters, ${steps.stepC.timeline.length} segments`} copyText={JSON.stringify(steps.stepC, null, 2)}>
        <StepHeader step="Pass 1-C" label="Step A + B → Structured JSON (Nova Pro)" />

        <div className="space-y-4">
          {/* Story Arc */}
          <div>
            <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Story Arc</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(steps.stepC.storyArc).map(([key, val]) => (
                <div key={key} className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">{key}</div>
                  <div className="text-sm text-gray-300">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Characters */}
          <div>
            <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Characters</h4>
            <div className="space-y-2">
              {steps.stepC.characters.map((c, i) => (
                <div key={i} className="p-3 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white">{c.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">{c.role}</span>
                  </div>
                  <p className="text-gray-400 text-sm">{c.appearance}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Timeline</h4>
            <div className="space-y-2">
              {steps.stepC.timeline.map((t, i) => (
                <div key={i} className="p-3 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400 font-mono text-sm">{t.timeRange}</span>
                    {t.speakers && t.speakers.length > 0 && (
                      <span className="text-xs text-gray-500">[{t.speakers.join(', ')}]</span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm">{t.description}</p>
                  {t.dialogue && (
                    <p className="text-yellow-300/80 text-sm mt-1 italic">&quot;{t.dialogue}&quot;</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Full Story Summary */}
          <div>
            <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Full Story Summary</h4>
            <p className="text-gray-300 leading-relaxed bg-gray-800 rounded-lg p-3 text-sm">
              {steps.stepC.fullStorySummary}
            </p>
          </div>

          {/* Raw JSON */}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Raw JSON</summary>
            <CodeBlock>{JSON.stringify(steps.stepC, null, 2)}</CodeBlock>
          </details>
        </div>
      </Section>

      {/* 5. Quality Check */}
      <Section title="5. Quality Check" badge={steps.qualityCheck.valid ? 'PASS' : 'FAIL'} copyText={`${steps.qualityCheck.valid ? 'PASS' : 'FAIL'}: ${steps.qualityCheck.reason}`}>
        <div className={`p-4 rounded-lg ${
          steps.qualityCheck.valid ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-lg ${steps.qualityCheck.valid ? 'text-green-400' : 'text-red-400'}`}>
              {steps.qualityCheck.valid ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p className="text-sm text-gray-400">{steps.qualityCheck.reason}</p>
        </div>
      </Section>

      {/* 6. Challenge Verification */}
      <Section title="6. Challenge Verification (Verified)" badge="Compare with Step C" copyText={JSON.stringify(steps.verified, null, 2)}>
        <StepHeader step="Verify" label="Challenge question verification → Modified VideoDeepAnalysis (Nova Pro)" />
        <DiffHighlight original={steps.stepC} verified={steps.verified} />
        <details className="text-sm mt-3">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Verified Raw JSON</summary>
          <CodeBlock>{JSON.stringify(steps.verified, null, 2)}</CodeBlock>
        </details>
      </Section>

      {/* 7. Pass 2: Panel Structure */}
      <Section title="7. Pass 2: Panel Structure" badge={`${steps.pass2.panels.length} panels`} copyText={JSON.stringify(steps.pass2, null, 2)}>
        <StepHeader step="Pass 2" label="Comic panel structure extraction (Nova Pro)" />

        <div className="space-y-3 mb-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Summary (EN)</div>
            <div className="text-sm text-gray-300">{steps.pass2.summary}</div>
          </div>
          {steps.pass2.summaryKo && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Summary (KO)</div>
              <div className="text-sm text-gray-300">{steps.pass2.summaryKo}</div>
            </div>
          )}
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Character Descriptions</div>
            <div className="text-sm text-gray-300">{steps.pass2.characterDescriptions}</div>
          </div>
          <div className="text-xs text-gray-500">
            Climax Index: <span className="text-yellow-400">Panel {steps.pass2.climaxIndex + 1}</span>
          </div>
        </div>

        <div className="space-y-3">
          {steps.pass2.panels.map((p, idx) => {
            const isClimax = idx === steps.pass2.climaxIndex;
            return (
              <div key={p.panelId} className={`p-3 rounded-lg border ${
                isClimax ? 'border-yellow-600 bg-yellow-900/10' : 'border-gray-700 bg-gray-800/50'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-white">Panel {p.panelId}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{p.emotion}</span>
                  {isClimax && <span className="text-xs px-2 py-0.5 bg-yellow-800 text-yellow-300 rounded">CLIMAX</span>}
                </div>
                <p className="text-gray-300 text-sm">{p.description}</p>
                {(p.dialogue || p.dialogueKo) && (
                  <div className="mt-2 text-sm">
                    {p.dialogue && <div className="text-blue-300">EN: {p.dialogue}</div>}
                    {p.dialogueKo && <div className="text-green-300">KO: {p.dialogueKo}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 8. Image Generation Prompts */}
      <Section title="8. Image Generation Prompts" badge={`${steps.imagePrompts.length}`} copyText={steps.imagePrompts.map(ip => `[Panel ${ip.panelId}]\n${ip.prompt}\n\nNegative: ${ip.negativeText}`).join('\n\n---\n\n')}>
        <div className="space-y-4">
          {steps.imagePrompts.map((ip) => (
            <div key={ip.panelId} className="border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 text-sm font-medium text-gray-300">
                Panel {ip.panelId} — <span className="text-orange-400">{ip.prompt.length}/1024 chars</span>
              </div>
              <div className="p-4 space-y-2">
                <div>
                  <div className="text-xs text-orange-400 mb-1 font-semibold">Prompt</div>
                  <CodeBlock>{ip.prompt}</CodeBlock>
                </div>
                <div>
                  <div className="text-xs text-red-400 mb-1 font-semibold">Negative Prompt</div>
                  <pre className="bg-black rounded-lg p-3 text-xs text-red-400/70 overflow-x-auto border border-gray-800">
                    {ip.negativeText}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. Generated Images vs Scene Descriptions */}
      <Section title="9. Generated Images vs Scene Descriptions" badge={`${panels.filter(p => p.imageUrl).length}/${panels.length} success`} copyText={panels.map(p => `[Panel ${p.panelId}] ${p.emotion}\nDescription: ${p.description}${p.dialogue ? `\nDialogue(EN): ${p.dialogue}` : ''}${p.dialogueKo ? `\nDialogue(KO): ${p.dialogueKo}` : ''}${p.imageUrl ? `\nImage: ${p.imageUrl}` : ''}`).join('\n\n')}>
        <div className="space-y-6">
          {panels.map((panel, idx) => {
            const isClimax = idx === steps.pass2.climaxIndex;
            return (
              <div key={panel.panelId} className={`border rounded-xl overflow-hidden ${
                isClimax ? 'border-yellow-500' : 'border-gray-700'
              }`}>
                <div className={`px-4 py-2 text-sm font-semibold ${
                  isClimax ? 'bg-yellow-900/40 text-yellow-300' : 'bg-gray-800 text-gray-300'
                }`}>
                  Panel {panel.panelId} {isClimax && '(CLIMAX)'} — {panel.emotion}
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Generated Image */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Generated Image</div>
                    {panel.imageUrl ? (
                      <img
                        src={panel.imageUrl}
                        alt={`Panel ${panel.panelId}`}
                        className="w-full rounded-lg border border-gray-700"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-sm">
                        Image generation failed
                      </div>
                    )}
                  </div>

                  {/* Scene description + dialogue */}
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Scene Description — <span className="text-orange-400">{panel.description.length} chars</span>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3 text-sm leading-relaxed">
                        {panel.description}
                      </div>
                    </div>
                    {(panel.dialogue || panel.dialogueKo) && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Dialogue</div>
                        <div className="bg-gray-800 rounded-lg p-3 text-sm">
                          {panel.dialogue && <div className="text-blue-300">EN: {panel.dialogue}</div>}
                          {panel.dialogueKo && <div className="text-green-300">KO: {panel.dialogueKo}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ─── Step C vs Verified Diff Highlight ───

function DiffHighlight({ original, verified }: { original: VideoDeepAnalysis; verified: VideoDeepAnalysis }) {
  const diffs: Array<{ field: string; before: string; after: string }> = [];

  // fullStorySummary
  if (original.fullStorySummary !== verified.fullStorySummary) {
    diffs.push({
      field: 'fullStorySummary',
      before: original.fullStorySummary,
      after: verified.fullStorySummary,
    });
  }

  // storyArc
  for (const key of ['setup', 'incitingIncident', 'climax', 'resolution'] as const) {
    if (original.storyArc[key] !== verified.storyArc[key]) {
      diffs.push({
        field: `storyArc.${key}`,
        before: original.storyArc[key],
        after: verified.storyArc[key],
      });
    }
  }

  // characters count/roles
  if (original.characters.length !== verified.characters.length) {
    diffs.push({
      field: 'characters (count)',
      before: `${original.characters.length} characters`,
      after: `${verified.characters.length} characters`,
    });
  } else {
    for (let i = 0; i < original.characters.length; i++) {
      const oc = original.characters[i];
      const vc = verified.characters[i];
      if (oc.role !== vc?.role) {
        diffs.push({
          field: `characters[${i}].role (${oc.name})`,
          before: oc.role,
          after: vc?.role ?? '(none)',
        });
      }
      if (oc.appearance !== vc?.appearance) {
        diffs.push({
          field: `characters[${i}].appearance (${oc.name})`,
          before: oc.appearance.slice(0, 100),
          after: (vc?.appearance ?? '').slice(0, 100),
        });
      }
    }
  }

  // timeline entries
  const maxLen = Math.max(original.timeline.length, verified.timeline.length);
  for (let i = 0; i < maxLen; i++) {
    const ot = original.timeline[i];
    const vt = verified.timeline[i];
    if (!ot || !vt) {
      diffs.push({
        field: `timeline[${i}]`,
        before: ot ? ot.description.slice(0, 80) : '(none)',
        after: vt ? vt.description.slice(0, 80) : '(none)',
      });
    } else if (ot.description !== vt.description) {
      diffs.push({
        field: `timeline[${i}] (${ot.timeRange})`,
        before: ot.description.slice(0, 80),
        after: vt.description.slice(0, 80),
      });
    }
  }

  if (diffs.length === 0) {
    return (
      <div className="p-4 bg-green-900/20 border border-green-800 rounded-lg text-green-300 text-sm">
        No changes after challenge verification — original analysis is accurate
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-yellow-400">{diffs.length} fields modified after verification</p>
      {diffs.map((d, i) => (
        <div key={i} className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-800 text-xs font-mono text-gray-400">{d.field}</div>
          <div className="grid grid-cols-2 divide-x divide-gray-700">
            <div className="p-3">
              <div className="text-xs text-red-400 mb-1">Before (Step C)</div>
              <div className="text-sm text-gray-400">{d.before}</div>
            </div>
            <div className="p-3">
              <div className="text-xs text-green-400 mb-1">After (Verified)</div>
              <div className="text-sm text-gray-300">{d.after}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
