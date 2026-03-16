import { NextRequest, NextResponse } from 'next/server';
import { generateSpeech, lpcmToWav } from '@/lib/sonic';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: 'Text must be 500 characters or less' }, { status: 400 });
    }

    const resolvedVoice = voiceId || 'matthew';
    const pcmAudio = await generateSpeech(text, resolvedVoice);
    const wavAudio = lpcmToWav(pcmAudio);

    // Safe Buffer → ArrayBuffer conversion (prevents Node.js Buffer shared pool issue)
    const arrayBuffer = wavAudio.buffer.slice(
      wavAudio.byteOffset,
      wavAudio.byteOffset + wavAudio.byteLength
    );

    return new NextResponse(arrayBuffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': wavAudio.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[Narrate] Speech generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
