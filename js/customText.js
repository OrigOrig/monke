/* ============================================================
   TYPE FLOW — customText.js
   Custom text pipeline. Normalization, delimiter parsing,
   shuffle/repeat/random modes, live stats on the text.
   ============================================================ */

// ============================================================
// 1. CONSTANTS
// ============================================================

const MODE = {
  SIMPLE: 'simple',
  REPEAT: 'repeat',
  SHUFFLE: 'shuffle',
  RANDOM: 'random',
};

const DELIMITER = {
  PIPE: 'pipe',
  SPACE: 'space',
};

// Zero-width + invisible Unicode characters
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

// Smart typography → ASCII
const TYPOGRAPHY_MAP = [
  // Quotes
  [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
  [/[\u00AB\u00BB]/g, '"'],
  // Dashes
  [/[\u2013]/g, '-'],
  [/[\u2014]/g, '--'],
  [/[\u2015]/g, '---'],
  [/[\u2212]/g, '-'],
  // Ellipsis
  [/[\u2026]/g, '...'],
  // Spaces
  [/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, ' '],
  // Bullets and misc
  [/[\u2022\u2023\u25E6\u2043\u2219]/g, '*'],
  [/[\u00B7\u2027]/g, '.'],
  // Fractions
  [/[\u00BC]/g, '1/4'],
  [/[\u00BD]/g, '1/2'],
  [/[\u00BE]/g, '3/4'],
];

// ============================================================
// 2. CUSTOM TEXT CLASS
// ============================================================

export class CustomText {
  /**
   * @param {Object} options
   * @param {(text:string, options:Object) => void} options.onApply
   */
  constructor({ onApply } = {}) {
    this.onApply = onApply || (() => {});

    // Last applied state (for editing / re-applying)
    this.lastText = '';
    this.lastOptions = {
      mode: MODE.SIMPLE,
      delimiter: DELIMITER.PIPE,
      shuffleGroups: false,
    };
  }

  // ============================================================
  // 3. MAIN ENTRY
  // ============================================================

  /**
   * Apply custom text. Cleans, parses, and notifies the engine.
   * @param {string} raw
   * @param {Object} options
   * @param {'simple'|'repeat'|'shuffle'|'random'} [options.mode]
   * @param {'pipe'|'space'} [options.delimiter]
   * @param {boolean} [options.shuffleGroups]
   */
  apply(raw, options = {}) {
    const opts = {
      mode: options.mode || MODE.SIMPLE,
      delimiter: options.delimiter || DELIMITER.PIPE,
      shuffleGroups: options.shuffleGroups || false,
    };

    const normalized = this.normalizeTypography(raw);
    const clean = this.stripZeroWidth(normalized);
    const tokens = this.parseTokens(clean, opts);

    this.lastText = raw;
    this.lastOptions = opts;

    // Build final word list
    const words = this.buildWords(tokens, opts);

    // Persist for later
    this._persist(raw, opts);

    // Notify
    this.onApply(words, opts);

    return words;
  }

  // ============================================================
  // 4. NORMALIZATION
  // ============================================================

  /**
   * Replace smart quotes, dashes, ellipses, NBSP with ASCII.
   */
  normalizeTypography(text) {
    if (typeof text !== 'string') return '';
    let out = text;
    for (const [re, replacement] of TYPOGRAPHY_MAP) {
      out = out.replace(re, replacement);
    }
    return out;
  }

  /**
   * Remove zero-width and invisible characters.
   */
  stripZeroWidth(text) {
    if (typeof text !== 'string') return '';
    return text.replace(ZERO_WIDTH_RE, '');
  }

  /**
   * Collapse runs of whitespace (keeping single newlines).
   */
  collapseWhitespace(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ============================================================
  // 5. TOKEN PARSING
  // ============================================================

  /**
   * Split text into tokens.
   * - pipe delimiter: tokens are groups between `|`; each group
   *   is further split on whitespace.
   * - space delimiter: split on any whitespace.
   */
  parseTokens(text, { delimiter = DELIMITER.PIPE } = {}) {
    const cleaned = this.collapseWhitespace(text);
    if (!cleaned) return [];

    if (delimiter === DELIMITER.PIPE) {
      return cleaned
        .split('|')
        .map((group) => group.trim())
        .filter(Boolean)
        .map((group) => group.split(/\s+/).filter(Boolean));
    }

    // Space delimiter — flat list of words
    return [cleaned.split(/\s+/).filter(Boolean)];
  }

  // ============================================================
  // 6. WORD BUILDING
  // ============================================================

  /**
   * Expand tokens into a flat word list based on mode.
   */
  buildWords(groups, { mode = MODE.SIMPLE, shuffleGroups = false } = {}) {
    if (!groups.length) return [];

    switch (mode) {
      case MODE.REPEAT:
        return this._repeat(groups);

      case MODE.SHUFFLE:
        return this._shuffleGroups(groups);

      case MODE.RANDOM:
        return this._randomSample(groups);

      case MODE.SIMPLE:
      default:
        return this._flatten(groups, shuffleGroups);
    }
  }

  _flatten(groups, shuffleGroups) {
    const ordered = shuffleGroups ? this._shuffleArray(groups.slice()) : groups;
    return ordered.flat();
  }

  _repeat(groups) {
    // Repeat the entire group sequence twice
    return [...groups.flat(), ...groups.flat()];
  }

  _shuffleGroups(groups) {
    // Shuffle word order across all groups, preserving group integrity
    return groups.flat();
  }

  _randomSample(groups) {
    const flat = groups.flat();
    const shuffled = this._shuffleArray(flat);
    return shuffled;
  }

  // ============================================================
  // 7. UTILITIES
  // ============================================================

  /**
   * Fisher-Yates shuffle (in place).
   */
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Get statistics about a text sample — used by the modal UI.
   */
  getStats(text, options = {}) {
    const normalized = this.normalizeTypography(text);
    const clean = this.stripZeroWidth(normalized);
    const tokens = this.parseTokens(clean, options);
    const flat = tokens.flat();

    return {
      characters: clean.length,
      charactersNoSpaces: clean.replace(/\s/g, '').length,
      words: flat.length,
      groups: tokens.length,
      uniqueWords: new Set(flat.map((w) => w.toLowerCase())).size,
      longestWord: flat.reduce((a, b) => (b.length > a.length ? b : a), ''),
      averageWordLength: flat.length
        ? Math.round((flat.join('').length / flat.length) * 10) / 10
        : 0,
    };
  }

  // ============================================================
  // 8. PERSISTENCE
  // ============================================================

  _persist(text, options) {
    try {
      localStorage.setItem(
        'typeflow:customText',
        JSON.stringify({ text, options, savedAt: Date.now() })
      );
    } catch (err) {
      console.warn('[customText] failed to persist:', err);
    }
  }

  /**
   * Load last saved custom text (if any).
   */
  static loadSaved() {
    try {
      const raw = localStorage.getItem('typeflow:customText');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  /**
   * Clear saved custom text.
   */
  static clearSaved() {
    try {
      localStorage.removeItem('typeflow:customText');
    } catch (err) { /* ignore */ }
  }

  // ============================================================
  // 9. PREVIEW (for the modal UI)
  // ============================================================

  /**
   * Returns a preview string of the first N words.
   */
  preview(text, options = {}, maxWords = 40) {
    const normalized = this.normalizeTypography(text);
    const clean = this.stripZeroWidth(normalized);
    const tokens = this.parseTokens(clean, options);
    const words = this.buildWords(tokens, options);
    return words.slice(0, maxWords).join(' ');
  }
}

// ============================================================
// 10. STATIC HELPERS
// ============================================================

export function stripZeroWidth(text) {
  return String(text || '').replace(ZERO_WIDTH_RE, '');
}

export function normalizeTypography(text) {
  let out = String(text || '');
  for (const [re, replacement] of TYPOGRAPHY_MAP) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function countWords(text) {
  const clean = stripZeroWidth(normalizeTypography(text));
  return clean.split(/\s+/).filter(Boolean).length;
}

// ============================================================
// 11. EXPORTS
// ============================================================

export const CustomTextModes = MODE;
export const CustomTextDelimiters = DELIMITER;

export default CustomText;
