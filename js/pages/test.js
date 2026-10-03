/* ============================================================
   TYPE FLOW — pages/test.js
   Test page controller. Results shown in a modal (reverted).
   ============================================================ */

import { getState, update, subscribe } from '../state.js';
import { Practice } from '../practice.js';

// ============================================================
// CONSTANTS
// ============================================================

const SUB_MODE_OPTIONS = {
  time: [15, 30, 60, 120],
  words: [10, 25, 50, 100],
  quote: ['short', 'medium', 'long', 'thicc'],
  zen: [],
  custom: [],
};

// ============================================================
// TEST PAGE CLASS
// ============================================================

export class TestPage {
  constructor({ engine, stats, themes, funbox, customText, screenshot, sound, state, update }) {
    this.engine = engine;
    this.stats = stats;
    this.themes = themes;
    this.funbox = funbox;
    this.customText = customText;
    this.screenshot = screenshot;
    this.sound = sound;
    this.state = state;
    this.update = update;

    this.isMounted = false;
    this.dom = {};
    this._unsubs = [];
    this._lastResult = null;

    this._handleModeClick = this._handleModeClick.bind(this);
    this._handleSubModeClick = this._handleSubModeClick.bind(this);
    this._handleToggleClick = this._handleToggleClick.bind(this);

    this._practice = new Practice({
      getLastResult: () => this._lastResult,
      onStart: (words) => {
        // Load as custom text and start fresh test
        const text = words.join(' ');
        update('mode', 'custom');
        update('customText', {
          text,
          options: { mode: 'simple', delimiter: 'space' },
        });
        this.hideResults();
        setTimeout(() => {
          this.engine.loadCustomText(text, { mode: 'simple', delimiter: 'space' });
        }, 80);
      },
    });
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  mount() {
    if (this.isMounted) return;
    this.isMounted = true;

    this._cacheDOM();
    this._attachListeners();
    this._subscribeToState();
    this._practice.mount();

    this.renderSubModes();
    this.renderToggles();
    this.renderLiveStatsSkeleton();
  }

  destroy() {
    if (!this.isMounted) return;
    this.isMounted = false;

    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];

    this._detachListeners();
  }

  render() {
    this.mount();
    this.updateConfigUI();
  }

  // ============================================================
  // DOM CACHE
  // ============================================================

  _cacheDOM() {
    this.dom.modeGroup = document.getElementById('modeGroup');
    this.dom.subModeGroup = document.getElementById('subModeGroup');
    this.dom.punctuationBtn = document.getElementById('punctuationBtn');
    this.dom.numbersBtn = document.getElementById('numbersBtn');
    this.dom.liveTime = document.getElementById('liveTime');
    this.dom.liveWpm = document.getElementById('liveWpm');
    this.dom.liveAcc = document.getElementById('liveAcc');

    // Results modal
    this.dom.resultsOverlay = document.getElementById('resultsOverlay');
    this.dom.resultWpm = document.getElementById('resultWpm');
    this.dom.resultAcc = document.getElementById('resultAcc');
    this.dom.resultRaw = document.getElementById('resultRaw');
    this.dom.resultConsistency = document.getElementById('resultConsistency');
    this.dom.resultChars = document.getElementById('resultChars');
    this.dom.resultTime = document.getElementById('resultTime');
    this.dom.wpmChart = document.getElementById('wpmChart');
    this.dom.closeResultsBtn = document.getElementById('closeResultsBtn');
    this.dom.restartBtn = document.getElementById('resultRestartBtn');
    this.dom.nextTestBtn = document.getElementById('resultNextBtn');
    this.dom.repeatBtn = document.getElementById('resultRepeatBtn');
    this.dom.practiceBtn = document.getElementById('resultPracticeBtn');
    this.dom.screenshotBtn = document.getElementById('resultScreenshotBtn');
  }

  // ============================================================
  // LISTENERS
  // ============================================================

  _attachListeners() {
    this.dom.modeGroup?.addEventListener('click', this._handleModeClick);
    this.dom.subModeGroup?.addEventListener('click', this._handleSubModeClick);
    this.dom.punctuationBtn?.addEventListener('click', this._handleToggleClick);
    this.dom.numbersBtn?.addEventListener('click', this._handleToggleClick);

    this.dom.closeResultsBtn?.addEventListener('click', () => this.hideResults());

    this.dom.restartBtn?.addEventListener('click', () => {
      this.hideResults();
      this.engine.restart({ reroll: false });
    });

    this.dom.nextTestBtn?.addEventListener('click', () => {
      this.hideResults();
      this.engine.restart({ reroll: true });
    });

    this.dom.repeatBtn?.addEventListener('click', () => {
      this.hideResults();
      this.engine.restart({ reroll: false });
    });

    this.dom.practiceBtn?.addEventListener('click', () => {
      this._practice.open();
    });

    this.dom.screenshotBtn?.addEventListener('click', async () => {
      if (!this._lastResult || !this.screenshot) return;
      const blob = await this.screenshot.captureResults(this._lastResult);
      if (blob) {
        const copied = await this.screenshot.copyToClipboard(blob);
        this._flashButton(this.dom.screenshotBtn, copied ? 'copied!' : 'downloaded');
      }
    });

    // Click backdrop to close
    this.dom.resultsOverlay?.addEventListener('click', (e) => {
      if (e.target === this.dom.resultsOverlay) this.hideResults();
    });
  }

  _detachListeners() {
    this.dom.modeGroup?.removeEventListener('click', this._handleModeClick);
    this.dom.subModeGroup?.removeEventListener('click', this._handleSubModeClick);
    this.dom.punctuationBtn?.removeEventListener('click', this._handleToggleClick);
    this.dom.numbersBtn?.removeEventListener('click', this._handleToggleClick);
  }

  // ============================================================
  // STATE SUBSCRIPTIONS
  // ============================================================

  _subscribeToState() {
    this._unsubs.push(
      subscribe('change:mode', () => {
        this.renderSubModes();
        this.updateModeButtons();
      })
    );

    this._unsubs.push(
      subscribe('change:timeLimit', () => this.updateSubModeActive()),
      subscribe('change:wordLimit', () => this.updateSubModeActive()),
      subscribe('change:quoteLength', () => this.updateSubModeActive())
    );

    this._unsubs.push(
      subscribe('change:punctuation', () => this.renderToggles()),
      subscribe('change:numbers', () => this.renderToggles())
    );

    this._unsubs.push(
      subscribe('change:isTyping', ({ value }) => {
        if (value) {
          this._markStatsLive();
          this._lockConfig(true);
        } else {
          this._lockConfig(false);
        }
      })
    );

    this._unsubs.push(
      subscribe('change:isFinished', ({ value }) => {
        if (value) this._lockConfig(false);
      })
    );
  }

  // ============================================================
  // MODE BUTTONS
  // ============================================================

  _handleModeClick(e) {
    // Lock during an active test
    if (this.engine.isTestActive() && !this.engine.isTestFinished()) return;

    const btn = e.target.closest('.config-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (!mode) return;

    update('mode', mode);
    this.engine.restart({ reroll: true });
    this.updateModeButtons();
    this.renderSubModes();
    this._pulseButton(btn);
  }

  updateModeButtons() {
    const currentMode = getState().mode;
    this.dom.modeGroup?.querySelectorAll('.config-btn').forEach((btn) => {
      const isActive = btn.dataset.mode === currentMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  // ============================================================
  // SUB-MODE BUTTONS
  // ============================================================

  renderSubModes() {
    const group = this.dom.subModeGroup;
    if (!group) return;

    const mode = getState().mode;
    const options = SUB_MODE_OPTIONS[mode] || [];

    group.innerHTML = '';

    if (options.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'config-btn';
      hint.style.cursor = 'default';
      hint.style.opacity = '0.6';
      hint.textContent = mode === 'zen' ? 'unlimited' : 'paste your own text';
      group.appendChild(hint);
      return;
    }

    const activeValue = this._getActiveSubModeValue(mode);

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'config-btn';
      btn.dataset.submode = String(opt);
      btn.textContent = typeof opt === 'number' ? String(opt) : opt;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', opt === activeValue ? 'true' : 'false');
      if (opt === activeValue) btn.classList.add('active');
      group.appendChild(btn);
    }
  }

  _getActiveSubModeValue(mode) {
    const s = getState();
    switch (mode) {
      case 'time': return s.timeLimit;
      case 'words': return s.wordLimit;
      case 'quote': return s.quoteLength;
      default: return null;
    }
  }

  _handleSubModeClick(e) {
    // Lock during an active test
    if (this.engine.isTestActive() && !this.engine.isTestFinished()) return;

    const btn = e.target.closest('.config-btn');
    if (!btn) return;
    const value = btn.dataset.submode;
    if (!value) return;

    const mode = getState().mode;

    if (mode === 'time') {
      const t = parseInt(value, 10);
      if (!isNaN(t)) {
        update('timeLimit', t);
        this._pulseButton(btn);
      }
    } else if (mode === 'words') {
      const w = parseInt(value, 10);
      if (!isNaN(w)) {
        update('wordLimit', w);
        this._pulseButton(btn);
      }
    } else if (mode === 'quote') {
      update('quoteLength', value);
      this._pulseButton(btn);
    }

    this.updateSubModeActive();
    this.engine.restart({ reroll: true });
  }

  updateSubModeActive() {
    const group = this.dom.subModeGroup;
    if (!group) return;
    const mode = getState().mode;
    const active = this._getActiveSubModeValue(mode);

    group.querySelectorAll('.config-btn').forEach((btn) => {
      const isActive = btn.dataset.submode === String(active);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  // ============================================================
  // TOGGLES
  // ============================================================

  _handleToggleClick(e) {
    // Lock during an active test
    if (this.engine.isTestActive() && !this.engine.isTestFinished()) return;

    const btn = e.currentTarget;
    const key = btn.dataset.toggle;
    if (!key) return;

    const next = !getState()[key];
    update(key, next);

    btn.classList.toggle('active', next);
    btn.setAttribute('aria-pressed', next ? 'true' : 'false');
    this._pulseButton(btn);

    this.engine.restart({ reroll: true });
  }

  renderToggles() {
    const s = getState();
    if (this.dom.punctuationBtn) {
      this.dom.punctuationBtn.classList.toggle('active', !!s.punctuation);
      this.dom.punctuationBtn.setAttribute('aria-pressed', s.punctuation ? 'true' : 'false');
    }
    if (this.dom.numbersBtn) {
      this.dom.numbersBtn.classList.toggle('active', !!s.numbers);
      this.dom.numbersBtn.setAttribute('aria-pressed', s.numbers ? 'true' : 'false');
    }
  }

  // ============================================================
  // CONFIG UI SYNC
  // ============================================================

  updateConfigUI() {
    this.updateModeButtons();
    this.updateSubModeActive();
    this.renderToggles();
  }

  /**
   * Lock or unlock the config bar. Called when a test starts / ends.
   */
  _lockConfig(locked) {
    const bar = document.getElementById('configBar');
    if (!bar) return;

    bar.classList.toggle('config-bar--locked', locked);

    // Also make the config bar buttons non-interactive at the DOM level
    bar.querySelectorAll('button').forEach((btn) => {
      btn.disabled = locked;
    });
  }

  // ============================================================
  // LIVE STATS
  // ============================================================

  renderLiveStatsSkeleton() {
    [this.dom.liveTime, this.dom.liveWpm, this.dom.liveAcc].forEach((el) => {
      if (!el) return;
      el.classList.add('skeleton');
      el.textContent = '— — —';
    });
  }

  _markStatsLive() {
    [this.dom.liveTime, this.dom.liveWpm, this.dom.liveAcc].forEach((el) => {
      el?.classList.remove('skeleton');
    });
  }

  // ============================================================
  // RESULTS (modal)
  // ============================================================

  showResults(result) {
    if (!result) return;
    this._lastResult = result;

    // Populate values
    if (this.dom.resultWpm) this.dom.resultWpm.textContent = '0';
    if (this.dom.resultAcc) this.dom.resultAcc.textContent = '0%';
    if (this.dom.resultRaw) this.dom.resultRaw.textContent = String(result.raw ?? 0);
    if (this.dom.resultConsistency) {
      this.dom.resultConsistency.textContent = `${result.consistency ?? 100}%`;
    }

    if (this.dom.resultChars) {
      const c = result.chars || {};
      const w = result.words || {};
      // Show: correct / incorrect / extra / missed / wrong-words
      this.dom.resultChars.textContent =
        `${c.correct ?? 0} / ${c.incorrect ?? 0} / ${c.extra ?? 0} / ${c.missed ?? 0} / ${w.wrong ?? 0}`;
    }

    if (this.dom.resultTime) {
      this.dom.resultTime.textContent = `${Math.round(result.time || 0)}s`;
    }

    // Show modal
    this.dom.resultsOverlay?.removeAttribute('hidden');

    // Animate count-up
    this._animateCountUp(this.dom.resultWpm, 0, result.wpm || 0, 700, '');
    this._animateCountUp(this.dom.resultAcc, 0, result.acc || 0, 700, '%');

    // Chart
    this._drawChart(result.chartData || []);
    this._mountChartLegend();
    // Effects
    if (result.isPB) {
      this._spawnConfetti();
      this._spawnPBBadge();
    }

    this.sound?.play?.('finish');
  }

  hideResults() {
    // Hide modal
    this.dom.resultsOverlay?.setAttribute('hidden', '');

    // Force-focus the typing container on the next frame.
    // Without the rAF, the browser is still processing the click
    // event and steals focus back to document.body.
    requestAnimationFrame(() => {
      this.engine.focus();
      // If the engine's focus didn't stick, try again on next tick
      setTimeout(() => {
        if (document.activeElement === document.body) {
          this.engine.focus();
        }
      }, 50);
    });
  }

  _animateCountUp(el, from, to, duration = 600, suffix = '') {
    if (!el) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = from + (to - from) * eased;
      el.textContent = `${Math.round(value)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = `${Math.round(to)}${suffix}`;
    };
    requestAnimationFrame(step);
  }

  // ============================================================
  // CHART
  // ============================================================

  _drawChart(data) {
    const svg = this.dom.wpmChart;
    if (!svg) return;

    if (!data || data.length < 2) {
      svg.innerHTML = '';
      return;
    }

    // Read which series are enabled
    const visible = this._getChartVisibility();

    const W = 600;
    const H = 200;
    const pad = { top: 20, right: 20, bottom: 28, left: 36 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const maxWpm = Math.max(...data.map((d) => Math.max(d.wpm, d.raw)), 10);
    const maxTime = Math.max(...data.map((d) => d.time), 1);

    const x = (t) => pad.left + (t / maxTime) * chartW;
    const y = (v) => pad.top + chartH - (v / maxWpm) * chartH;

    // Burst = best wpm in last 3 samples
    const burstData = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 2), i + 1);
      const best = Math.max(...window.map((w) => w.wpm));
      return { time: d.time, burst: best };
    });

    const maxBurst = Math.max(...burstData.map((d) => d.burst), 10);
    const yBurst = (v) => pad.top + chartH - (v / maxBurst) * chartH;

    // Grid lines
    const gridLines = Array.from({ length: 5 }, (_, i) => {
      const gy = pad.top + (i / 4) * chartH;
      const val = Math.round(maxWpm * (1 - i / 4));
      return (
        `<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="var(--border)" stroke-dasharray="4" />` +
        `<text x="${pad.left - 6}" y="${gy + 3}" text-anchor="end" fill="var(--text-muted)" font-size="9" font-family="var(--font-mono)">${val}</text>`
      );
    }).join('');

    // Build paths conditionally
    let paths = '';

    // Raw line (grey dashed)
    if (visible.raw) {
      const rawPath = data
        .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${y(d.raw)}`)
        .join(' ');
      paths += `<path d="${rawPath}" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" stroke-dasharray="4 3" stroke-linejoin="round" />`;
    }

    // Burst line (purple solid, thinner)
    if (visible.burst) {
      const burstPath = burstData
        .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${yBurst(d.burst)}`)
        .join(' ');
      paths += `<path d="${burstPath}" fill="none" stroke="#7c6df0" stroke-width="1.5" stroke-linejoin="round" opacity="0.85" />`;
    }

    // WPM line (accent, primary)
    const wpmPath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${y(d.wpm)}`)
      .join(' ');
    paths += `<path d="${wpmPath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />`;

    // PB line (horizontal dashed marker)
    if (visible.pb) {
      const pb = this.stats?.getCurrentPB?.();
      const pbWpm = pb?.wpm;
      if (pbWpm && pbWpm > 0) {
        const pbY = y(pbWpm);
        paths += `<line x1="${pad.left}" y1="${pbY}" x2="${W - pad.right}" y2="${pbY}" stroke="var(--warning, #f59e0b)" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.75" />`;
        paths += `<text x="${pad.left + 6}" y="${pbY - 4}" fill="var(--warning, #f59e0b)" font-size="9" font-family="var(--font-mono)">PB: ${pbWpm}</text>`;
      }
    }

    // Error markers (red X)
    if (visible.errors) {
      const markers = data
        .filter((d) => d.errors > 0)
        .map((d) => {
          const cx = x(d.time);
          const cy = y(d.wpm);
          return `<g stroke="var(--error)" stroke-width="1.5" stroke-linecap="round">
            <line x1="${cx - 3}" y1="${cy - 3}" x2="${cx + 3}" y2="${cy + 3}" />
            <line x1="${cx + 3}" y1="${cy - 3}" x2="${cx - 3}" y2="${cy + 3}" />
          </g>`;
        })
        .join('');
      paths += markers;
    }

    // Y-axis on the right for errors (only if enabled)
    if (visible.errors) {
      const maxErrors = Math.max(...data.map((d) => d.errors), 1);
      const errorAxis = Array.from({ length: 4 }, (_, i) => {
        const gy = pad.top + (i / 3) * chartH;
        const val = Math.round(maxErrors * (1 - i / 3));
        return `<text x="${W - pad.right + 6}" y="${gy + 3}" text-anchor="start" fill="var(--error)" font-size="9" font-family="var(--font-mono)" opacity="0.7">${val}</text>`;
      }).join('');
      paths += errorAxis;
    }

    svg.innerHTML = `${gridLines}${paths}`;

    // Attach hover
    this._attachChartHover(data, { x, y, W, H, pad, burstData, yBurst });
  }

  _attachChartHover(data, scales) {
    const chartEl = this.dom.wpmChart?.parentElement;
    if (!chartEl) return;

    chartEl.querySelector('.chart-hover')?.remove();
    chartEl.querySelector('.tooltip--chart')?.remove();

    const hover = document.createElement('div');
    hover.className = 'chart-hover';
    chartEl.appendChild(hover);

    const line = document.createElement('div');
    line.className = 'chart-hover-line';
    hover.appendChild(line);

    const dot = document.createElement('div');
    dot.className = 'chart-hover-dot';
    hover.appendChild(dot);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip tooltip--chart';
    chartEl.appendChild(tooltip);

    const visible = this._getChartVisibility();

    const onMove = (e) => {
      const rect = chartEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      const W = scales.W;
      const pad = scales.pad;
      const chartW = W - pad.left - pad.right;
      const maxTime = data[data.length - 1].time;

      const svgScale = W / rect.width;
      const svgX = mx * svgScale;

      const relX = (svgX - pad.left) / chartW;
      const targetTime = relX * maxTime;

      let closest = data[0];
      let closestDist = Infinity;
      for (const d of data) {
        const dist = Math.abs(d.time - targetTime);
        if (dist < closestDist) {
          closestDist = dist;
          closest = d;
        }
      }

      const idx = data.indexOf(closest);
      const window = data.slice(Math.max(0, idx - 2), idx + 1);
      const burst = Math.max(...window.map((w) => w.wpm));

      const lineX = scales.x(closest.time) / svgScale;
      const dotY = scales.y(closest.wpm) / svgScale;

      line.style.left = `${lineX}px`;
      line.style.opacity = '1';

      dot.style.left = `${lineX}px`;
      dot.style.top = `${dotY + 12}px`;
      dot.style.opacity = '1';

      // Build tooltip rows conditionally
      let rows = `<div class="tooltip__row" style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">${closest.time}s</div>`;

      if (visible.errors) {
        rows += `<div class="tooltip__row"><span class="tooltip__swatch" style="background:var(--error);"></span><span class="tooltip__label">errors: ${closest.errors}</span></div>`;
      }
      rows += `<div class="tooltip__row"><span class="tooltip__swatch" style="background:var(--accent);"></span><span class="tooltip__label">wpm: ${closest.wpm}</span></div>`;
      if (visible.raw) {
        rows += `<div class="tooltip__row"><span class="tooltip__swatch" style="background:var(--text-secondary);"></span><span class="tooltip__label">raw: ${closest.raw}</span></div>`;
      }
      if (visible.burst) {
        rows += `<div class="tooltip__row"><span class="tooltip__swatch" style="background:#7c6df0;"></span><span class="tooltip__label">burst: ${burst}</span></div>`;
      }

      tooltip.innerHTML = rows;

      const tooltipX = Math.min(Math.max(lineX - 60, 0), rect.width - 140);
      tooltip.style.left = `${tooltipX}px`;
      tooltip.style.bottom = `calc(100% - ${dotY}px + 12px)`;
      tooltip.style.top = 'auto';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(0)';
      tooltip.style.pointerEvents = 'none';
    };

    const onLeave = () => {
      line.style.opacity = '0';
      dot.style.opacity = '0';
      tooltip.style.opacity = '0';
    };

    hover.style.pointerEvents = 'auto';
    hover.addEventListener('mousemove', onMove);
    hover.addEventListener('mouseleave', onLeave);
  }

  /**
   * Read which chart series are visible from localStorage.
   * Defaults: raw=on, burst=on, errors=on, pb=on, scale=on.
   */
  _getChartVisibility() {
    const defaults = { raw: true, burst: true, errors: true, pb: true, scale: true };
    try {
      const raw = localStorage.getItem('typeflow:chart-visibility');
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (err) {
      return defaults;
    }
  }

  /**
   * Persist which chart series are visible.
   */
  _setChartVisibility(visibility) {
    try {
      localStorage.setItem('typeflow:chart-visibility', JSON.stringify(visibility));
    } catch (err) { /* ignore */ }
  }

  /**
   * Wire the legend buttons and re-draw the chart on toggle.
   */
  _mountChartLegend() {
    const legend = document.getElementById('chartLegend');
    if (!legend) return;

    // Apply current active states
    const visibility = this._getChartVisibility();
    legend.querySelectorAll('.legend-btn').forEach((btn) => {
      const series = btn.dataset.series;
      const isOn = !!visibility[series];
      btn.dataset.active = String(isOn);
    });

    // Remove any old listeners by cloning
    const freshLegend = legend.cloneNode(true);
    legend.parentNode.replaceChild(freshLegend, legend);

    // Attach fresh listeners
    freshLegend.querySelectorAll('.legend-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const series = btn.dataset.series;
        const vis = this._getChartVisibility();
        vis[series] = !vis[series];
        this._setChartVisibility(vis);
        btn.dataset.active = String(vis[series]);

        // Redraw
        if (this._lastResult?.chartData) {
          this._drawChart(this._lastResult.chartData);
        }
      });
    });
  }
   
  // ============================================================
  // EFFECTS
  // ============================================================

  _spawnConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti';
    document.body.appendChild(container);

    const colors = ['#e2b714', '#ff6b6b', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da'];
    const count = 80;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti__piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--fall-duration', `${2 + Math.random() * 2}s`);
      piece.style.setProperty('--fall-delay', `${Math.random() * 0.4}s`);
      piece.style.width = `${4 + Math.random() * 6}px`;
      piece.style.height = `${8 + Math.random() * 10}px`;
      piece.style.borderRadius = Math.random() > 0.5 ? '2px' : '50%';
      container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 5000);
  }

  _spawnPBBadge() {
    const modal = this.dom.resultsOverlay?.querySelector('.modal--results');
    if (!modal) return;

    const existing = modal.querySelector('.pb-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'pb-badge';
    badge.textContent = '★ new personal best';
    badge.style.position = 'absolute';
    badge.style.top = 'var(--space-lg)';
    badge.style.right = 'var(--space-lg)';

    modal.style.position = 'relative';
    modal.appendChild(badge);

    setTimeout(() => badge.remove(), 5000);
  }

  // ============================================================
  // BUTTON FEEDBACK
  // ============================================================

  _pulseButton(btn) {
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn?.classList.remove('pressed'), 120);
  }

  _flashButton(btn, message) {
    if (!btn) return;
    const label = btn.querySelector('span');
    if (!label) return;
    const original = label.textContent;
    label.textContent = message;
    setTimeout(() => { label.textContent = original; }, 1500);
  }

  // ============================================================
  // GETTER
  // ============================================================

  getLastResult() {
    return this._lastResult || null;
  }
}

export default TestPage;
