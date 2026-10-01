/* ============================================================
   TYPE FLOW — stats.js
   Stats engine. Records per-second WPM/ACC samples, computes
   consistency, tracks personal bests, aggregates lifetime
   stats, and compiles chart data for the results screen.
   ============================================================ */

import {
  getState,
  getHistory,
  getPersonalBests,
  saveResult,
  incrementTestsStarted,
} from './state.js';

// ============================================================
// 1. STATS CLASS
// ============================================================

export class Stats {
  constructor() {
    // Per-test data
    this.samples = [];          // [{ time, wpm, raw, acc, errors }]
    this.lastSecond = -1;       // Last recorded integer second
    this.replayLog = [];        // Kept in sync with engine

    // Cached personal bests
    this._pbs = null;
    this._pbsLoadedAt = 0;
    this.PB_CACHE_TTL = 30 * 1000; // 30s

    // Lifetime cache
    this._lifetime = null;
    this._lifetimeLoadedAt = 0;
    this.LIFETIME_CACHE_TTL = 5 * 1000;
  }

  // ============================================================
  // 2. PER-SECOND RECORDING
  // ============================================================

  /**
   * Called by the engine every second of a test.
   * @param {{time:number, wpm:number, raw:number, acc:number, errors:number}} sample
   */
  recordSecond(sample) {
    if (!sample || typeof sample.time !== 'number') return;

    // Deduplicate: only one sample per integer second
    const t = Math.floor(sample.time);
    if (t <= this.lastSecond) return;
    this.lastSecond = t;

    this.samples.push({
      time: t,
      wpm: Math.max(0, Math.round(sample.wpm || 0)),
      raw: Math.max(0, Math.round(sample.raw || 0)),
      acc: Math.max(0, Math.min(100, sample.acc ?? 100)),
      errors: Math.max(0, sample.errors || 0),
    });
  }

  /**
   * Reset samples at the start of a new test.
   */
  reset() {
    this.samples = [];
    this.lastSecond = -1;
    this.replayLog = [];
  }

  // ============================================================
  // 3. CONSISTENCY (coefficient of variation)
  // ============================================================

  /**
   * Standard Monkeytype formula:
   *   1. Compute per-second wpm samples
   *   2. Compute mean + standard deviation
   *   3. CV = stddev / mean
   *   4. Consistency = max(0, 100 * (1 - CV))
   */
  calculateConsistency() {
    const values = this.samples
      .map((s) => s.raw)
      .filter((v) => Number.isFinite(v) && v > 0);

    if (values.length < 2) return 100;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return 0;

    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / mean;

    const consistency = Math.max(0, Math.min(100, (1 - cv) * 100));
    return Math.round(consistency * 10) / 10;
  }

  // ============================================================
  // 4. BURST (best 1-second WPM)
  // ============================================================

  getBurst() {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.wpm));
  }

  // ============================================================
  // 5. CHART DATA
  // ============================================================

  /**
   * Returns normalized chart data:
   *   [{ time, wpm, raw, acc, errors }]
   */
  getChartData() {
    return this.samples.slice();
  }

  /**
   * Averages for the "avg wpm" line in the chart.
   */
  getAverages() {
    if (this.samples.length === 0) {
      return { avgWpm: 0, avgRaw: 0, avgAcc: 100, avgErrors: 0 };
    }
    const n = this.samples.length;
    const sum = this.samples.reduce(
      (acc, s) => ({
        wpm: acc.wpm + s.wpm,
        raw: acc.raw + s.raw,
        acc: acc.acc + s.acc,
        errors: acc.errors + s.errors,
      }),
      { wpm: 0, raw: 0, acc: 0, errors: 0 }
    );
    return {
      avgWpm: Math.round(sum.wpm / n),
      avgRaw: Math.round(sum.raw / n),
      avgAcc: Math.round((sum.acc / n) * 10) / 10,
      avgErrors: Math.round((sum.errors / n) * 10) / 10,
    };
  }

  // ============================================================
  // 6. PERSONAL BESTS
  // ============================================================

  /**
   * Check if a WPM qualifies as a personal best for the current
   * test mode config. Uses the cached PB map for speed.
   */
  isPersonalBest(wpm) {
    if (!Number.isFinite(wpm) || wpm <= 0) return false;

    const key = this._currentPBKey();
    const pb = this._pbsCache()?.[key];
    if (!pb) return true; // first ever result for this config

    return wpm > (pb.wpm || 0);
  }

  /**
   * Get the current personal best for the current test config.
   */
  getCurrentPB() {
    const key = this._currentPBKey();
    return this._pbsCache()?.[key] || null;
  }

  /**
   * Returns a key like "time-30", "words-25", "quote-medium".
   */
  _currentPBKey() {
    const s = getState();
    switch (s.mode) {
      case 'time': return `time-${s.timeLimit || 30}`;
      case 'words': return `words-${s.wordLimit || 25}`;
      case 'quote': return `quote-${s.quoteLength || 'medium'}`;
      case 'zen': return 'zen';
      case 'custom': return 'custom';
      default: return 'time-30';
    }
  }

  /**
   * Synchronous PB map access (returns cached or empty).
   * Async loading happens in `loadPersonalBests()`.
   */
  _pbsCache() {
    return this._pbs || {};
  }

  /**
   * Load PB map from IndexedDB. Call at boot + after each test.
   */
  async loadPersonalBests(force = false) {
    const now = Date.now();
    if (!force && this._pbs && now - this._pbsLoadedAt < this.PB_CACHE_TTL) {
      return this._pbs;
    }
    try {
      this._pbs = await getPersonalBests();
      this._pbsLoadedAt = now;
    } catch (err) {
      console.warn('[stats] failed to load PBs:', err);
      this._pbs = this._pbs || {};
    }
    return this._pbs;
  }

  // ============================================================
  // 7. LIFETIME STATS
  // ============================================================

  /**
   * Returns aggregated lifetime stats from state.
   * Reads from cached state (updates on save).
   */
  getLifetime() {
    const s = getState();
    const l = s.lifetime || {};
    return {
      testsStarted: l.testsStarted || 0,
      testsCompleted: l.testsCompleted || 0,
      totalTimeSeconds: l.totalTimeSeconds || 0,
      totalTimeHours: ((l.totalTimeSeconds || 0) / 3600).toFixed(2),
      totalTimeDays: ((l.totalTimeSeconds || 0) / 86400).toFixed(2),
      totalKeystrokes: l.totalKeystrokes || 0,
      totalCorrectKeystrokes: l.totalCorrectKeystrokes || 0,
      avgWpmAllTime: this._avgWpmAllTime(l),
    };
  }

  _avgWpmAllTime(l) {
    if (!l.totalTimeSeconds || !l.totalCorrectKeystrokes) return 0;
    const minutes = l.totalTimeSeconds / 60;
    if (minutes <= 0) return 0;
    return Math.round((l.totalCorrectKeystrokes / 5) / minutes);
  }

  /**
   * Build WPM distribution histogram from history.
   * Used on the Stats page.
   * Buckets of 10 WPM from 0 to 300+.
   */
  async getWpmDistribution() {
    let history = [];
    try {
      history = await getHistory({ limit: 1000 });
    } catch (err) {
      console.warn('[stats] failed to load history:', err);
      return [];
    }

    const bucketSize = 10;
    const maxBucket = 30; // 0–9, 10–19, …, 290–299, 300+
    const buckets = new Array(maxBucket + 1).fill(0);

    for (const r of history) {
      const wpm = Math.max(0, Math.round(r.wpm || 0));
      const idx = Math.min(maxBucket, Math.floor(wpm / bucketSize));
      buckets[idx]++;
    }

    return buckets.map((count, i) => ({
      label: i === maxBucket ? '300+' : `${i * bucketSize}–${i * bucketSize + bucketSize - 1}`,
      min: i * bucketSize,
      max: i === maxBucket ? Infinity : i * bucketSize + bucketSize - 1,
      count,
    }));
  }

  /**
   * Recent activity — last N results.
   */
  async getRecent(limit = 10) {
    try {
      const history = await getHistory({ limit });
      return history.map((r) => ({
        wpm: r.wpm,
        acc: r.acc,
        mode: r.mode,
        timeLimit: r.timeLimit,
        wordLimit: r.wordLimit,
        timestamp: r.timestamp,
        modeLabel: this._formatModeLabel(r),
      }));
    } catch (err) {
      console.warn('[stats] failed to load recent:', err);
      return [];
    }
  }

  _formatModeLabel(r) {
    switch (r.mode) {
      case 'time': return `time ${r.timeLimit || 30}`;
      case 'words': return `words ${r.wordLimit || 25}`;
      case 'quote': return `quote ${r.quoteLength || 'medium'}`;
      case 'zen': return 'zen';
      case 'custom': return 'custom';
      default: return r.mode || 'test';
    }
  }

  // ============================================================
  // 8. SAVE RESULT
  // ============================================================

  /**
   * Persist a finished test result.
   * Called by the engine's onFinish callback.
   */
  async saveResult(result) {
    try {
      await saveResult({
        ...result,
        mode: result.mode || getState().mode,
        timestamp: result.timestamp || Date.now(),
      });
      // Invalidate PB cache so next test picks up new record
      this._pbsLoadedAt = 0;
    } catch (err) {
      console.error('[stats] failed to save result:', err);
    }
  }

  // ============================================================
  // 9. FORMATTING HELPERS
  // ============================================================

  /**
   * Pretty-print a duration in seconds as "Xh Ym" or "Ym Zs".
   */
  static formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem}m`;
  }

  /**
   * Pretty-print a number with thousands separators.
   */
  static formatNumber(n) {
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US');
  }

  /**
   * Pretty-print a percentage to 1 decimal.
   */
  static formatPercent(n, decimals = 1) {
    if (!Number.isFinite(n)) return '0%';
    return `${n.toFixed(decimals)}%`;
  }

  /**
   * Relative time ("3m ago", "2h ago", "yesterday", etc.)
   */
  static formatRelative(timestamp) {
    if (!timestamp) return '—';
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 7) return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w}w ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(d / 365)}y ago`;
  }
}

export default Stats;
