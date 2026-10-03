/* ============================================================
   TYPE FLOW — engine.js
   Complete rewrite. Fixes:
     - Bug 1: auto-focus, 3-line overflow window
     - Bug 2: words render on init without needing keypress
     - Bug 4: caret aligned to letter baseline (via CSS)
     - Bug 5: backspace works always when focused
     - Bug 6: click-away safe, click-back focuses
     - Bug 10: funbox transform applied on mode change
   ============================================================ */

import { update, getState, incrementTestsStarted } from './state.js';

// ============================================================
// CONSTANTS
// ============================================================

const PUNCTUATION = ['.', ',', '?', '!', "'", '"', '-', ';', ':'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const DIFFICULTY = {
  NORMAL: 'normal',
  EXPERT: 'expert',
  MASTER: 'master',
};

const STOP_ON_ERROR = {
  OFF: 'off',
  LETTER: 'letter',
  WORD: 'word',
};

// 3-line overflow window — Monkeytype-style
const LINE_WINDOW = 3;

// ============================================================
// ENGINE CLASS
// ============================================================

export class Engine {
  constructor({ state, update, stats, sound, onFinish, onTick }) {
    this.state = state;
    this.update = update;
    this.stats = stats;
    this.sound = sound;
    this.onFinish = onFinish;
    this.onTick = onTick;

    // DOM refs
    this.dom = {
      container: null,
      words: null,
      caret: null,
      focusOverlay: null,
      liveTime: null,
      liveWpm: null,
      liveAcc: null,
      mobileInput: null,
      typingWrap: null,
    };

    // Word state
    this.words = [];
    this.typed = [];
    this.wordIndex = 0;
    this.letterIndex = 0;

    // Line-window state
    this.lineHeight = 0;
    this.visibleLineOffset = 0;

    // Timing
    this.startTime = 0;
    this.endTime = 0;
    this.elapsed = 0;

    // Test state
    this.isActive = false;
    this.isFinished = false;
    this.isFocused = false;

    // Counters
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.incorrectKeystrokes = 0;
    this.extraKeystrokes = 0;
    this.missedKeystrokes = 0;

    // Combo
    this.currentStreak = 0;
    this.bestStreak = 0;

    // Replay
    this.replayLog = [];

    // Timers
    this.tickInterval = null;
    this.idleTimer = null;

    // Settings cache
    this.settings = {
      difficulty: DIFFICULTY.NORMAL,
      stopOnError: STOP_ON_ERROR.OFF,
      blindMode: false,
      freedomMode: false,
      caretStyle: 'line',
      caretBlink: true,
    };

    // Data (word lists + quotes) — injected via setData()
    this.data = null;

    // Funbox transform
    this.transform = null;

    // Bound handlers
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleFocus = this._handleFocus.bind(this);
    this._handleBlur = this._handleBlur.bind(this);
    this._handleMobileInput = this._handleMobileInput.bind(this);
    this._handleOverlayClick = this._handleOverlayClick.bind(this);
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._handleWindowResize = this._handleWindowResize.bind(this);
    this._handleTick = this._handleTick.bind(this);
  }

  // ============================================================
  // INIT
  // ============================================================

  init() {
    this.dom.container = document.getElementById('typingContainer');
    this.dom.words = document.getElementById('wordsContainer');
    this.dom.caret = document.getElementById('caret');
    this.dom.focusOverlay = document.getElementById('focusOverlay');
    this.dom.liveTime = document.getElementById('liveTime');
    this.dom.liveWpm = document.getElementById('liveWpm');
    this.dom.liveAcc = document.getElementById('liveAcc');
    this.dom.mobileInput = document.getElementById('mobileInput');
    this.dom.typingWrap = this.dom.container?.closest('.typing-wrap');

    if (!this.dom.container || !this.dom.words) {
      console.warn('[engine] critical DOM elements not found');
      return;
    }

    // Listeners
    document.addEventListener('keydown', this._handleKeyDown);
    document.addEventListener('click', this._handleDocumentClick);
    window.addEventListener('resize', this._handleWindowResize);
    this.dom.container.addEventListener('focus', this._handleFocus);
    this.dom.container.addEventListener('blur', this._handleBlur);
    this.dom.container.addEventListener('click', this._handleOverlayClick);
    this.dom.focusOverlay?.addEventListener('click', this._handleOverlayClick);
    this.dom.mobileInput?.addEventListener('input', this._handleMobileInput);

    // Caret
    this.setCaretStyle(getState().caretStyle || 'line');
    this.setCaretBlink(getState().caretBlink !== false);

    // Generate first test
    this.restart();

    // Focus immediately
    this.focus();
  }

  setData(data) {
    this.data = data || {};
    // If restart already ran with empty data, regenerate now
    if (this.words.length === 0 || this.words.length < 5) {
      this.words = this._generateWords();
      this._renderWords();
      this._applyTypedState();
      this._updateCaret();
    }
  }

  // ============================================================
  // FOCUS
  // ============================================================

  focus() {
    if (!this.dom.container) return;

    // Ensure the container is programmatically focusable.
    // Some browsers strip tabindex when an element's parent was
    // hidden (like when the results modal opened). Restore it.
    if (this.dom.container.tabIndex < 0) {
      this.dom.container.setAttribute('tabindex', '0');
    }

    this.dom.container.focus({ preventScroll: true });
    this.dom.mobileInput?.focus({ preventScroll: true });
    this.isFocused = true;
    this.dom.focusOverlay?.classList.add('hidden');
  }

  blur() {
    if (!this.dom.container) return;
    this.dom.container.blur();
    this.dom.mobileInput?.blur();
    this.isFocused = false;
  }

  _handleFocus() {
    this.isFocused = true;
    this.dom.focusOverlay?.classList.add('hidden');
    this._scheduleIdle();
  }

  _handleBlur() {
    this.isFocused = false;
    // Only show overlay if test hasn't started
    if (!this.isActive && !this.isFinished) {
      this.dom.focusOverlay?.classList.remove('hidden');
    }
  }

  _handleOverlayClick(e) {
    e?.preventDefault?.();
    this.focus();
  }

  /**
   * Click anywhere on the typing wrap focuses the input.
   * Click outside does NOT blur if typing has started.
   */
  _handleDocumentClick(e) {
    if (!this.dom.typingWrap) return;
    const inside = this.dom.typingWrap.contains(e.target);
    if (inside) {
      this.focus();
    }
    // Don't auto-blur on outside click — that's what was locking the app
  }

  _handleWindowResize() {
    this._updateCaret();
  }

  // ============================================================
  // RESTART / RESET
  // ============================================================

  restart({ reroll = true } = {}) {
    this._stopTick();
    this._clearIdle();

    // Reset counters
    this.startTime = 0;
    this.endTime = 0;
    this.elapsed = 0;
    this.isActive = false;
    this.isFinished = false;

    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.incorrectKeystrokes = 0;
    this.extraKeystrokes = 0;
    this.missedKeystrokes = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;

    this.replayLog = [];

    // Reset positions
    this.wordIndex = 0;
    this.letterIndex = 0;
    this.typed = [];

    // Reset stats engine
    this.stats?.reset?.();

    // Reset line window
    this.visibleLineOffset = 0;

    // Always generate fresh words
    this.words = this._generateWords();

    // Render
    this._renderWords();
    this._applyTypedState();
    this._updateCaret();
    this._updateLiveStats(true);

    // Reset visible line state
    this._resetLineWindow();

    // Emit
    update('isTyping', false);
    update('isFinished', false);

    // Keep focus
    this.focus();
  }

  flush() {
    this._stopTick();
    this._clearIdle();
  }

  pause() {
    this._stopTick();
  }

  resume() {
    if (this.isActive && !this.isFinished) {
      this._startTick();
    }
  }

  // ============================================================
  // WORD GENERATION
  // ============================================================

  _generateWords() {
    const s = this.state;
    const data = this.data || {};
    const words = data.words || {};

    // Zen mode
    if (s.mode === 'zen') return [];

    // Custom text
    if (s.mode === 'custom') {
      const text = s.customText?.text || '';
      if (!text) return ['type', 'or', 'paste', 'custom', 'text', 'in', 'settings'];
      return this._parseCustomText(text, s.customText?.options);
    }

    // Quote mode
    if (s.mode === 'quote') {
      const quotes = data.quotes || {};
      const set = quotes[s.quoteLength || 'medium'] || quotes.medium || [];
      if (!set.length) return ['no', 'quotes', 'available'];
      const quote = set[Math.floor(Math.random() * set.length)];
      this.currentQuote = quote;
      return quote.text.split(/\s+/).filter(Boolean);
    }

    // Word list selection
    const wordList = s.language === 'code'
      ? (words.code?.length ? words.code : words.english)
      : s.language === 'english1k'
        ? (words.english1k?.length ? words.english1k : words.english)
        : words.english;

    if (!wordList || !wordList.length) {
      // Hard fallback so we NEVER render empty
      return ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    }

    const count = s.mode === 'time'
      ? this._estimateWordCount()
      : (s.wordLimit || 25);

    const out = [];
    for (let i = 0; i < count; i++) {
      let word = wordList[Math.floor(Math.random() * wordList.length)];
      word = this._applyModifiers(word);
      out.push(word);
    }

    return out;
  }

  _estimateWordCount() {
    const seconds = this.state.timeLimit || 30;
    // ~220 words per 60s buffer + 50 extra
    return Math.max(50, Math.ceil((seconds / 60) * 220) + 50);
  }

  _applyModifiers(word) {
    const s = this.state;
    let out = word;

    if (s.punctuation) {
      if (Math.random() < 0.18) {
        out = out.charAt(0).toUpperCase() + out.slice(1);
      }
      if (Math.random() < 0.25) {
        out += PUNCTUATION[Math.floor(Math.random() * PUNCTUATION.length)];
      }
    }

    if (s.numbers && Math.random() < 0.14) {
      const num = NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
      out = Math.random() < 0.5 ? num + out : out + num;
    }

    return out;
  }

  _parseCustomText(text, options = {}) {
    const { mode = 'simple', delimiter = 'pipe' } = options;
    const clean = this._normalizeText(text);
    const delimiterChar = delimiter === 'pipe' ? '|' : ' ';
    const tokens = clean
      .split(new RegExp(`\\s*${delimiterChar === '|' ? '\\|' : '\\s'}\\s*`))
      .filter(Boolean);

    switch (mode) {
      case 'repeat':
        return tokens.flatMap((t) => [t, t]);
      case 'shuffle':
        return this._shuffle(tokens);
      case 'random':
        return this._shuffle(tokens).slice(0, Math.min(50, tokens.length));
      default:
        return tokens;
    }
  }

  _normalizeText(text) {
    return String(text)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013|\u2014/g, '-')
      .replace(/\r\n/g, '\n');
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  loadCustomText(text, options) {
    this.words = this._parseCustomText(text, options);
    this.restart({ reroll: false });
  }

  // ============================================================
  // RENDERING
  // ============================================================

  _renderWords() {
    const wrap = this.dom.words;
    if (!wrap) return;
    wrap.innerHTML = '';

    if (this.state.mode === 'zen' && this.words.length === 0) {
      wrap.setAttribute('data-zen', 'true');
      wrap.innerHTML = '<span class="zen-placeholder">zen mode — type freely. shift+enter to finish.</span>';
      return;
    }
    wrap.removeAttribute('data-zen');

    const frag = document.createDocumentFragment();

    for (let wi = 0; wi < this.words.length; wi++) {
      const wordEl = document.createElement('div');
      wordEl.className = 'word';
      wordEl.dataset.wordIndex = wi;
      if (wi === this.wordIndex) wordEl.classList.add('active');

      const wordStr = this._transformWord(this.words[wi]);

      for (let li = 0; li < wordStr.length; li++) {
        const letterEl = document.createElement('span');
        letterEl.className = 'letter';
        letterEl.dataset.letterIndex = li;
        letterEl.textContent = wordStr[li];
        wordEl.appendChild(letterEl);
      }

      frag.appendChild(wordEl);
    }

    wrap.appendChild(frag);

    // Cache line height after render
    requestAnimationFrame(() => {
      this._measureLineHeight();
    });
  }

  _measureLineHeight() {
    const firstWord = this.dom.words?.querySelector('.word');
    if (!firstWord) return;
    const rect = firstWord.getBoundingClientRect();
    this.lineHeight = rect.height + 8; // approximate line gap
  }

  _transformWord(word) {
    if (!this.transform) return word;
    try {
      return this.transform(word);
    } catch (err) {
      return word;
    }
  }

  _applyTypedState() {
    // Update only active + previous word (O(1) instead of O(n))
    const activeEl = this.dom.words?.querySelector('.word.active');
    if (activeEl) this._applyWordState(activeEl, this.wordIndex);

    if (this.wordIndex > 0) {
      const prevEl = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex - 1}"]`);
      if (prevEl) this._applyWordState(prevEl, this.wordIndex - 1);
    }
  }

  _applyWordState(wordEl, wi) {
    const originalWord = this.words[wi];
    if (originalWord === undefined) return;

    const transformedWord = this._transformWord(originalWord);
    const typedWord = this.typed[wi] || '';
    const letters = wordEl.querySelectorAll('.letter');

    letters.forEach((letterEl, li) => {
      letterEl.classList.remove('correct', 'incorrect', 'extra', 'missed');

      if (li < typedWord.length) {
        const expected = transformedWord[li];
        const actual = typedWord[li];
        if (expected === undefined) {
          letterEl.classList.add('extra');
        } else if (actual === expected) {
          if (!this.settings.blindMode) letterEl.classList.add('correct');
        } else {
          if (!this.settings.blindMode) letterEl.classList.add('incorrect');
        }
      }
    });

    // Extra characters typed beyond word length
    wordEl.querySelectorAll('.letter.extra').forEach((el) => el.remove());
    const extraCount = Math.max(0, typedWord.length - transformedWord.length);
    if (extraCount > 0) {
      for (let i = 0; i < extraCount; i++) {
        const ch = typedWord[transformedWord.length + i];
        const extra = document.createElement('span');
        extra.className = 'letter extra';
        extra.textContent = ch;
        wordEl.appendChild(extra);
      }
    }

    // Missed letters
    if (wi < this.wordIndex && typedWord.length < transformedWord.length) {
      for (let li = typedWord.length; li < transformedWord.length; li++) {
        letters[li]?.classList.add('missed');
      }
    }
  }

  // ============================================================
  // LINE WINDOW (Monkeytype-style 3-line overflow)
  // ============================================================

  _resetLineWindow() {
    if (!this.dom.words) return;
    this.dom.words.style.transform = 'translateY(0px)';
    this.visibleLineOffset = 0;
  }

  /**
   * After each word completes, check if the active word has moved
   * to a new line. If so, shift the words container up so the
   * active line stays on line 2 of the visible window.
   */
  _updateLineWindow() {
    const wrap = this.dom.words;
    const activeWord = wrap?.querySelector('.word.active');
    if (!wrap || !activeWord) return;

    const container = wrap.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeWord.getBoundingClientRect();
    const lineHeight = this.lineHeight || activeRect.height + 8;

    // Active word's top edge relative to container's visible top,
    // accounting for the current translateY offset
    const activeTopInContainer = (activeRect.top - containerRect.top) + this.visibleLineOffset;

    // Desired: active word sits at line 2 (index 1) of the visible window
    const targetLine = 1;
    const currentLine = Math.max(0, Math.round(activeTopInContainer / lineHeight));
    const desiredOffset = Math.max(0, (currentLine - targetLine) * lineHeight);

    if (Math.abs(desiredOffset - this.visibleLineOffset) > 1) {
      this.visibleLineOffset = desiredOffset;
      wrap.style.transform = `translateY(${-desiredOffset}px)`;
    }
  }

  // ============================================================
  // CARET
  // ============================================================

  _updateCaret() {
    const caret = this.dom.caret;
    if (!caret) return;

    if (this.settings.caretStyle === 'off' || this.state.mode === 'zen') {
      caret.classList.add('off');
      return;
    }
    caret.classList.remove('off');

    const activeWord = this.dom.words?.querySelector('.word.active');
    if (!activeWord) {
      caret.style.opacity = '0';
      return;
    }
    caret.style.opacity = '1';

    const containerRect = this.dom.words.getBoundingClientRect();
    const letters = activeWord.querySelectorAll('.letter');
    const li = this.letterIndex;

    let left = 0;
    let top = 0;
    let height = 24;

    if (letters.length === 0) {
      const r = activeWord.getBoundingClientRect();
      left = r.left - containerRect.left;
      top = r.top - containerRect.top;
      height = r.height;
    } else if (li < letters.length) {
      const r = letters[li].getBoundingClientRect();
      left = r.left - containerRect.left;
      top = r.top - containerRect.top;
      height = r.height;
    } else {
      const r = letters[letters.length - 1].getBoundingClientRect();
      left = r.right - containerRect.left;
      top = r.top - containerRect.top;
      height = r.height;
    }

    // Use transform for GPU-accelerated positioning (smoother)
    caret.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    caret.style.height = `${Math.round(height)}px`;

    // Reapply style classes
    caret.className = 'caret';
    if (this.settings.caretStyle === 'smooth') caret.classList.add('smooth');
    if (this.settings.caretStyle === 'block') caret.classList.add('block');
    if (this.settings.caretStyle === 'underline') caret.classList.add('underline');
    if (this.settings.caretBlink) caret.classList.add('blink');
    if (caret.classList.contains('idle')) caret.classList.add('idle');
  }

  setCaretStyle(style) {
    this.settings.caretStyle = style;
    this._updateCaret();
  }

  setCaretBlink(enabled) {
    this.settings.caretBlink = enabled;
    this._updateCaret();
  }

  // ============================================================
  // SETTINGS
  // ============================================================

  setDifficulty(d) {
    this.settings.difficulty = d;
  }

  setStopOnError(mode) {
    this.settings.stopOnError = mode;
  }

  setBlindMode(enabled) {
    this.settings.blindMode = enabled;
    this._applyTypedState();
  }

  setFreedomMode(enabled) {
    this.settings.freedomMode = enabled;
  }

  setTransform(fn) {
    this.transform = typeof fn === 'function' ? fn : null;
    this._renderWords();
    this._applyTypedState();
    this._updateCaret();
  }

  // ============================================================
  // KEYBOARD
  // ============================================================

  _handleKeyDown(e) {
    // Don't intercept when a modal is open
    if (this._isModalOpen()) return;

    // Ignore modifier-only keys
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

    // If the test finished, ANY keypress restarts a fresh test.
    // This matches Monkeytype behavior: press Tab/Enter to restart,
    // OR just start typing a new test directly.
    if (this.isFinished) {
      // Tab / Enter already handled by main.js quickRestart
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.restart({ reroll: true });
        // Fall through so the first key registers
        this.focus();
      }
      return;
    }

    // Auto-focus on first keypress
    if (!this.isFocused) {
      this.focus();
    }

    // Zen mode finish
    if (this.state.mode === 'zen' && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      this._finish();
      return;
    }

    // Auto-start on first keystroke
    if (!this.isActive && !this.isFinished) {
      this._start();
    }

    // Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      this._handleBackspace(e.ctrlKey || e.metaKey || e.altKey);
      return;
    }

    // Space
    if (e.key === ' ') {
      e.preventDefault();
      this._handleSpace();
      return;
    }

    // Printable characters
    if (e.key.length === 1) {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      this._handleChar(e.key);
    }
  }

  _handleMobileInput(e) {
    const val = e.target.value;
    if (!val) return;
    e.target.value = '';

    // If test finished, first input restarts
    if (this.isFinished) {
      this.restart({ reroll: true });
      this.focus();
      return;
    }

    if (!this.isActive) this._start();

    for (const ch of val) {
      if (ch === ' ') this._handleSpace();
      else if (ch === '\b' || ch === '\u007F') this._handleBackspace(false);
      else this._handleChar(ch);
    }
  }

  // ============================================================
  // CHAR / SPACE / BACKSPACE
  // ============================================================

  _handleChar(char) {
    const currentWord = this.words[this.wordIndex];
    if (currentWord === undefined && this.state.mode !== 'zen') return;

    const transformedWord = this._transformWord(currentWord || '');
    const expected = transformedWord[this.letterIndex];
    const isCorrect = char === expected;

    this.replayLog.push({
      t: Math.round(performance.now() - this.startTime),
      c: char,
      e: expected,
      ok: isCorrect,
      w: this.wordIndex,
      l: this.letterIndex,
    });

    this.sound?.play?.(isCorrect ? 'key' : 'error');

    // Master difficulty: fail on first wrong key
    if (this.settings.difficulty === DIFFICULTY.MASTER && !isCorrect) {
      this._flashError();
      this._finish();
      return;
    }

    this.totalKeystrokes++;

    // Stop on error (letter mode)
    if (this.settings.stopOnError === STOP_ON_ERROR.LETTER && !isCorrect) {
      this.incorrectKeystrokes++;
      this._flashError();
      this._markLetterIncorrect();
      this._resetStreak();
      return;
    }

    // Append char
    if (!this.typed[this.wordIndex]) this.typed[this.wordIndex] = '';
    this.typed[this.wordIndex] += char;

    if (isCorrect) {
      this.correctKeystrokes++;
      this._pulseLetter();
      this.currentStreak++;
      if (this.currentStreak > this.bestStreak) this.bestStreak = this.currentStreak;
      if (this.currentStreak > 0 && this.currentStreak % 10 === 0) {
        this._comboPop();
      }
    } else {
      this.incorrectKeystrokes++;
      this._flashError();
      this._resetStreak();
    }

    this.letterIndex++;

    this._applyTypedState();
    this._updateCaret();
    this._updateLiveStats();

    // Words mode: auto-finish on last word completion
    if (this.state.mode === 'words' && this.wordIndex === this.words.length - 1) {
      if (this.letterIndex >= transformedWord.length) {
        this._finish();
      }
    }
  }

  _handleSpace() {
    const currentWord = this.words[this.wordIndex];
    if (currentWord === undefined) return;

    const transformedWord = this._transformWord(currentWord);
    const typedWord = this.typed[this.wordIndex] || '';

    // Expert: fail if word wrong
    if (this.settings.difficulty === DIFFICULTY.EXPERT && typedWord !== transformedWord) {
      this._flashError();
      this._finish();
      return;
    }

    // Stop on error (word mode)
    if (this.settings.stopOnError === STOP_ON_ERROR.WORD && typedWord !== transformedWord) {
      this._flashError();
      this._resetStreak();
      return;
    }

    // Count missed chars
    if (typedWord.length < transformedWord.length) {
      this.missedKeystrokes += transformedWord.length - typedWord.length;
    }

    // Animate word completion
    const wordEl = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    if (wordEl) {
      wordEl.classList.add('completed');
      setTimeout(() => wordEl.classList.remove('completed'), 400);
    }

    // Advance
    this.wordIndex++;
    this.letterIndex = 0;

    // End of words?
    if (this.wordIndex >= this.words.length) {
      this._finish();
      return;
    }

    // Update active class
    this.dom.words?.querySelectorAll('.word.active').forEach((el) => el.classList.remove('active'));
    const nextWord = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    nextWord?.classList.add('active');

    this._applyTypedState();
    this._updateLineWindow();
    this._updateCaret();
  }

  _handleBackspace(isWordDelete) {
    if (this.letterIndex === 0 && this.wordIndex === 0) return;
    if (this.isFinished) return;

    if (isWordDelete) {
      // Delete entire current word
      this.typed[this.wordIndex] = '';
      this.letterIndex = 0;
    } else if (this.letterIndex > 0) {
      // Delete one char
      const cur = this.typed[this.wordIndex] || '';
      this.typed[this.wordIndex] = cur.slice(0, -1);
      this.letterIndex--;
    } else {
      // Jump to previous word
      if (!this.settings.freedomMode) {
        const prevTyped = this.typed[this.wordIndex - 1] || '';
        const prevWord = this._transformWord(this.words[this.wordIndex - 1] || '');
        if (prevTyped === prevWord) return;
      }
      this.wordIndex--;
      const prevTyped = this.typed[this.wordIndex] || '';
      this.letterIndex = prevTyped.length;

      // Update active class
      this.dom.words?.querySelectorAll('.word.active').forEach((el) => el.classList.remove('active'));
      const prevEl = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
      prevEl?.classList.add('active');
    }

    this._applyTypedState();
    this._updateLineWindow();
    this._updateCaret();
  }

  // ============================================================
  // TEST LIFECYCLE
  // ============================================================

  _start() {
    this.isActive = true;
    this.startTime = performance.now();

    update('isTyping', true);

    try { incrementTestsStarted(); } catch (e) { /* ignore */ }

    if (this.onTick) this.onTick({ time: 0, wpm: 0, acc: 100 });

    this._startTick();
  }

  _finish() {
    if (this.isFinished) return;

    this.isFinished = true;
    this.isActive = false;
    this.endTime = performance.now();
    this.elapsed = (this.endTime - this.startTime) / 1000;

    this._stopTick();
    this._clearIdle();

    update('isTyping', false);
    update('isFinished', true);

    const stats = this._computeFinalStats();

    if (this.onFinish) this.onFinish(stats);
  }

  _computeFinalStats() {
    const minutes = Math.max(this.elapsed / 60, 1 / 60);

    const wpm = Math.round((this.correctKeystrokes / 5) / minutes);
    const raw = Math.round(
      ((this.correctKeystrokes + this.incorrectKeystrokes + this.extraKeystrokes) / 5) / minutes
    );

    const totalKeystrokes = this.correctKeystrokes + this.incorrectKeystrokes;
    const acc = totalKeystrokes > 0
      ? Math.round((this.correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;

    const consistency = this.stats?.calculateConsistency?.() ?? 100;

    let correctChars = 0;
    let incorrectChars = 0;
    let extraChars = 0;
    let missedChars = 0;

    for (let wi = 0; wi < this.words.length; wi++) {
      const transformed = this._transformWord(this.words[wi]);
      const typed = this.typed[wi] || '';
      const isCurrent = wi === this.wordIndex && !this.isFinished;
      if (isCurrent) continue;

      for (let li = 0; li < typed.length; li++) {
        if (li >= transformed.length) extraChars++;
        else if (typed[li] === transformed[li]) correctChars++;
        else incorrectChars++;
      }

      if (typed.length < transformed.length && (wi < this.wordIndex || this.isFinished)) {
        missedChars += transformed.length - typed.length;
      }
    }

    const chartData = this.stats?.getChartData?.() || [];
    const isPB = this.stats?.isPersonalBest?.(wpm) ?? false;

    return {
      wpm,
      raw,
      acc,
      consistency,
      time: this.elapsed,
      chars: {
        correct: correctChars,
        incorrect: incorrectChars,
        extra: extraChars,
        missed: missedChars,
      },
      totalKeystrokes: this.totalKeystrokes,
      correctKeystrokes: this.correctKeystrokes,
      incorrectKeystrokes: this.incorrectKeystrokes,
      extraKeystrokes: this.extraKeystrokes,
      missedKeystrokes: this.missedKeystrokes,
      mode: this.state.mode,
      timeLimit: this.state.timeLimit,
      wordLimit: this.state.wordLimit,
      quoteLength: this.state.quoteLength,
      difficulty: this.settings.difficulty,
      chartData,
      isPB,
      bestStreak: this.bestStreak,
      replayLog: this.replayLog,
      timestamp: Date.now(),
    };
  }

  // ============================================================
  // TICK LOOP
  // ============================================================

  _startTick() {
    this._stopTick();
    this.tickInterval = setInterval(this._handleTick, 100);
  }

  _stopTick() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  _handleTick() {
    if (!this.isActive || this.isFinished) return;

    const now = performance.now();
    this.elapsed = (now - this.startTime) / 1000;

    this._updateLiveStats();

    // Per-second sample
    const secondsMark = Math.floor(this.elapsed);
    const lastSecond = this.stats?.lastSecond ?? -1;
    if (secondsMark > lastSecond) {
      this.stats?.recordSecond?.({
        time: secondsMark,
        wpm: this._currentWpm(),
        raw: this._currentRawWpm(),
        acc: this._currentAcc(),
        errors: this.incorrectKeystrokes,
      });
    }

    if (this.onTick) {
      this.onTick({
        time: this.elapsed,
        wpm: this._currentWpm(),
        acc: this._currentAcc(),
      });
    }

    // Time mode: check limit
    if (this.state.mode === 'time' && this.elapsed >= this.state.timeLimit) {
      this._finish();
    }
  }

  // ============================================================
  // LIVE STATS
  // ============================================================

  _updateLiveStats(force = false) {
    const seconds = this.elapsed || (this.isActive ? (performance.now() - this.startTime) / 1000 : 0);
    const displayTime = Math.max(
      0,
      this.state.mode === 'time' ? this.state.timeLimit - seconds : seconds
    );

    this._setStat('liveTime', Math.floor(displayTime), force);
    this._setStat('liveWpm', this._currentWpm(), force);
    this._setStat('liveAcc', this._currentAcc(), force, '%');
  }

  _setStat(id, value, force, suffix = '') {
    const el = this.dom[id];
    if (!el) return;
    if (!this.isActive && !this.isFinished && !force) return;
    el.classList.remove('skeleton');
    el.textContent = `${value}${suffix}`;
  }

  _currentWpm() {
    if (!this.isActive && !this.isFinished) return 0;
    const minutes = Math.max(this.elapsed / 60, 1 / 60);
    return Math.round((this.correctKeystrokes / 5) / minutes);
  }

  _currentRawWpm() {
    if (!this.isActive && !this.isFinished) return 0;
    const minutes = Math.max(this.elapsed / 60, 1 / 60);
    return Math.round(
      ((this.correctKeystrokes + this.incorrectKeystrokes + this.extraKeystrokes) / 5) / minutes
    );
  }

  _currentAcc() {
    const total = this.correctKeystrokes + this.incorrectKeystrokes;
    if (total === 0) return 100;
    return Math.round((this.correctKeystrokes / total) * 100);
  }

  // ============================================================
  // VISUAL FEEDBACK
  // ============================================================

  _pulseLetter() {
    const wordEl = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    if (!wordEl) return;
    const letterEl = wordEl.querySelector(`.letter[data-letter-index="${this.letterIndex - 1}"]`);
    if (!letterEl) return;
    letterEl.classList.add('pressed');
    setTimeout(() => letterEl.classList.remove('pressed'), 100);
  }

  _markLetterIncorrect() {
    const wordEl = this.dom.words?.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    if (!wordEl) return;
    const letterEl = wordEl.querySelector(`.letter[data-letter-index="${this.letterIndex}"]`);
    if (letterEl) letterEl.classList.add('incorrect');
  }

  _flashError() {
    const el = this.dom.container;
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 200);
  }

  _comboPop() {
    const el = this.dom.words;
    if (!el) return;
    el.classList.add('combo-pulse');
    setTimeout(() => el.classList.remove('combo-pulse'), 320);
  }

  _resetStreak() {
    this.currentStreak = 0;
  }

  // ============================================================
  // IDLE CARET
  // ============================================================

  _scheduleIdle() {
    this._clearIdle();
    this.idleTimer = setTimeout(() => {
      this.dom.caret?.classList.add('idle');
    }, 1500);
  }

  _clearIdle() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.dom.caret?.classList.remove('idle');
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _isModalOpen() {
    return (
      !document.getElementById('commandOverlay')?.hasAttribute('hidden') ||
      !document.getElementById('settingsDrawer')?.hasAttribute('hidden') ||
      !document.getElementById('resultsOverlay')?.hasAttribute('hidden') ||
      !document.getElementById('customTextOverlay')?.hasAttribute('hidden')
    );
  }

  getReplayLog() {
    return this.replayLog.slice();
  }

  isTestActive() {
    return this.isActive;
  }

  isTestFinished() {
    return this.isFinished;
  }
}

export default Engine;
