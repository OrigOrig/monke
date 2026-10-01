/* ============================================================
   TYPE FLOW — engine.js
   The typing engine. Handles keystroke capture, word/letter
   state, caret positioning, mode rules, difficulty,
   live stats, and replay logging.
   ============================================================ */

import { update, getState, incrementTestsStarted } from './state.js';
import { WORDS_ENGLISH, WORDS_ENGLISH_1K, WORDS_CODE } from './data/words.js';
import { QUOTES } from './data/quotes.js';

// ============================================================
// 1. CONSTANTS
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

// ============================================================
// 2. ENGINE CLASS
// ============================================================

export class Engine {
  constructor({ state, update, stats, sound, onFinish, onTick }) {
    this.state = state;
    this.update = update;
    this.stats = stats;
    this.sound = sound;
    this.onFinish = onFinish;
    this.onTick = onTick;

    // DOM refs (resolved on init)
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

    // Runtime state
    this.words = [];           // Array of word strings
    this.typed = [];           // Array of typed strings (parallel to words)
    this.wordIndex = 0;        // Current word index
    this.letterIndex = 0;      // Current letter index within word
    this.wordsPerLine = [];    // Cache for caret line logic

    // Timing
    this.startTime = 0;
    this.endTime = 0;
    this.lastTickAt = 0;
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

    // Funbox transform (set externally)
    this.transform = null;

    // Bound handlers
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleFocus = this._handleFocus.bind(this);
    this._handleBlur = this._handleBlur.bind(this);
    this._handleMobileInput = this._handleMobileInput.bind(this);
    this._handleOverlayClick = this._handleOverlayClick.bind(this);
    this._handleTick = this._handleTick.bind(this);
  }

  // ============================================================
  // INIT + DOM BINDING
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
    this.dom.typingWrap = this.dom.container.closest('.typing-wrap');

    if (!this.dom.container || !this.dom.words) {
      console.warn('[engine] critical DOM elements not found');
      return;
    }

    // Attach listeners
    document.addEventListener('keydown', this._handleKeyDown);
    this.dom.container.addEventListener('focus', this._handleFocus);
    this.dom.container.addEventListener('blur', this._handleBlur);
    this.dom.focusOverlay.addEventListener('click', this._handleOverlayClick);
    this.dom.mobileInput.addEventListener('input', this._handleMobileInput);

    // Caret style from state
    this.setCaretStyle(getState().caretStyle || 'line');
    this.setCaretBlink(getState().caretBlink !== false);

    // Generate first test
    this.restart();

    // Focus by default
    this.focus();
  }

  // ============================================================
  // FOCUS MANAGEMENT
  // ============================================================

  focus() {
    if (!this.dom.container) return;
    this.dom.container.focus({ preventScroll: true });
    this.dom.mobileInput.focus({ preventScroll: true });
  }

  blur() {
    if (!this.dom.container) return;
    this.dom.container.blur();
    this.dom.mobileInput.blur();
  }

  _handleFocus() {
    this.isFocused = true;
    this.dom.focusOverlay.classList.add('hidden');
    this._scheduleIdle();
  }

  _handleBlur() {
    this.isFocused = false;
    if (!this.isFinished && !this.isActive) {
      this.dom.focusOverlay.classList.remove('hidden');
    }
  }

  _handleOverlayClick() {
    this.focus();
  }

  // ============================================================
  // RESTART / RESET
  // ============================================================

  restart({ reroll = true } = {}) {
    // Stop timers
    this._stopTick();
    this._clearIdle();

    // Reset counters
    this.startTime = 0;
    this.endTime = 0;
    this.elapsed = 0;
    this.lastTickAt = 0;
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

    // Generate words
    if (reroll || this.words.length === 0) {
      this.words = this._generateWords();
    }

    // Render
    this._renderWords();
    this._applyTypedState();
    this._updateCaret();
    this._updateLiveStats(true);

    // Show focus overlay if not focused
    if (!this.isFocused) {
      this.dom.focusOverlay.classList.remove('hidden');
    }

    // Emit
    update('isTyping', false);
    update('isFinished', false);
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
      const set = QUOTES[s.quoteLength || 'medium'] || QUOTES.medium;
      const quote = set[Math.floor(Math.random() * set.length)];
      this.currentQuote = quote;
      return quote.text.split(/\s+/).filter(Boolean);
    }

    // Time or words mode — sample from word list
    const wordList = s.language === 'code'
      ? WORDS_CODE
      : s.language === 'english1k'
        ? WORDS_ENGLISH_1K
        : WORDS_ENGLISH;

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
    // Roughly: 60s ≈ 120 words at 100wpm. Add generous buffer.
    const seconds = this.state.timeLimit || 30;
    return Math.max(50, Math.ceil((seconds / 60) * 220));
  }

  _applyModifiers(word) {
    const s = this.state;
    let out = word;

    if (s.punctuation) {
      // Capitalize first letter sometimes
      if (Math.random() < 0.18) {
        out = out.charAt(0).toUpperCase() + out.slice(1);
      }
      // Add trailing punctuation sometimes
      if (Math.random() < 0.25) {
        out += PUNCTUATION[Math.floor(Math.random() * PUNCTUATION.length)];
      }
    }

    if (s.numbers && Math.random() < 0.14) {
      const num = NUMBERS[Math.floor(Math.random() * NUMBERS.length)];
      // Prepend or append
      out = Math.random() < 0.5 ? num + out : out + num;
    }

    return out;
  }

  _parseCustomText(text, options = {}) {
    const { mode = 'simple', delimiter = 'pipe' } = options;
    const clean = this._normalizeText(text);
    const delimiterChar = delimiter === 'pipe' ? '|' : ' ';
    const tokens = clean.split(new RegExp(`\\s*${delimiterChar === '|' ? '\\|' : '\\s'}\\s*`)).filter(Boolean);

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
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
      .replace(/[\u2018\u2019]/g, "'")        // smart quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013|\u2014/g, '-')         // en/em dash
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
  }

  _transformWord(word) {
    if (!this.transform) return word;
    return this.transform(word);
  }

  _applyTypedState() {
    const wordEls = this.dom.words.querySelectorAll('.word');

    wordEls.forEach((wordEl, wi) => {
      const originalWord = this.words[wi];
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

      // Extra typed beyond word length
      const extraCount = Math.max(0, typedWord.length - transformedWord.length);
      if (extraCount > 0) {
        const existingExtras = wordEl.querySelectorAll('.letter.extra');
        // Remove any existing extras we appended previously
        existingExtras.forEach((el) => el.remove());
        for (let i = 0; i < extraCount; i++) {
          const ch = typedWord[transformedWord.length + i];
          const extra = document.createElement('span');
          extra.className = 'letter extra';
          extra.textContent = ch;
          wordEl.appendChild(extra);
        }
      }

      // Missed letters (previous words left incomplete)
      if (wi < this.wordIndex && typedWord.length < transformedWord.length) {
        for (let li = typedWord.length; li < transformedWord.length; li++) {
          const el = letters[li];
          if (el) el.classList.add('missed');
        }
      }

      // Active class
      wordEl.classList.toggle('active', wi === this.wordIndex);
    });
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

    const activeWord = this.dom.words.querySelector('.word.active');
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
      const rect = activeWord.getBoundingClientRect();
      left = rect.left - containerRect.left;
      top = rect.top - containerRect.top;
      height = rect.height;
    } else if (li < letters.length) {
      const rect = letters[li].getBoundingClientRect();
      left = rect.left - containerRect.left;
      top = rect.top - containerRect.top;
      height = rect.height;
    } else {
      const last = letters[letters.length - 1].getBoundingClientRect();
      left = last.right - containerRect.left;
      top = last.top - containerRect.top;
      height = last.height;
    }

    caret.style.left = `${left}px`;
    caret.style.top = `${top}px`;
    caret.style.height = `${height}px`;

    // Caret style classes
    caret.className = 'caret';
    if (this.settings.caretStyle === 'smooth') caret.classList.add('smooth');
    if (this.settings.caretStyle === 'block') caret.classList.add('block');
    if (this.settings.caretStyle === 'underline') caret.classList.add('underline');
    if (this.settings.caretBlink) caret.classList.add('blink');
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
  // KEYBOARD INPUT
  // ============================================================

  _handleKeyDown(e) {
    // Skip if modal open
    if (this._isModalOpen()) return;
    if (!this.isFocused) {
      // Auto-focus on typing
      if (e.key.length === 1 || e.key === 'Backspace') {
        this.focus();
      }
      return;
    }

    // Ignore modifier-only
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

    // Zen mode: Shift+Enter finishes
    if (this.state.mode === 'zen' && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      this._finish();
      return;
    }

    // Auto start on first keypress
    if (!this.isActive && !this.isFinished) {
      this._start();
    }

    if (this.isFinished) return;

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

    // Printable characters (single char)
    if (e.key.length === 1) {
      // Respect Ctrl/Meta for shortcuts
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      this._handleChar(e.key);
    }
  }

  _handleMobileInput(e) {
    const val = e.target.value;
    if (!val) return;
    e.target.value = '';

    if (!this.isActive && !this.isFinished) this._start();
    if (this.isFinished) return;

    for (const ch of val) {
      if (ch === ' ') this._handleSpace();
      else if (ch === '\b' || ch === '\u007F') this._handleBackspace(false);
      else this._handleChar(ch);
    }
  }

  // ============================================================
  // CHAR / SPACE / BACKSPACE HANDLERS
  // ============================================================

  _handleChar(char) {
    const currentWord = this.words[this.wordIndex];
    if (currentWord === undefined && this.state.mode !== 'zen') return;

    const transformedWord = this._transformWord(currentWord || '');
    const expected = transformedWord[this.letterIndex];
    const isCorrect = char === expected;

    // Log replay
    this.replayLog.push({
      t: Math.round(performance.now() - this.startTime),
      c: char,
      e: expected,
      ok: isCorrect,
      w: this.wordIndex,
      l: this.letterIndex,
    });

    // Play sound
    this.sound?.play?.(isCorrect ? 'key' : 'error');

    // MASTER: fail on first wrong key
    if (this.settings.difficulty === DIFFICULTY.MASTER && !isCorrect) {
      this._flashError();
      this._finish();
      return;
    }

    this.totalKeystrokes++;

    // STOP ON ERROR: letter
    if (this.settings.stopOnError === STOP_ON_ERROR.LETTER && !isCorrect) {
      this.incorrectKeystrokes++;
      this._flashError();
      this._markLetterIncorrect();
      this._resetStreak();
      return;
    }

    // Append typed char
    if (!this.typed[this.wordIndex]) this.typed[this.wordIndex] = '';
    this.typed[this.wordIndex] += char;

    if (isCorrect) {
      this.correctKeystrokes++;
      this._pulseLetter();
    } else {
      this.incorrectKeystrokes++;
      this._flashError();
      this._resetStreak();
    }

    // Advance letter
    if (this.letterIndex < transformedWord.length || !isCorrect || this.settings.stopOnError === STOP_ON_ERROR.OFF) {
      this.letterIndex++;
    } else {
      // STOP ON ERROR: word mode allows advancing position but marks word incomplete
      this.letterIndex++;
    }

    // Streak update
    if (isCorrect) {
      this.currentStreak++;
      if (this.currentStreak > this.bestStreak) this.bestStreak = this.currentStreak;
      if (this.currentStreak > 0 && this.currentStreak % 10 === 0) {
        this._comboPop();
      }
    }

    this._applyTypedState();
    this._updateCaret();
    this._updateLiveStats();

    // Auto-complete: if in words mode and last word finished
    if (this.state.mode === 'words' && this.wordIndex === this.words.length - 1) {
      if (this.letterIndex >= transformedWord.length) {
        // Don't auto-finish — user must press space (unless no more words)
        // Actually Monkeytype finishes when the last word is complete
        this._finish();
      }
    }
  }

  _handleSpace() {
    const currentWord = this.words[this.wordIndex];
    if (currentWord === undefined) return;

    const transformedWord = this._transformWord(currentWord);
    const typedWord = this.typed[this.wordIndex] || '';

    // EXPERT: fail if word wrong
    if (this.settings.difficulty === DIFFICULTY.EXPERT && typedWord !== transformedWord) {
      this._flashError();
      this._finish();
      return;
    }

    // STOP ON ERROR: word mode — don't advance if not matching
    if (this.settings.stopOnError === STOP_ON_ERROR.WORD && typedWord !== transformedWord) {
      this._flashError();
      this._resetStreak();
      return;
    }

    // Count missed chars
    if (typedWord.length < transformedWord.length) {
      this.missedKeystrokes += transformedWord.length - typedWord.length;
    }

    // Mark word complete
    const wordEl = this.dom.words.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    if (wordEl) {
      wordEl.classList.add('completed');
      setTimeout(() => wordEl.classList.remove('completed'), 400);
    }

    // Advance word
    this.wordIndex++;
    this.letterIndex = 0;

    // End of words?
    if (this.wordIndex >= this.words.length) {
      this._finish();
      return;
    }

    this._applyTypedState();
    this._updateCaret();
  }

  _handleBackspace(isWordDelete) {
    // Freedom mode: allow backspacing into previous correct words
    const currentWord = this.words[this.wordIndex];
    const transformedWord = this._transformWord(currentWord || '');

    if (this.letterIndex === 0 && this.wordIndex === 0) return;

    if (isWordDelete) {
      // Clear entire current word
      this.typed[this.wordIndex] = '';
      this.letterIndex = 0;
    } else if (this.letterIndex > 0) {
      // Delete one char
      const cur = this.typed[this.wordIndex] || '';
      this.typed[this.wordIndex] = cur.slice(0, -1);
      this.letterIndex--;
    } else {
      // At start of word — jump to previous word
      if (!this.settings.freedomMode) {
        const prevTyped = this.typed[this.wordIndex - 1] || '';
        const prevWord = this._transformWord(this.words[this.wordIndex - 1] || '');
        if (prevTyped === prevWord) return; // Can't go past correct word
      }
      this.wordIndex--;
      const prevTyped = this.typed[this.wordIndex] || '';
      this.letterIndex = prevTyped.length;
    }

    this._applyTypedState();
    this._updateCaret();
  }

  // ============================================================
  // TEST LIFECYCLE
  // ============================================================

  _start() {
    this.isActive = true;
    this.startTime = performance.now();
    this.lastTickAt = this.startTime;

    update('isTyping', true);

    // Track tests started
    try { incrementTestsStarted(); } catch (e) { /* ignore */ }

    // Emit first tick
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

    // Compute final stats
    const stats = this._computeFinalStats();

    // Save + callback
    if (this.onFinish) {
      this.onFinish(stats);
    }
  }

  _computeFinalStats() {
    const minutes = Math.max(this.elapsed / 60, 1 / 60);

    const wpm = Math.round((this.correctKeystrokes / 5) / minutes);
    const raw = Math.round(((this.correctKeystrokes + this.incorrectKeystrokes + this.extraKeystrokes) / 5) / minutes);

    const totalKeystrokes = this.correctKeystrokes + this.incorrectKeystrokes;
    const acc = totalKeystrokes > 0
      ? Math.round((this.correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;

    const consistency = this.stats?.calculateConsistency?.() ?? 100;

    // Character breakdown
    let correctChars = 0;
    let incorrectChars = 0;
    let extraChars = 0;
    let missedChars = 0;

    for (let wi = 0; wi < this.words.length; wi++) {
      const transformed = this._transformWord(this.words[wi]);
      const typed = this.typed[wi] || '';
      const isCurrentWord = wi === this.wordIndex && !this.isFinished;
      if (isCurrentWord) continue;

      for (let li = 0; li < typed.length; li++) {
        if (li >= transformed.length) extraChars++;
        else if (typed[li] === transformed[li]) correctChars++;
        else incorrectChars++;
      }

      if (typed.length < transformed.length) {
        // Missed characters only count if the test has ended or word was submitted
        if (wi < this.wordIndex || this.isFinished) {
          missedChars += transformed.length - typed.length;
        }
      }
    }

    // Chart data — from stats engine's tick history
    const chartData = this.stats?.getChartData?.() || [];

    // PB detection — compare against stored best for this mode
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

    // Update live stats
    this._updateLiveStats();

    // Record per-second data
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

    // Emit tick
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
    const displayTime = Math.max(0, this.state.mode === 'time' ? this.state.timeLimit - seconds : seconds);

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
    const wordEl = this.dom.words.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
    if (!wordEl) return;
    const letterEl = wordEl.querySelector(`.letter[data-letter-index="${this.letterIndex - 1}"]`);
    if (!letterEl) return;
    letterEl.classList.add('pressed');
    setTimeout(() => letterEl.classList.remove('pressed'), 100);
  }

  _markLetterIncorrect() {
    const wordEl = this.dom.words.querySelector(`.word[data-word-index="${this.wordIndex}"]`);
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

  // ============================================================
  // PUBLIC GETTERS
  // ============================================================

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
