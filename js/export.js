// export.js — PNG and PDF export of the rendered score (paginated)
import { LAYOUT } from './renderer.js';

const PAPER_COLOR = '#ffffff';
const INK_COLOR = '#000000';
const INK_MUTED = '#555555';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function _sanitizeFilename(name) {
  return (name || 'score')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim() || 'score';
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build an array of page SVGs, each fitting A4 proportions.
 * First page includes title & composer header; subsequent pages start with score lines.
 */
function _buildPageSvgs(score, scoreContainer) {
  const innerSvg = scoreContainer.querySelector('svg');
  if (!innerSvg) throw new Error('Nenhuma partitura encontrada para exportar.');

  const innerW = parseFloat(innerSvg.getAttribute('width')) || innerSvg.clientWidth || LAYOUT.maxWidth;
  const innerContent = innerSvg.innerHTML;

  const padding = 40;
  const pageW = innerW + padding * 2;
  // A4 proportions (297/210)
  const pageH = pageW * (297 / 210);

  // Header dimensions (first page only)
  const titleSize = 32;
  const composerSize = 14;
  const titleComposerGap = 10;
  const headerToScore = 40;
  const headerH = titleSize + titleComposerGap + composerSize + headerToScore;

  // Line (system) height from renderer layout
  const lineHeight = LAYOUT.staffHeight + LAYOUT.trebleBassGap + LAYOUT.staffHeight + LAYOUT.systemGap;

  const measureCount = score.staves[0].measures.length;
  const numLines = Math.ceil(measureCount / LAYOUT.measuresPerLine);

  // How many lines fit per page
  const firstPageAvail = pageH - padding - headerH - padding;
  const otherPageAvail = pageH - padding * 2;
  const linesFirstPage = Math.max(1, Math.floor(firstPageAvail / lineHeight));
  const linesPerPage = Math.max(1, Math.floor(otherPageAvail / lineHeight));

  const pages = [];
  let lineOffset = 0;
  let pageNum = 0;

  while (lineOffset < numLines) {
    const isFirstPage = pageNum === 0;
    const maxLines = isFirstPage ? linesFirstPage : linesPerPage;
    const linesOnPage = Math.min(maxLines, numLines - lineOffset);

    // Source Y range in the original SVG
    const topMargin = isFirstPage ? 0 : 30; // extra space above for chord symbols
    const srcY = LAYOUT.topPadding + lineOffset * lineHeight - topMargin;
    const sliceH = linesOnPage * lineHeight - LAYOUT.systemGap + topMargin;

    // Where to place the score slice on this page
    const scoreY = isFirstPage ? padding + headerH : padding;
    const contentH = scoreY + sliceH + padding;
    const finalH = Math.min(pageH, contentH);

    let svgParts = '';
    svgParts += `<rect width="100%" height="100%" fill="${PAPER_COLOR}"/>`;

    if (isFirstPage) {
      const titleY = padding + titleSize;
      const composerY = titleY + titleComposerGap + composerSize;
      svgParts +=
        `<text x="${pageW / 2}" y="${titleY}" text-anchor="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" ` +
        `font-weight="700" fill="${INK_COLOR}">${_escapeXml(score.title)}</text>`;
      svgParts +=
        `<text x="${pageW / 2}" y="${composerY}" text-anchor="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${composerSize}" ` +
        `font-style="italic" fill="${INK_MUTED}">${_escapeXml(score.composer)}</text>`;
    }

    // Use nested SVG with viewBox to clip to the relevant systems
    svgParts +=
      `<svg x="${padding}" y="${scoreY}" width="${innerW}" height="${sliceH}" ` +
      `viewBox="0 ${srcY} ${innerW} ${sliceH}" overflow="hidden">` +
      `<g fill="${INK_COLOR}" stroke="${INK_COLOR}" stroke-width="1">` +
      innerContent +
      `</g></svg>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${finalH}" ` +
      `viewBox="0 0 ${pageW} ${finalH}">` +
      svgParts +
      `</svg>`;

    pages.push({ svg, width: pageW, height: finalH });

    lineOffset += linesOnPage;
    pageNum++;
  }

  return pages;
}

/**
 * Rasterize an SVG string to a canvas at the given size and pixel scale.
 * @returns {Promise<HTMLCanvasElement>}
 */
function _svgToCanvas(svgString, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = PAPER_COLOR;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao renderizar SVG em imagem.'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export the current score as a PNG image (paginated, pages stacked vertically).
 */
export async function exportScoreAsPNG(score, scoreContainer) {
  const pages = _buildPageSvgs(score, scoreContainer);

  const scale = 2;
  const gap = 4;
  const canvases = [];
  for (const page of pages) {
    canvases.push(await _svgToCanvas(page.svg, page.width, page.height, scale));
  }

  // Combine all pages into one tall image with a gap between them
  const totalW = canvases[0].width;
  const totalH = canvases.reduce((sum, c) => sum + c.height, 0) + (canvases.length - 1) * gap * scale;

  const combined = document.createElement('canvas');
  combined.width = totalW;
  combined.height = totalH;
  const ctx = combined.getContext('2d');
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(0, 0, totalW, totalH);

  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height + gap * scale;
  }

  await new Promise((resolve, reject) => {
    combined.toBlob((blob) => {
      if (!blob) return reject(new Error('Falha ao gerar PNG.'));
      _downloadBlob(blob, _sanitizeFilename(score.title) + '.png');
      resolve();
    }, 'image/png');
  });
}

/**
 * Export the current score as a multi-page PDF (A4 portrait).
 */
export async function exportScoreAsPDF(score, scoreContainer) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('jsPDF não foi carregado.');
  }

  const pages = _buildPageSvgs(score, scoreContainer);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const availW = pageW - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const page = pages[i];
    const canvas = await _svgToCanvas(page.svg, page.width, page.height, 1.5);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const aspect = page.width / page.height;
    let drawW = availW;
    let drawH = drawW / aspect;
    if (drawH > pageH - margin * 2) {
      drawH = pageH - margin * 2;
      drawW = drawH * aspect;
    }
    const offsetX = (pageW - drawW) / 2;
    const offsetY = margin;

    pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH);
  }

  pdf.save(_sanitizeFilename(score.title) + '.pdf');
}
