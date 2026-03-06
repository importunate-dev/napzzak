import sharp from 'sharp';

const GUTTER = 12;
const CELL_WIDTH = 400;
const CELL_HEIGHT = 500;
const BACKGROUND_COLOR = { r: 15, g: 15, b: 20, alpha: 255 };

export type ComicPageLayout = 'strip' | 'grid';

function getGridDimensions(panelCount: number): { cols: number; rows: number } {
  if (panelCount <= 0) return { cols: 1, rows: 1 };
  if (panelCount <= 4) return { cols: 2, rows: Math.ceil(panelCount / 2) };
  if (panelCount <= 6) return { cols: 2, rows: Math.ceil(panelCount / 2) };
  if (panelCount <= 9) return { cols: 3, rows: Math.ceil(panelCount / 3) };
  return { cols: 4, rows: Math.ceil(panelCount / 4) };
}

/**
 * Resize panel to fill cell dimensions (cover fit, center crop).
 */
async function resizePanel(
  panelBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  return sharp(panelBuffer)
    .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

/**
 * Compose multiple comic panels into a single comic page image.
 * @param panels - Array of panel image buffers (with speech bubbles already applied)
 * @param _layout - Layout hint ('strip' | 'grid'), currently both use same grid logic
 * @returns Composed comic page as PNG buffer
 */
export async function composeComicPage(
  panels: Buffer[],
  _layout: ComicPageLayout = 'grid'
): Promise<Buffer> {
  if (panels.length === 0) {
    throw new Error('composeComicPage requires at least one panel');
  }

  const { cols, rows } = getGridDimensions(panels.length);
  const panelCount = panels.length;

  const pageWidth = cols * CELL_WIDTH + (cols - 1) * GUTTER + 2 * GUTTER;
  const pageHeight = rows * CELL_HEIGHT + (rows - 1) * GUTTER + 2 * GUTTER;

  const resizedPanels: Buffer[] = [];
  for (let i = 0; i < panelCount; i++) {
    const resized = await resizePanel(panels[i], CELL_WIDTH, CELL_HEIGHT);
    resizedPanels.push(resized);
  }

  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < panelCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const left = GUTTER + col * (CELL_WIDTH + GUTTER);
    const top = GUTTER + row * (CELL_HEIGHT + GUTTER);

    composites.push({
      input: resizedPanels[i],
      top,
      left,
    });
  }

  const pageBuffer = await sharp({
    create: {
      width: pageWidth,
      height: pageHeight,
      channels: 4,
      background: BACKGROUND_COLOR,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return pageBuffer;
}
