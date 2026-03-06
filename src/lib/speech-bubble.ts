import sharp from 'sharp';

const MAX_CHARS_PER_LINE = 30;
const FONT_SIZE = 28;
const LINE_HEIGHT = 36;
const BUBBLE_PADDING_X = 32;
const BUBBLE_PADDING_Y = 20;
const BUBBLE_MARGIN = 24;
const BUBBLE_RADIUS = 20;
const TAIL_SIZE = 14;

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function addSpeechBubble(
  imageBuffer: Buffer,
  dialogue: string
): Promise<Buffer> {
  if (!dialogue || dialogue.trim().length === 0) {
    return imageBuffer;
  }

  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1024;
  const imgHeight = metadata.height || 1024;

  const lines = wrapText(dialogue, MAX_CHARS_PER_LINE);
  const textBlockHeight = lines.length * LINE_HEIGHT;
  const bubbleInnerWidth = Math.min(imgWidth - BUBBLE_MARGIN * 2, 600);
  const bubbleWidth = bubbleInnerWidth + BUBBLE_PADDING_X * 2;
  const bubbleHeight = textBlockHeight + BUBBLE_PADDING_Y * 2;
  const totalOverlayHeight = bubbleHeight + TAIL_SIZE + BUBBLE_MARGIN * 2;

  const bubbleX = (imgWidth - bubbleWidth) / 2;
  const bubbleY = BUBBLE_MARGIN;

  const textLines = lines
    .map((line, i) => {
      const y = bubbleY + BUBBLE_PADDING_Y + FONT_SIZE + i * LINE_HEIGHT;
      return `<text x="${imgWidth / 2}" y="${y}" text-anchor="middle" font-size="${FONT_SIZE}" font-family="'Noto Sans KR', 'Arial', sans-serif" fill="#1a1a1a" font-weight="500">${escapeXml(line)}</text>`;
    })
    .join('\n    ');

  const tailCenterX = imgWidth / 2 - 30;
  const tailBottom = bubbleY + bubbleHeight + TAIL_SIZE;

  const svg = `<svg width="${imgWidth}" height="${totalOverlayHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="${BUBBLE_RADIUS}" fill="white" stroke="#e0e0e0" stroke-width="1.5"/>
    <polygon points="${tailCenterX},${bubbleY + bubbleHeight - 1} ${tailCenterX + 20},${bubbleY + bubbleHeight - 1} ${tailCenterX + 5},${tailBottom}" fill="white" stroke="#e0e0e0" stroke-width="1.5"/>
    <rect x="${tailCenterX - 1}" y="${bubbleY + bubbleHeight - 4}" width="23" height="6" fill="white"/>
    ${textLines}
  </svg>`;

  const svgBuffer = Buffer.from(svg);

  const newHeight = imgHeight + totalOverlayHeight;

  return sharp({
    create: {
      width: imgWidth,
      height: newHeight,
      channels: 4,
      background: { r: 15, g: 15, b: 20, alpha: 255 },
    },
  })
    .composite([
      { input: svgBuffer, top: 0, left: 0 },
      { input: imageBuffer, top: totalOverlayHeight, left: 0 },
    ])
    .png()
    .toBuffer();
}
