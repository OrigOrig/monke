
/* ============================================================
   TYPE FLOW — screenshot.js
   Rasterize DOM to PNG. Two paths:
     1. captureElement(el) — snapshot any element via foreignObject
     2. captureResults(result) — build a branded social card
   ============================================================ */

// ============================================================
// 1. SCREENSHOT CLASS
// ============================================================

export class Screenshot {
  constructor({ scale = 2, background = null } = {}) {
    this.scale = scale;
    // If null, resolve from CSS var at capture time
    this.background = background;
  }

  // ============================================================
  // 2. PUBLIC API
  // ============================================================

  /**
   * Capture a DOM element as a PNG blob.
   * @param {HTMLElement} el
   * @param {Object} [options]
   * @param {string} [options.filename]
   * @param {number} [options.scale]
   * @param {string} [options.background]
   * @param {boolean} [options.download=true]
   * @returns {Promise<Blob|null>}
   */
  async captureElement(el, options = {}) {
    if (!el || !(el instanceof HTMLElement)) {
      console.warn('[screenshot] invalid element');
      return null;
    }

    try {
      const scale = options.scale ?? this.scale;
      const background = options.background ?? this._resolveBackground();
      const rect = el.getBoundingClientRect();

      // Clone the element so we can inline styles without
      // mutating the live DOM.
      const clone = this._cloneWithInlineStyles(el, rect);

      // Serialize to an SVG foreignObject
      const svg = this._buildSVG(
        this._serializeNode(clone),
        Math.ceil(rect.width),
        Math.ceil(rect.height),
        background
      );

      // Load SVG into an Image
      const img = await this._svgToImage(svg);

      // Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(rect.width * scale);
      canvas.height = Math.ceil(rect.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      // Scale for retina
      ctx.scale(scale, scale);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);

      // Convert to blob
      const blob = await this._canvasToBlob(canvas);

      // Download
      if (options.download !== false) {
        const filename = options.filename || `typeflow-${Date.now()}.png`;
        this.download(blob, filename);
      }

      return blob;
    } catch (err) {
      console.warn('[screenshot] captureElement failed:', err);
      return null;
    }
  }

  /**
   * Capture the results modal and produce a branded social card.
   * @param {Object} result - the same object passed to showResults()
   * @param {Object} [options]
   * @returns {Promise<Blob|null>}
   */
  async captureResults(result, options = {}) {
    if (!result) return null;

    const card = this._buildSocialCard(result);
    document.body.appendChild(card);
    // Hide from view but keep rendered
    card.style.position = 'fixed';
    card.style.left = '-10000px';
    card.style.top = '0';

    try {
      // Wait one frame so layout is settled
      await this._nextFrame();
      const blob = await this.captureElement(card, {
        ...options,
        background: options.background || this._resolveBackground(),
        filename: options.filename || `typeflow-result-${result.wpm}wpm.png`,
      });
      return blob;
    } finally {
      card.remove();
    }
  }

  /**
   * Copy a PNG blob to the system clipboard.
   */
  async copyToClipboard(blob) {
    if (!blob) return false;
    if (!navigator.clipboard || !window.ClipboardItem) {
      console.warn('[screenshot] clipboard API not available');
      return false;
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      return true;
    } catch (err) {
      console.warn('[screenshot] clipboard write failed:', err);
      return false;
    }
  }

  /**
   * Trigger a download of the blob.
   */
  download(blob, filename = `typeflow-${Date.now()}.png`) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ============================================================
  // 3. STYLE INLINING
  // ============================================================

  /**
   * Clone an element and inline all computed styles recursively.
   * This is essential for foreignObject — it doesn't inherit
   * external stylesheets.
   */
  _cloneWithInlineStyles(el, rect) {
    const clone = el.cloneNode(true);

    // Fix root dimensions to match the rect
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.position = 'static';
    clone.style.transform = 'none';

    this._inlineTree(el, clone);

    return clone;
  }

  _inlineTree(original, clone) {
    const computed = window.getComputedStyle(original);

    // Copy a curated set of properties (full set is huge and slow)
    const props = [
      // Layout
      'display', 'position', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'flex', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis',
      'alignItems', 'alignSelf', 'justifyContent', 'gap', 'rowGap', 'columnGap',
      'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow',
      // Box
      'boxSizing', 'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
      'borderBottomLeftRadius', 'borderBottomRightRadius',
      'boxShadow',
      // Typography
      'font', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
      'lineHeight', 'letterSpacing', 'textAlign', 'textTransform',
      'textDecoration', 'textOverflow', 'whiteSpace', 'wordBreak', 'overflowWrap',
      'color',
      // Background
      'background', 'backgroundColor', 'backgroundImage', 'backgroundSize',
      'backgroundPosition', 'backgroundRepeat', 'backgroundClip',
      // Visual
      'opacity', 'visibility', 'overflow', 'overflowX', 'overflowY',
      'transform', 'transformOrigin',
      // SVG
      'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin',
    ];

    for (const prop of props) {
      try {
        const value = computed[prop];
        if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px') {
          clone.style[prop] = value;
        } else if (value === '0px' && /margin|padding|top|left|right|bottom/.test(prop)) {
          clone.style[prop] = '0';
        }
      } catch (e) { /* ignore invalid props */ }
    }

    // Recurse over element children
    const originalChildren = original.children;
    const cloneChildren = clone.children;

    for (let i = 0; i < originalChildren.length; i++) {
      if (cloneChildren[i]) this._inlineTree(originalChildren[i], cloneChildren[i]);
    }
  }

  // ============================================================
  // 4. SERIALIZATION
  // ============================================================

  _serializeNode(node) {
    // Use XMLSerializer for SVG-compatible output
    const serializer = new XMLSerializer();
    let html = serializer.serializeToString(node);

    // Ensure we have the xmlns attribute (foreignObject requires it)
    if (!html.includes('xmlns="http://www.w3.org/1999/xhtml"')) {
      html = html.replace(
        /^<([a-zA-Z]+)/,
        '<$1 xmlns="http://www.w3.org/1999/xhtml"'
      );
    }

    return html;
  }

  // ============================================================
  // 5. SVG BUILDING
  // ============================================================

  _buildSVG(html, width, height, background) {
    // Strip external resources (<link>, <script>, @import) that taint
    // the canvas. Google Fonts <link> tags are the most common culprit.
    // The system font stack is used as fallback.
    const sanitized = String(html)
      .replace(/<link\b[^>]*>/gi, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/@import\s+[^;]+;/g, '');

    return `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="${width}"
           height="${height}"
           viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          ${sanitized}
        </foreignObject>
      </svg>
    `.trim();
  }

  _svgToImage(svg) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    });
  }

  // ============================================================
  // 6. CANVAS
  // ============================================================

  _canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
          'image/png',
          1.0
        );
      } catch (err) {
        // Fallback for tainted canvases — extract via toDataURL,
        // which sometimes bypasses the taint check.
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const bin = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (err2) {
          reject(err2);
        }
      }
    });
  }

  // ============================================================
  // 7. SOCIAL CARD BUILDER
  // ============================================================

  /**
   * Builds an off-screen DOM node styled as a branded share card.
   * Uses the active theme's CSS variables.
   */
  _buildSocialCard(result) {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 800px;
      height: 500px;
      padding: 48px;
      background: var(--bg-elevated);
      color: var(--text-primary);
      font-family: var(--font-mono);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 24px;
      border: 1px solid var(--border-strong);
      border-radius: 20px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    `;

    const brand = document.createElement('div');
    brand.style.cssText = `
      font-size: 22px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.02em;
    `;
    brand.textContent = 'typeflow';

    const tagline = document.createElement('div');
    tagline.style.cssText = `
      font-size: 12px;
      color: var(--text-muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    `;
    tagline.textContent = `${result.mode || 'test'} · ${this._formatModeDetails(result)}`;

    header.appendChild(brand);
    header.appendChild(tagline);

    // Hero stats
    const hero = document.createElement('div');
    hero.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
    `;

    const wpmStat = document.createElement('div');
    wpmStat.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px;">wpm</div>
      <div style="font-size: 88px; font-weight: 700; color: var(--accent); line-height: 1; letter-spacing: -0.04em;">${result.wpm}</div>
    `;

    const accStat = document.createElement('div');
    accStat.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px;">accuracy</div>
      <div style="font-size: 88px; font-weight: 700; color: var(--accent); line-height: 1; letter-spacing: -0.04em;">${result.acc}%</div>
    `;

    hero.appendChild(wpmStat);
    hero.appendChild(accStat);

    // Secondary stats grid
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      margin-top: auto;
    `;

    const items = [
      { label: 'raw', value: result.raw },
      { label: 'consistency', value: `${result.consistency}%` },
      { label: 'time', value: `${Math.round(result.time)}s` },
      { label: 'characters', value: `${result.chars?.correct ?? 0}/${result.chars?.incorrect ?? 0}` },
    ];

    for (const item of items) {
      const cell = document.createElement('div');
      cell.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 4px;">${item.label}</div>
        <div style="font-size: 24px; font-weight: 600; color: var(--text-primary);">${item.value}</div>
      `;
      grid.appendChild(cell);
    }

    card.appendChild(header);
    card.appendChild(hero);
    card.appendChild(grid);

    return card;
  }

  _formatModeDetails(result) {
    if (result.mode === 'time') return `${result.timeLimit || 30}s`;
    if (result.mode === 'words') return `${result.wordLimit || 25}w`;
    if (result.mode === 'quote') return result.quoteLength || 'medium';
    return '';
  }

  // ============================================================
  // 8. UTILITIES
  // ============================================================

  _resolveBackground() {
    if (this.background) return this.background;
    try {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-elevated')
        .trim();
      return bg || '#0a0a0a';
    } catch {
      return '#0a0a0a';
    }
  }

  _nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export default Screenshot;
