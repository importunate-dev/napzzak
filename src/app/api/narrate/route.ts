import { NextRequest, NextResponse } from 'next/server';
import { generateSpeech, lpcmToWav } from '@/lib/sonic';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: '텍스트가 필요합니다' }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: '텍스트는 500자 이하여야 합니다' }, { status: 400 });
    }

    const resolvedVoice = voiceId || 'matthew';
    const pcmAudio = await generateSpeech(text, resolvedVoice);
    const wavAudio = lpcmToWav(pcmAudio);

    // Buffer → ArrayBuffer 안전 변환 (Node.js Buffer 공유 풀 이슈 방지)
    const arrayBuffer = wavAudio.buffer.slice(
      wavAudio.byteOffset,
      wavAudio.byteOffset + wavAudio.byteLength
    );

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': wavAudio.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[Narrate] 음성 생성 실패:', error);
    return NextResponse.json(
      { error: '음성 생성에 실패했습니다' },
      { status: 500 }
    );
  }
}
