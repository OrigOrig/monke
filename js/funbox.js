/* ============================================================
   TYPE FLOW — funbox.js
   Special modifiers (Mirror, Upside Down, Memory, Read Ahead,
   Morse). Each mode returns a transform the engine applies
   per word.
   ============================================================ */

// ============================================================
// 1. MORSE TABLE
// ============================================================

const MORSE = {
  a: '.-',    b: '-...',  c: '-.-.',  d: '-..',   e: '.',
  f: '..-.',  g: '--.',   h: '....',  i: '..',    j: '.---',
  k: '-.-',   l: '.-..',  m: '--',    n: '-.',    o: '---',
  p: '.--.',  q: '--.-',  r: '.-.',   s: '...',   t: '-',
  u: '..-',   v: '...-',  w: '.--',   x: '-..-',  y: '-.--',
  z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
  "'": '.----.', '"': '.-..-.', '-': '-....-', ';': '-.-.-.',
  ':': '---...', '/': '-..-.',  '@': '.--.-.', '=': '-...-',
  '+': '.-.-.',  '(': '-.--.',  ')': '-.--.-',
};

// Reverse: Morse → character (for validation if ever needed)
const MORSE_REVERSE = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k])
);

// ============================================================
// 2. UPSIDE-DOWN MAP
// ============================================================

const UPSIDE_DOWN = {
  a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ',
  h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u',
  o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n',
  v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
  A: '∀', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'Ⅎ', G: '⅁',
  H: 'H', I: 'I', J: 'ſ', K: 'ʞ', L: '˥', M: 'W', N: 'N',
  O: 'O', P: 'Ԁ', Q: 'Ò', R: 'ᴚ', S: 'S', T: '┴', U: '∩',
  V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
  '.': '˙', ',': "'", '?': '¿', '!': '¡', "'": ',', '"': '„',
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
  '<': '>', '>': '<', '&': '⅋', '_': '‾',
  0: '0', 1: 'Ɩ', 2: 'ᄅ', 3: 'Ɛ', 4: 'ㄣ', 5: 'ϛ', 6: '9',
  7: 'ㄥ', 8: '8', 9: '6',
};

// ============================================================
// 3. FUNBOX CLASS
// ============================================================

export class Funbox {
  constructor({ activeMode = 'none', onModeChange } = {}) {
    this.current = activeMode || 'none';
    this.onModeChange = onModeChange || (() => {});

    // Per-test config (set by engine / pages when needed)
    this.config = {
      readAheadCount: 5,
      memoryHintMs: 600,
    };

    // Memory mode: tracks which word index is "revealed"
    this._memoryRevealIndex = 0;

    // Cached transform
    this._transform = null;
  }

  // ============================================================
  // 4. PUBLIC API
  // ============================================================

  /**
   * Set the active mode. Returns the transform function (or null
   * for "none"). The engine calls this to know how to render.
   */
  setMode(mode) {
    if (!MODES[mode]) {
      console.warn(`[funbox] unknown mode "${mode}", falling back to "none"`);
      mode = 'none';
    }

    this.current = mode;
    this._transform = MODES[mode].transform?.bind(this) || null;

    // Reset per-mode state
    this._memoryRevealIndex = 0;

    // Notify
    this.onModeChange(mode);

    // Persist
    try {
      localStorage.setItem('typeflow:funbox', mode);
    } catch (e) { /* ignore */ }

    return this._transform;
  }

  /**
   * Returns the current transform function (or null).
   */
  getTransform() {
    return this._transform;
  }

  /**
   * Returns the active mode id.
   */
  getMode() {
    return this.current;
  }

  /**
   * Returns metadata about the current mode.
   */
  getModeInfo() {
    return MODES[this.current] || MODES.none;
  }

  /**
   * Apply the transform to a single word. Safe to call when mode
   * is "none" — returns word unchanged.
   */
  apply(word) {
    if (!this._transform) return word;
    try {
      return this._transform(word);
    } catch (err) {
      console.warn('[funbox] transform error:', err);
      return word;
    }
  }

  /**
   * Called by the engine after each word advances. Memory mode
   * uses this to reveal the next word.
   */
  onWordAdvance(wordIndex) {
    if (this.current === 'memory') {
      this._memoryRevealIndex = wordIndex;
    }
  }

  /**
   * Called by the engine when the test restarts. Resets all
   * per-test state.
   */
  onTestRestart() {
    this._memoryRevealIndex = 0;
  }

  /**
   * Set config values (read ahead count, etc.).
   */
  setConfig(partial) {
    Object.assign(this.config, partial || {});
    // Invalidate cached transform so next call rebuilds
    this._transform = MODES[this.current]?.transform?.bind(this) || null;
  }

  /**
   * Returns a list of all modes for the command palette /
   * settings UI.
   */
  static getAllModes() {
    return Object.entries(MODES).map(([id, m]) => ({
      id,
      name: m.name,
      description: m.description,
    }));
  }

  /**
   * Returns whether the given mode has display CSS classes the
   * engine should apply (mirror, upside down).
   */
  static isVisualMode(mode) {
    return mode === 'mirror' || mode === 'upsideDown';
  }
}

// ============================================================
// 5. MODE DEFINITIONS
// ============================================================
// Each mode exposes:
//   name        — display label
//   description — short hint
//   transform   — (word:string) => string  (bound to Funbox)
//
// Transform runs on EVERY word the engine renders, both for
// the target and for comparing typed input. That means the
// comparison is correct — user sees the transformed word and
// types what they see.

const MODES = {
  // ------------------------------------------------------------
  none: {
    name: 'None',
    description: 'Standard typing test',
    transform: null,
  },

  // ------------------------------------------------------------
  mirror: {
    name: 'Mirror',
    description: 'Text is reversed horizontally',
    transform(word) {
      return word.split('').reverse().join('');
    },
  },

  // ------------------------------------------------------------
  upsideDown: {
    name: 'Upside Down',
    description: 'Characters are flipped and reversed',
    transform(word) {
      const flipped = word
        .split('')
        .map((ch) => UPSIDE_DOWN[ch] ?? ch)
        .join('');
      return flipped.split('').reverse().join('');
    },
  },

  // ------------------------------------------------------------
  memory: {
    name: 'Memory',
    description: 'Only the current word is visible — the rest are hidden',
    transform(word, index) {
      // Note: engine passes only `word` in the current implementation.
      // Memory mode is handled via a special CSS class + reveal flag
      // rather than text transformation.
      return word;
    },
  },

  // ------------------------------------------------------------
  readAhead: {
    name: 'Read Ahead',
    description: 'Only the next few words are visible',
    transform(word) {
      return word;
    },
  },

  // ------------------------------------------------------------
  morse: {
    name: 'Morse Code',
    description: 'Words are shown in Morse code',
    transform(word) {
      return word
        .split('')
        .map((ch) => {
          const lower = ch.toLowerCase();
          return MORSE[lower] || ch;
        })
        .join(' ');
    },
  },
};

// ============================================================
// 6. BOOT LOADER
// ============================================================

/**
 * Reads the saved funbox mode from localStorage.
 * Returns the mode id (or 'none').
 */
export function applyInitialFunbox() {
  try {
    const saved = localStorage.getItem('typeflow:funbox') || 'none';
    return MODES[saved] ? saved : 'none';
  } catch (err) {
    return 'none';
  }
}

// ============================================================
// 7. EXPORTS
// ============================================================

export const morseTable = MORSE;
export const upsideDownMap = UPSIDE_DOWN;
export const funboxModes = MODES;

export default Funbox;
