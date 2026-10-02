/* ============================================================
   TYPE FLOW — pages/stats.js
   Stats dashboard. Lifetime hero, WPM distribution, personal
   bests grid, recent activity feed.
   ============================================================ */

import { subscribe } from '../state.js';

// ============================================================
// 1. CONSTANTS
// ============================================================

const PB_SLOTS = [
  { key: 'time-15', label: 'time 15', config: { mode: 'time', timeLimit: 15 } },
  { key: 'time-30', label: 'time 30', config: { mode: 'time', timeLimit: 30 } },
  { key: 'time-60', label: 'time 60', config: { mode: 'time', timeLimit: 60 } },
  { key: 'words-25', label: 'words 25', config: { mode: 'words', wordLimit: 25 } },
  { key: 'words-50', label: 'words 50', config: { mode: 'words', wordLimit: 50 } },
  { key: 'quote-medium', label: 'quote medium', config: { mode: 'quote', quoteLength: 'medium' } },
];

const RECENT_LIMIT = 10;

// ============================================================
// 2. STATS PAGE CLASS
// ============================================================

export class StatsPage {
  constructor({ state, stats }) {
    this.state = state;
    this.stats = stats;
    this.isMounted = false;

    this.dom = {};
    this._unsubs = [];

    this._hasRendered = false;
  }

  // ============================================================
  // 3. LIFECYCLE
  // ============================================================

  mount() {
    if (this.isMounted) return;
    this.isMounted = true;

    this._cacheDOM();
    this._subscribeToState();
  }

  destroy() {
    if (!this.isMounted) return;
    this.isMounted = false;

    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
  }

  async render() {
    this.mount();

    await Promise.all([
      this._renderHero(),
      this._renderDistribution(),
      this._renderPersonalBests(),
      this._renderRecent(),
    ]);

    this._hasRendered = true;
  }

  // ============================================================
  // 4. DOM CACHE
  // ============================================================

  _cacheDOM() {
    // Hero
    this.dom.testsStarted = document.getElementById('statTestsStarted');
    this.dom.testsStartedSub = document.getElementById('statTestsStartedSub');
    this.dom.typingTime = document.getElementById('statTypingTime');
    this.dom.typingTimeSub = document.getElementById('statTypingTimeSub');
    this.dom.testsCompleted = document.getElementById('statTestsCompleted');
    this.dom.testsCompletedSub = document.getElementById('statTestsCompletedSub');

    // Distribution
    this.dom.distributionChart = document.getElementById('statsDistributionChart');
    this.dom.distributionSub = document.getElementById('statsDistributionSub');

    // Personal bests
    this.dom.pbGrid = document.getElementById('pbGrid');

    // Recent
    this.dom.recentList = document.getElementById('recentList');
  }

  // ============================================================
  // 5. STATE SUBSCRIPTIONS
  // ============================================================

  _subscribeToState() {
    this._unsubs.push(
      subscribe('change:lifetime', () => {
        if (this._hasRendered) this.render();
      })
    );
  }

  // ============================================================
  // 6. HERO (lifetime totals)
  // ============================================================

  async _renderHero() {
    const lifetime = this.stats?.getLifetime?.() || {};

    // Tests started
    this._setStat(
      this.dom.testsStarted,
      this.dom.testsStartedSub,
      this._formatCount(lifetime.testsStarted),
      this._unitLabel(lifetime.testsStarted)
    );

    // Typing time
    const { value, unit } = this._formatDuration(lifetime.totalTimeSeconds);
    this._setStat(this.dom.typingTime, this.dom.typingTimeSub, value, unit);

    // Tests completed
    this._setStat(
      this.dom.testsCompleted,
      this.dom.testsCompletedSub,
      this._formatCount(lifetime.testsCompleted),
      this._unitLabel(lifetime.testsCompleted)
    );
  }

  _setStat(valueEl, subEl, value, sub) {
    if (valueEl) {
      valueEl.classList.remove('skeleton');
      valueEl.textContent = value;
    }
    if (subEl) {
      subEl.textContent = sub || '—';
    }
  }

  _formatCount(n) {
    if (!n) return '0';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2);
    if (n >= 1_000) return (n / 1_000).toFixed(2);
    return String(n);
  }

  _unitLabel(n) {
    if (!n) return '';
    if (n >= 1_000_000_000) return 'billion';
    if (n >= 1_000_000) return 'million';
    if (n >= 1_000) return 'thousand';
    return '';
  }

  _formatDuration(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    if (s < 60) return { value: Math.round(s), unit: 'seconds' };
    if (s < 3600) return { value: (s / 60).toFixed(1), unit: 'minutes' };
    if (s < 86400) return { value: (s / 3600).toFixed(1), unit: 'hours' };
    return { value: (s / 86400).toFixed(2), unit: 'days' };
  }

  // ============================================================
  // 7. WPM DISTRIBUTION
  // ============================================================

  async _renderDistribution() {
    const chart = this.dom.distributionChart;
    if (!chart) return;

    let data = [];
    try {
      data = (await this.stats?.getWpmDistribution?.()) || [];
    } catch (err) {
      console.warn('[stats] distribution load failed:', err);
    }

    // Remove skeleton
    chart.querySelector('.skeleton-chart')?.remove();
    chart.innerHTML = '';

    const total = data.reduce((sum, b) => sum + b.count, 0);
    if (total === 0) {
      chart.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">—</div>
          <p class="empty-state__text">No data yet. Complete a test to see your WPM distribution.</p>
        </div>
      `;
      if (this.dom.distributionSub) {
        this.dom.distributionSub.innerHTML = '— — —';
      }
      return;
    }

    // Update subtitle
    if (this.dom.distributionSub) {
      const n = total.toLocaleString('en-US');
      this.dom.distributionSub.innerHTML = `${n} results across ${data.length} buckets`;
    }

    const maxCount = Math.max(...data.map((b) => b.count), 1);

    // Chart bars
    for (const bucket of data) {
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      const pct = (bucket.count / maxCount) * 100;
      bar.style.height = `${Math.max(pct, 2)}%`;
      bar.setAttribute('data-tooltip', `${bucket.label}: ${bucket.count}`);
      bar.setAttribute('aria-label', `${bucket.label} WPM: ${bucket.count} results`);
      chart.appendChild(bar);
    }

    // Axis labels
    const axis = document.createElement('div');
    axis.className = 'chart-axis';
    for (const bucket of data) {
      const label = document.createElement('span');
      label.textContent = bucket.label;
      axis.appendChild(label);
    }

    // Append axis after chart (sibling in parent)
    if (chart.parentElement) {
      chart.parentElement.querySelector('.chart-axis')?.remove();
      chart.parentElement.appendChild(axis);
    }
  }

  // ============================================================
  // 8. PERSONAL BESTS GRID
  // ============================================================

  async _renderPersonalBests() {
    const grid = this.dom.pbGrid;
    if (!grid) return;

    let pbs = {};
    try {
      pbs = (await this.stats?.loadPersonalBests?.()) || {};
    } catch (err) {
      console.warn('[stats] PB load failed:', err);
    }

    grid.innerHTML = '';

    for (const slot of PB_SLOTS) {
      const pb = pbs[slot.key];

      const item = document.createElement('div');
      item.className = 'pb-item';

      const mode = document.createElement('span');
      mode.className = 'pb-item__mode';
      mode.textContent = slot.label;

      const value = document.createElement('span');
      value.className = 'pb-item__value';
      if (pb) {
        value.textContent = this._fmt(pb.wpm);
      } else {
        value.classList.add('skeleton');
        value.textContent = '— — —';
      }

      const date = document.createElement('span');
      date.className = 'pb-item__date';
      if (pb?.timestamp) {
        date.textContent = this._formatRelative(pb.timestamp);
      } else {
        date.textContent = 'no pb yet';
      }

      item.appendChild(mode);
      item.appendChild(value);
      item.appendChild(date);
      grid.appendChild(item);
    }
  }

  // ============================================================
  // 9. RECENT ACTIVITY
  // ============================================================

  async _renderRecent() {
    const list = this.dom.recentList;
    if (!list) return;

    let recent = [];
    try {
      recent = (await this.stats?.getRecent?.(RECENT_LIMIT)) || [];
    } catch (err) {
      console.warn('[stats] recent load failed:', err);
    }

    list.innerHTML = '';

    if (recent.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-item';
      empty.style.justifyContent = 'center';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'no recent tests';
      list.appendChild(empty);
      return;
    }

    for (const r of recent) {
      const item = document.createElement('div');
      item.className = 'recent-item';

      const time = document.createElement('span');
      time.className = 'recent-item__time';
      time.textContent = this._formatRelative(r.timestamp);

      const mode = document.createElement('span');
      mode.className = 'recent-item__mode';
      mode.textContent = r.modeLabel || r.mode || 'test';

      const wpm = document.createElement('span');
      wpm.className = 'recent-item__wpm';
      wpm.textContent = `${this._fmt(r.wpm)} wpm`;

      const acc = document.createElement('span');
      acc.className = 'recent-item__acc';
      acc.textContent = `${this._fmt(r.acc, 1)}%`;

      item.appendChild(time);
      item.appendChild(mode);
      item.appendChild(wpm);
      item.appendChild(acc);
      list.appendChild(item);
    }
  }

  // ============================================================
  // 10. FORMATTERS
  // ============================================================

  _fmt(n, decimals = 1) {
    if (!Number.isFinite(n)) return '0';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(decimals).replace(/\.?0+$/, '');
  }

  _formatRelative(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w}w ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  }

  // ============================================================
  // 11. REFRESH
  // ============================================================

  async refresh() {
    await this.render();
  }
}

export default StatsPage;
