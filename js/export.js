// export.js — PNG and PDF export of the rendered score

const PAPER_COLOR = '#faf6ed';
const INK_COLOR = '#1a1510';
const INK_MUTED = '#6b5e4a';

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
 * Build a self-contained SVG string that wraps the rendered score SVG with a
 * parchment background, title, and composer header.
 * @returns {{svg: string, width: number, height: number}}
 */
function _buildFullSvg(score, scoreContainer) {
  const innerSvg = scoreContainer.querySelector('svg');
  if (!innerSvg) throw new Error('Nenhuma partitura encontrada para exportar.');

  const innerW = parseFloat(innerSvg.getAttribute('width')) || innerSvg.clientWidth || 885;
  const innerH = parseFloat(innerSvg.getAttribute('height')) || innerSvg.clientHeight || 500;
  const innerContent = innerSvg.innerHTML;

  const padding = 40;
  const titleSize = 32;
  const composerSize = 14;
  const titleComposerGap = 10;
  const headerToScore = 40;

  const headerH = padding + titleSize + titleComposerGap + composerSize + headerToScore;
  const totalW = innerW + padding * 2;
  const totalH = headerH + innerH + padding;

  const titleY = padding + titleSize;
  const composerY = titleY + titleComposerGap + composerSize;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">` +
      `<rect width="100%" height="100%" fill="${PAPER_COLOR}"/>` +
      `<text x="${totalW / 2}" y="${titleY}" text-anchor="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" ` +
        `font-weight="700" fill="${INK_COLOR}">${_escapeXml(score.title)}</text>` +
      `<text x="${totalW / 2}" y="${composerY}" text-anchor="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-size="${composerSize}" ` +
        `font-style="italic" fill="${INK_MUTED}">${_escapeXml(score.composer)}</text>` +
      `<g transform="translate(${padding}, ${headerH})" fill="${INK_COLOR}" stroke="${INK_COLOR}" stroke-width="1">${innerContent}</g>` +
    `</svg>`;

  return { svg, width: totalW, height: totalH };
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
    img.onerror = (e) => {
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
 * Export the current score as a PNG image.
 * @param {Object} score
 * @param {HTMLElement} scoreContainer  The #score-container element with the SVG
 */
export async function exportScoreAsPNG(score, scoreContainer) {
  const { svg, width, height } = _buildFullSvg(score, scoreContainer);
  const canvas = await _svgToCanvas(svg, width, height, 2);

  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Falha ao gerar PNG.'));
      _downloadBlob(blob, _sanitizeFilename(score.title) + '.png');
      resolve();
    }, 'image/png');
  });
}

/**
 * Export the current score as a PDF document (A4 portrait).
 * @param {Object} score
 * @param {HTMLElement} scoreContainer  The #score-container element with the SVG
 */
export async function exportScoreAsPDF(score, scoreContainer) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('jsPDF não foi carregado.');
  }

  const { svg, width, height } = _buildFullSvg(score, scoreContainer);
  const canvas = await _svgToCanvas(svg, width, height, 2);
  const imgData = canvas.toDataURL('image/png');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const pageH = 297;
  const margin = 15;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  // Preserve aspect ratio, fit within available area
  const aspect = width / height;
  let drawW = availW;
  let drawH = drawW / aspect;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * aspect;
  }
  const offsetX = (pageW - drawW) / 2;
  const offsetY = margin;

  pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH);
  pdf.save(_sanitizeFilename(score.title) + '.pdf');
}
