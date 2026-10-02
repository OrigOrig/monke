/* ============================================================
   TYPE FLOW — commandPalette.js
   Fuzzy-search command palette. Registered commands cover
   modes, times, word counts, difficulties, themes, funbox,
   toggles, and actions.
   ============================================================ */

import { getState, update } from './state.js';
import { CustomTextModes, CustomTextDelimiters } from './customText.js';
import { funboxModes } from './funbox.js';

// ============================================================
// 1. ICONS (inline SVG strings for command categories)
// ============================================================

const ICONS = {
  mode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 7h16M4 12h10M4 17h16"/></svg>',
  quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 17c0-3 2-6 6-7M6 10V7h5v3H6zM14 17c0-3 2-6 6-7M14 10V7h5v3h-5z"/></svg>',
  zen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
  custom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M11 4H4v16h16v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  difficulty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M12 3v18"/></svg>',
  funbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M9 15s1 1 3 1 3-1 3-1"/></svg>',
  toggle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>',
  action: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>',
  navigate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
};

// ============================================================
// 2. COMMAND PALETTE CLASS
// ============================================================

export class CommandPalette {
  constructor({ container, input, list, state, update, engine, themes, funbox, router }) {
    this.container = container;
    this.input = input;
    this.list = list;
    this.state = state;
    this.update = update || (() => {});
    this.engine = engine;
    this.themes = themes;
    this.funbox = funbox;
    this.router = router;

    this.commands = [];
    this.filtered = [];
    this.selectedIndex = 0;
    this.isOpen = false;

    this._boundHandleKeyDown = this._handleKeyDown.bind(this);
    this._boundHandleInput = this._handleInput.bind(this);

    this._registerCommands();
  }

  // ============================================================
  // 3. OPEN / CLOSE
  // ============================================================

  open() {
    if (this.isOpen) return;
    this.isOpen = true;

    this.container.removeAttribute('hidden');
    this.input.value = '';
    this.selectedIndex = 0;

    // Refresh commands (state may have changed)
    this._refreshActiveIndicators();

    this.render('');
    this.input.focus();

    this.input.addEventListener('input', this._boundHandleInput);
    this.input.addEventListener('keydown', this._boundHandleKeyDown);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.container.setAttribute('hidden', '');
    this.input.blur();

    this.input.removeEventListener('input', this._boundHandleInput);
    this.input.removeEventListener('keydown', this._boundHandleKeyDown);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // ============================================================
  // 4. INPUT HANDLING
  // ============================================================

  _handleInput(e) {
    this.render(e.target.value);
  }

  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._moveSelection(-1);
        break;
      case 'Enter':
        e.preventDefault();
        this._executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'Home':
        e.preventDefault();
        this.selectedIndex = 0;
        this._renderSelection();
        break;
      case 'End':
        e.preventDefault();
        this.selectedIndex = this.filtered.length - 1;
        this._renderSelection();
        break;
    }
  }

  _moveSelection(delta) {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length;
    this._renderSelection();
    this._scrollSelectedIntoView();
  }

  _scrollSelectedIntoView() {
    const el = this.list.querySelector('.command-item.selected');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  // ============================================================
  // 5. RENDER
  // ============================================================

  render(query) {
    const q = String(query || '').trim();
    this.filtered = this._filter(q);
    this.selectedIndex = 0;

    this.list.innerHTML = '';

    if (this.filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-item';
      empty.style.justifyContent = 'center';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = q ? `no commands match "${q}"` : 'type to search commands';
      this.list.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    this.filtered.forEach((cmd, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'command-item';
      if (i === this.selectedIndex) item.classList.add('selected');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', i === this.selectedIndex ? 'true' : 'false');
      item.dataset.index = i;

      const label = document.createElement('span');
      label.className = 'command-item__label';

      const icon = document.createElement('span');
      icon.className = 'command-item__icon';
      icon.innerHTML = ICONS[cmd.category] || ICONS.action;
      label.appendChild(icon);

      const text = document.createElement('span');
      text.innerHTML = this._highlightMatch(cmd.label, q);
      label.appendChild(text);

      if (cmd.active) {
        const check = document.createElement('span');
        check.className = 'command-item__check';
        check.textContent = '✓';
        check.style.color = 'var(--accent)';
        check.style.marginLeft = 'var(--space-xs)';
        label.appendChild(check);
      }

      item.appendChild(label);

      const category = document.createElement('span');
      category.className = 'command-item__category';
      category.textContent = cmd.category;
      item.appendChild(category);

      item.addEventListener('click', () => {
        this.selectedIndex = i;
        this._executeSelected();
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this._renderSelection();
      });

      frag.appendChild(item);
    });

    this.list.appendChild(frag);
  }

  _renderSelection() {
    const items = this.list.querySelectorAll('.command-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIndex);
      el.setAttribute('aria-selected', i === this.selectedIndex ? 'true' : 'false');
    });
  }

  /**
   * Highlights matched characters with <mark>.
   */
  _highlightMatch(label, query) {
    if (!query) return this._escapeHTML(label);
    const lower = label.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return this._escapeHTML(label);

    const before = label.slice(0, idx);
    const match = label.slice(idx, idx + q.length);
    const after = label.slice(idx + q.length);
    return `${this._escapeHTML(before)}<mark style="background: var(--accent-dim); color: var(--accent); border-radius: 2px; padding: 0 2px;">${this._escapeHTML(match)}</mark>${this._escapeHTML(after)}`;
  }

  _escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================
  // 6. FILTERING (fuzzy)
  // ============================================================

  _filter(query) {
    if (!query) return this.commands.slice();

    const scored = [];
    const q = query.toLowerCase();

    for (const cmd of this.commands) {
      const score = this._fuzzyScore(cmd.label.toLowerCase(), q);
      if (score > 0) scored.push({ cmd, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.cmd);
  }

  /**
   * Simple subsequence fuzzy scoring.
   * Higher = better. 0 = no match.
   */
  _fuzzyScore(text, query) {
    if (query.length === 0) return 1;
    if (query.length > text.length) return 0;

    let score = 0;
    let tIdx = 0;
    let qIdx = 0;
    let consecutive = 0;

    while (tIdx < text.length && qIdx < query.length) {
      if (text[tIdx] === query[qIdx]) {
        consecutive++;
        score += 1 + consecutive * 0.5;
        if (tIdx === 0 || text[tIdx - 1] === ' ') score += 2;
        qIdx++;
      } else {
        consecutive = 0;
      }
      tIdx++;
    }

    if (qIdx < query.length) return 0;

    // Bonus for shorter matches (tighter fit)
    score += Math.max(0, 10 - (text.length - query.length) * 0.1);
    return score;
  }

  // ============================================================
  // 7. EXECUTION
  // ============================================================

  _executeSelected() {
    const cmd = this.filtered[this.selectedIndex];
    if (!cmd) return;

    try {
      cmd.action();
    } catch (err) {
      console.error('[commandPalette] action failed:', err);
    }

    // Close unless the command opted to stay open
    if (!cmd.keepOpen) this.close();
  }

  // ============================================================
  // 8. COMMAND REGISTRATION
  // ============================================================

  _registerCommands() {
    const cmds = [];

    // ---------- Modes ----------
    const modes = [
      { id: 'time', label: 'Mode: time', icon: 'time' },
      { id: 'words', label: 'Mode: words', icon: 'words' },
      { id: 'quote', label: 'Mode: quote', icon: 'quote' },
      { id: 'zen', label: 'Mode: zen', icon: 'zen' },
      { id: 'custom', label: 'Mode: custom', icon: 'custom' },
    ];
    for (const m of modes) {
      cmds.push({
        id: `mode-${m.id}`,
        label: m.label,
        category: 'mode',
        get active() { return getState().mode === m.id; },
        action: () => {
          update('mode', m.id);
          this.engine?.restart({ reroll: true });
        },
      });
    }

    // ---------- Time limits ----------
    for (const t of [15, 30, 60, 120]) {
      cmds.push({
        id: `time-${t}`,
        label: `Time: ${t}s`,
        category: 'time',
        get active() { return getState().mode === 'time' && getState().timeLimit === t; },
        action: () => {
          update('mode', 'time');
          update('timeLimit', t);
          this.engine?.restart({ reroll: true });
        },
      });
    }

    // ---------- Word counts ----------
    for (const w of [10, 25, 50, 100]) {
      cmds.push({
        id: `words-${w}`,
        label: `Words: ${w}`,
        category: 'words',
        get active() { return getState().mode === 'words' && getState().wordLimit === w; },
        action: () => {
          update('mode', 'words');
          update('wordLimit', w);
          this.engine?.restart({ reroll: true });
        },
      });
    }

    // ---------- Quote lengths ----------
    for (const q of ['short', 'medium', 'long', 'thicc']) {
      cmds.push({
        id: `quote-${q}`,
        label: `Quote: ${q}`,
        category: 'quote',
        get active() { return getState().mode === 'quote' && getState().quoteLength === q; },
        action: () => {
          update('mode', 'quote');
          update('quoteLength', q);
          this.engine?.restart({ reroll: true });
        },
      });
    }

    // ---------- Difficulties ----------
    for (const d of ['normal', 'expert', 'master']) {
      cmds.push({
        id: `difficulty-${d}`,
        label: `Difficulty: ${d}`,
        category: 'difficulty',
        get active() { return getState().difficulty === d; },
        action: () => {
          update('difficulty', d);
          this.engine?.setDifficulty(d);
          this.engine?.restart();
        },
      });
    }

    // ---------- Toggles ----------
    const toggles = [
      { key: 'punctuation', label: 'Toggle Punctuation' },
      { key: 'numbers', label: 'Toggle Numbers' },
      { key: 'blindMode', label: 'Toggle Blind Mode' },
      { key: 'freedomMode', label: 'Toggle Freedom Mode' },
      { key: 'soundEnabled', label: 'Toggle Sound' },
      { key: 'scanlines', label: 'Toggle Scanlines' },
      { key: 'reduceMotion', label: 'Toggle Reduce Motion' },
    ];
    for (const t of toggles) {
      cmds.push({
        id: `toggle-${t.key}`,
        label: t.label,
        category: 'toggle',
        get active() { return !!getState()[t.key]; },
        action: () => {
          const next = !getState()[t.key];
          update(t.key, next);
          // Side effects
          if (t.key === 'blindMode') this.engine?.setBlindMode(next);
          if (t.key === 'freedomMode') this.engine?.setFreedomMode(next);
          if (t.key === 'soundEnabled') this.engine?.sound?.setEnabled?.(next);
          if (t.key === 'scanlines') {
            document.getElementById('scanlineOverlay')?.classList.toggle('active', next);
          }
          if (t.key === 'reduceMotion') {
            document.documentElement.setAttribute('data-reduce-motion', next ? 'true' : 'false');
          }
        },
        keepOpen: true,
      });
    }

    // ---------- Stop on error ----------
    for (const mode of ['off', 'letter', 'word']) {
      cmds.push({
        id: `stopOnError-${mode}`,
        label: `Stop on Error: ${mode}`,
        category: 'difficulty',
        get active() { return getState().stopOnError === mode; },
        action: () => {
          update('stopOnError', mode);
          this.engine?.setStopOnError(mode);
        },
      });
    }

    // ---------- Caret styles ----------
    for (const style of ['line', 'smooth', 'block', 'underline', 'off']) {
      cmds.push({
        id: `caret-${style}`,
        label: `Caret: ${style}`,
        category: 'toggle',
        get active() { return getState().caretStyle === style; },
        action: () => {
          update('caretStyle', style);
          this.engine?.setCaretStyle(style);
          document.documentElement.setAttribute('data-caret-style', style);
        },
      });
    }

    // ---------- Funbox ----------
    if (funboxModes) {
      for (const [id, meta] of Object.entries(funboxModes)) {
        cmds.push({
          id: `funbox-${id}`,
          label: `Funbox: ${meta.name}`,
          category: 'funbox',
          get active() { return getState().funbox === id; },
          action: () => {
            update('funbox', id);
            this.funbox?.setMode(id);
            this.engine?.setTransform(this.funbox?.getTransform?.() || null);
            this.engine?.restart({ reroll: false });
          },
        });
      }
    }

    // ---------- Themes ----------
    if (this.themes?.getAll) {
      for (const theme of this.themes.getAll()) {
        cmds.push({
          id: `theme-${theme.id}`,
          label: `Theme: ${theme.name}`,
          category: 'theme',
          get active() { return getState().theme === theme.id; },
          action: () => {
            this.themes.setTheme(theme.id);
          },
          keepOpen: true,
        });
      }
    }

    // ---------- Actions ----------
    cmds.push(
      {
        id: 'action-restart',
        label: 'Restart Test',
        category: 'action',
        action: () => this.engine?.restart(),
      },
      {
        id: 'action-next',
        label: 'Next Test (reroll words)',
        category: 'action',
        action: () => this.engine?.restart({ reroll: true }),
      },
      {
        id: 'action-open-custom',
        label: 'Open Custom Text',
        category: 'action',
        action: () => {
          document.getElementById('customTextOverlay')?.removeAttribute('hidden');
        },
      },
      {
        id: 'action-open-settings',
        label: 'Open Settings',
        category: 'action',
        action: () => {
          document.getElementById('settingsBtn')?.click();
        },
      },
      {
        id: 'action-export-theme',
        label: 'Export Current Theme (JSON)',
        category: 'action',
        action: () => this._exportTheme(),
      },
      {
        id: 'action-close',
        label: 'Close Command Palette',
        category: 'action',
        action: () => this.close(),
      }
    );

    // ---------- Navigation ----------
    const routes = [
      { id: 'test', label: 'Go to: Test' },
      { id: 'leaderboard', label: 'Go to: Leaderboard' },
      { id: 'stats', label: 'Go to: Stats' },
      { id: 'about', label: 'Go to: About' },
    ];
    for (const r of routes) {
      cmds.push({
        id: `nav-${r.id}`,
        label: r.label,
        category: 'navigate',
        get active() { return getState().currentPage === r.id; },
        action: () => {
          this.router?.navigate?.(r.id);
        },
      });
    }

    this.commands = cmds;
  }

  /**
   * Re-evaluate `active` getters on every command. Called on
   * open so the checkmarks reflect current state.
   */
  _refreshActiveIndicators() {
    // Active getters are evaluated at render time, so nothing to do.
    // This method exists as a hook for future caching optimizations.
  }

  // ============================================================
  // 9. BUILT-IN ACTIONS
  // ============================================================

  _exportTheme() {
    try {
      const json = this.themes?.exportTheme?.();
      if (!json) return;
      navigator.clipboard?.writeText?.(json).then(
        () => this._toast('Theme JSON copied to clipboard', 'success'),
        () => this._toast('Clipboard write failed', 'error')
      );
    } catch (err) {
      console.error('[commandPalette] export failed:', err);
    }
  }

  _toast(message, variant = 'info') {
    // Best-effort toast hook — the main app may or may not
    // expose a toast helper. We degrade gracefully.
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${variant}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 3000);
    setTimeout(() => el.remove(), 3400);
  }

  // ============================================================
  // 10. PUBLIC API
  // ============================================================

  /**
   * Register a command dynamically.
   */
  register(command) {
    if (!command || !command.id || !command.label || typeof command.action !== 'function') {
      console.warn('[commandPalette] invalid command shape:', command);
      return;
    }
    this.commands.push(command);
  }

  /**
   * Remove a command by id.
   */
  unregister(id) {
    const idx = this.commands.findIndex((c) => c.id === id);
    if (idx >= 0) this.commands.splice(idx, 1);
  }
}

export default CommandPalette;
