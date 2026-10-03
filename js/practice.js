/* ============================================================
   TYPE FLOW — practice.js
   Practice words modal. Builds custom word lists from the
   last test result — either missed words, biwords, or slow
   words. Follows Monkeytype behavior.
   ============================================================ */

export class Practice {
  /**
   * @param {Object} options
   * @param {() => Object|null} options.getLastResult
   * @param {(words:string[]) => void} options.onStart
   */
  constructor({ getLastResult, onStart } = {}) {
    this.getLastResult = getLastResult || (() => null);
    this.onStart = onStart || (() => {});

    this.dom = {
      overlay: null,
      closeBtn: null,
      startBtn: null,
      missedControl: null,
      slowControl: null,
    };

    // Current selections
    this.missedMode = 'off'; // 'off' | 'words' | 'biwords'
    this.slowMode = 'off';   // 'off' | 'on'

    this._boundStart = this._handleStart.bind(this);
    this._boundClose = this.close.bind(this);
    this._boundBackdrop = this._handleBackdrop.bind(this);
    this._boundControlClick = this._handleControlClick.bind(this);

    this._mounted = false;
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  mount() {
    if (this._mounted) return;
    this._mounted = true;

    this.dom.overlay = document.getElementById('practiceOverlay');
    this.dom.closeBtn = document.getElementById('closePracticeBtn');
    this.dom.startBtn = document.getElementById('startPracticeBtn');
    this.dom.missedControl = this.dom.overlay?.querySelector('[data-practice-setting="missed"]');
    this.dom.slowControl = this.dom.overlay?.querySelector('[data-practice-setting="slow"]');

    this.dom.closeBtn?.addEventListener('click', this._boundClose);
    this.dom.startBtn?.addEventListener('click', this._boundStart);
    this.dom.overlay?.addEventListener('click', this._boundBackdrop);
    this.dom.missedControl?.addEventListener('click', this._boundControlClick);
    this.dom.slowControl?.addEventListener('click', this._boundControlClick);
  }

  destroy() {
    if (!this._mounted) return;
    this._mounted = false;

    this.dom.closeBtn?.removeEventListener('click', this._boundClose);
    this.dom.startBtn?.removeEventListener('click', this._boundStart);
    this.dom.overlay?.removeEventListener('click', this._boundBackdrop);
    this.dom.missedControl?.removeEventListener('click', this._boundControlClick);
    this.dom.slowControl?.removeEventListener('click', this._boundControlClick);
  }

  // ============================================================
  // OPEN / CLOSE
  // ============================================================

  open() {
    this.mount();
    this.dom.overlay?.removeAttribute('hidden');

    // Reset to defaults each time
    this.missedMode = 'off';
    this.slowMode = 'off';
    this._syncControls();
  }

  close() {
    this.dom.overlay?.setAttribute('hidden', '');
  }

  isOpen() {
    return this.dom.overlay && !this.dom.overlay.hasAttribute('hidden');
  }

  // ============================================================
  // CONTROL HANDLERS
  // ============================================================

  _handleBackdrop(e) {
    if (e.target === this.dom.overlay) this.close();
  }

  _handleControlClick(e) {
    const btn = e.target.closest('.config-btn');
    if (!btn) return;

    const parent = btn.closest('[data-practice-setting]');
    if (!parent) return;

    const setting = parent.dataset.practiceSetting;
    const value = btn.dataset.value;

    if (setting === 'missed') this.missedMode = value;
    if (setting === 'slow') this.slowMode = value;

    this._syncControls();
  }

  _syncControls() {
    // Highlight active buttons
    this.dom.missedControl?.querySelectorAll('.config-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === this.missedMode);
    });
    this.dom.slowControl?.querySelectorAll('.config-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === this.slowMode);
    });
  }

  // ============================================================
  // START
  // ============================================================

  _handleStart() {
    const result = this.getLastResult();
    if (!result) {
      this.close();
      return;
    }

    const words = this.buildWordList(result, {
      missedMode: this.missedMode,
      slowMode: this.slowMode,
    });

    if (!words.length) {
      // Nothing to practice — flash the start button
      const btn = this.dom.startBtn;
      if (btn) {
        const label = btn.querySelector('span');
        const original = label?.textContent || 'start';
        if (label) label.textContent = 'nothing to practice';
        setTimeout(() => { if (label) label.textContent = original; }, 1200);
      }
      return;
    }

    this.close();
    this.onStart(words);
  }

  // ============================================================
  // WORD LIST BUILDER
  // ============================================================

  /**
   * Build the practice word list from the last result.
   * Follows Monkeytype behavior:
   *   - missed words: exact words you got wrong
   *   - biwords: wrong word + the word before it
   *   - slow words: words typed slower than 80% of your avg WPM
   * Biwords are placed first, then plain missed words.
   */
  buildWordList(result, { missedMode = 'off', slowMode = 'off' } = {}) {
    const out = [];

    if (missedMode !== 'off') {
      const { missed, biwords } = this._collectMissed(result, missedMode);
      out.push(...biwords, ...missed);
    }

    if (slowMode === 'on') {
      const slow = this._collectSlow(result);
      out.push(...slow);
    }

    // Deduplicate while preserving order
    return this._unique(out);
  }

  /**
   * Collect missed words from the result.
   * Reads the "words" array + "typed" array from the result to
   * figure out which words were fully wrong.
   */
  _collectMissed(result, mode) {
    const words = result.rawWords || [];
    const typed = result.rawTyped || [];
    const missed = [];
    const biwords = [];

    for (let i = 0; i < words.length; i++) {
      const original = words[i];
      const typedWord = typed[i];

      if (original === undefined) continue;
      if (typedWord === undefined) continue;

      // Was the word fully mistyped?
      const isWrong = typedWord.trim() !== original.trim() && typedWord.trim() !== '';

      if (!isWrong) continue;

      if (mode === 'biwords' && i > 0) {
        const prev = words[i - 1];
        if (prev) {
          biwords.push(prev);
          biwords.push(original);
        } else {
          missed.push(original);
        }
      } else {
        missed.push(original);
      }
    }

    return { missed, biwords };
  }

  /**
   * Collect slow words. A word is "slow" if the time between
   * completing it and completing the previous word was slower
   * than 80% of the average word-completion interval.
   *
   * Uses the result's `wordTimestamps` array if available.
   * Falls back to nothing if the data isn't there.
   */
  _collectSlow(result) {
    const words = result.rawWords || [];
    const timestamps = result.wordTimestamps || [];

    if (timestamps.length < 3 || words.length < 3) return [];

    // Compute intervals between word completions
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      const delta = timestamps[i] - timestamps[i - 1];
      if (delta > 0) intervals.push({ index: i, delta });
    }

    if (intervals.length < 2) return [];

    const avg = intervals.reduce((a, b) => a + b.delta, 0) / intervals.length;
    const threshold = avg / 0.8; // slower than 80% of avg means delta > avg / 0.8

    const slow = [];
    for (const { index, delta } of intervals) {
      if (delta > threshold) {
        const word = words[index];
        if (word) slow.push(word);
      }
    }

    return slow;
  }

  /**
   * Remove duplicates while preserving order.
   */
  _unique(arr) {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const key = String(item).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }
}

export default Practice;
