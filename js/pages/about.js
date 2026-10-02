
/* ============================================================
   TYPE FLOW — pages/about.js
   About page controller. Hydrates lifetime stats, WPM
   distribution histogram, and animated counters.
   ============================================================ */

import { getState, subscribe } from '../state.js';

// ============================================================
// 1. ABOUT PAGE CLASS
// ============================================================

export class AboutPage {
  constructor({ state, stats }) {
    this.state = state;
    this.stats = stats;
    this.isMounted = false;

    this.dom = {};

    // Unsubscribe hooks
    this._unsubs = [];

    // Rendered once?
    this._hasRenderedStats = false;

    // Animation frame ref
    this._raf = null;
  }

  // ============================================================
  // 2. LIFECYCLE
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

    if (this._raf) cancelAnimationFrame(this._raf);
  }

  async render() {
    this.mount();

    // Populate stat cards (already have skeletons in HTML)
    await this._renderLifetimeStats();

    // Populate WPM distribution chart
    await this._renderDistribution();

    this._hasRenderedStats = true;
  }

  // ============================================================
  // 3. DOM CACHE
  // ============================================================

  _cacheDOM() {
    this.dom.testsStarted = document.getElementById('statTestsStarted');
    this.dom.testsStartedSub = document.getElementById('statTestsStartedSub');
    this.dom.typingTime = document.getElementById('statTypingTime');
    this.dom.typingTimeSub = document.getElementById('statTypingTimeSub');
    this.dom.testsCompleted = document.getElementById('statTestsCompleted');
    this.dom.testsCompletedSub = document.getElementById('statTestsCompletedSub');

    this.dom.distributionSub = document.getElementById('statsDistributionSub');
    this.dom.distributionChart = document.getElementById('statsDistributionChart');
  }

  // ============================================================
  // 4. STATE SUBSCRIPTIONS
  // ============================================================

  _subscribeToState() {
    // Re-render stats when they change (e.g. after a test completes)
    this._unsubs.push(
      subscribe('change:lifetime', () => {
        if (this._hasRenderedStats) {
          this._renderLifetimeStats();
          this._renderDistribution();
        }
      })
    );
  }

  // ============================================================
  // 5. LIFETIME STATS
  // ============================================================

  async _renderLifetimeStats() {
    const lifetime = this.stats?.getLifetime?.() || {};

    // Tests started
    if (this.dom.testsStarted) {
      this.dom.testsStarted.classList.remove('skeleton');
      this.dom.testsStarted.textContent = this._formatCount(lifetime.testsStarted);
    }
    if (this.dom.testsStartedSub) {
      this.dom.testsStartedSub.textContent = this._unitLabel(lifetime.testsStarted);
    }

    // Typing time
    if (this.dom.typingTime) {
      this.dom.typingTime.classList.remove('skeleton');
      const { value, unit } = this._formatDuration(lifetime.totalTimeSeconds);
      this.dom.typingTime.textContent = value;
      if (this.dom.typingTimeSub) {
        this.dom.typingTimeSub.textContent = unit;
      }
    }

    // Tests completed
    if (this.dom.testsCompleted) {
      this.dom.testsCompleted.classList.remove('skeleton');
      this.dom.testsCompleted.textContent = this._formatCount(lifetime.testsCompleted);
    }
    if (this.dom.testsCompletedSub) {
      this.dom.testsCompletedSub.textContent = this._unitLabel(lifetime.testsCompleted);
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
  // 6. WPM DISTRIBUTION
  // ============================================================

  async _renderDistribution() {
    const chart = this.dom.distributionChart;
    if (!chart) return;

    let data = [];
    try {
      data = await this.stats?.getWpmDistribution?.() || [];
    } catch (err) {
      console.warn('[about] failed to load distribution:', err);
    }

    // Hide skeleton bars
    const skeleton = chart.querySelector('.skeleton-chart');
    if (skeleton) skeleton.remove();

    // If no data → show empty state
    const total = data.reduce((sum, b) => sum + b.count, 0);
    if (total === 0) {
      chart.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">—</div>
          <p class="empty-state__text">No tests yet. Complete a test to see your distribution.</p>
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
      this.dom.distributionSub.innerHTML = `${n} total results · ${data.length} buckets`;
    }

    // Find max for scaling
    const maxCount = Math.max(...data.map((b) => b.count), 1);

    // Clear and render bars
    chart.innerHTML = '';

    const axisLabels = document.createElement('div');
    axisLabels.className = 'chart-axis';

    for (const bucket of data) {
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      const pct = (bucket.count / maxCount) * 100;
      bar.style.height = `${Math.max(pct, 2)}%`;
      bar.setAttribute('data-tooltip', `${bucket.label}: ${bucket.count}`);
      bar.setAttribute('aria-label', `${bucket.label} WPM: ${bucket.count} results`);
      chart.appendChild(bar);

      const label = document.createElement('span');
      label.textContent = bucket.label;
      axisLabels.appendChild(label);
    }

    // Append axis after the bars
    chart.parentElement?.appendChild(axisLabels);
  }

  // ============================================================
  // 7. MANUAL REFRESH
  // ============================================================

  /**
   * Manually trigger a re-render of all dynamic content.
   */
  async refresh() {
    await this._renderLifetimeStats();
    await this._renderDistribution();
  }
}

export default AboutPage;
