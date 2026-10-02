
/* ============================================================
   TYPE FLOW — pages/leaderboard.js
   Leaderboard page. Guest mode: your personal bests filtered
   by scope + mode. Ready to swap for global API later.
   ============================================================ */

import { getState, getHistory, getPersonalBests, subscribe } from '../state.js';

// ============================================================
// 1. CONSTANTS
// ============================================================

const SCOPE = {
  ALL_TIME: 'all-time',
  WEEKLY: 'weekly',
  DAILY: 'daily',
};

const SCOPE_LABELS = {
  [SCOPE.ALL_TIME]: 'all-time',
  [SCOPE.WEEKLY]: 'weekly',
  [SCOPE.DAILY]: 'daily',
};

// Modes we track personal bests for
const TRACKED_MODES = [
  { key: 'time-15', label: 'time 15', config: { mode: 'time', timeLimit: 15 } },
  { key: 'time-30', label: 'time 30', config: { mode: 'time', timeLimit: 30 } },
  { key: 'time-60', label: 'time 60', config: { mode: 'time', timeLimit: 60 } },
  { key: 'time-120', label: 'time 120', config: { mode: 'time', timeLimit: 120 } },
  { key: 'words-10', label: 'words 10', config: { mode: 'words', wordLimit: 10 } },
  { key: 'words-25', label: 'words 25', config: { mode: 'words', wordLimit: 25 } },
  { key: 'words-50', label: 'words 50', config: { mode: 'words', wordLimit: 50 } },
  { key: 'words-100', label: 'words 100', config: { mode: 'words', wordLimit: 100 } },
  { key: 'quote-medium', label: 'quote medium', config: { mode: 'quote', quoteLength: 'medium' } },
  { key: 'quote-long', label: 'quote long', config: { mode: 'quote', quoteLength: 'long' } },
];

// ============================================================
// 2. LEADERBOARD PAGE CLASS
// ============================================================

export class LeaderboardPage {
  constructor({ state, stats }) {
    this.state = state;
    this.stats = stats;
    this.isMounted = false;

    // Current filter state
    this.scope = SCOPE.ALL_TIME;
    this.modeKey = 'time-15';

    this.dom = {};
    this._unsubs = [];

    // Cached PB map
    this._pbCache = null;

    // Bound handlers
    this._handleScopeClick = this._handleScopeClick.bind(this);
    this._handleModeClick = this._handleModeClick.bind(this);
  }

  // ============================================================
  // 3. LIFECYCLE
  // ============================================================

  mount() {
    if (this.isMounted) return;
    this.isMounted = true;

    this._cacheDOM();
    this._attachListeners();
    this._subscribeToState();

    this._renderScopeFilters();
    this._renderModeFilters();
  }

  destroy() {
    if (!this.isMounted) return;
    this.isMounted = false;

    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];

    this._detachListeners();
  }

  async render() {
    this.mount();
    await this._loadData();
    this._renderTitle();
    this._renderTable();
  }

  // ============================================================
  // 4. DOM CACHE
  // ============================================================

  _cacheDOM() {
    this.dom.title = document.getElementById('leaderboardTitle');
    this.dom.meta = document.getElementById('leaderboardMeta');
    this.dom.tableBody = document.getElementById('leaderboardBody');
    this.dom.modeFilter = document.getElementById('leaderboardModeFilter');

    // Scope buttons are static in HTML — grab them all
    this.dom.scopeButtons = document.querySelectorAll('[data-scope]');
  }

  // ============================================================
  // 5. LISTENERS
  // ============================================================

  _attachListeners() {
    this.dom.scopeButtons?.forEach((btn) => {
      btn.addEventListener('click', this._handleScopeClick);
    });

    this.dom.modeFilter?.addEventListener('click', this._handleModeClick);
  }

  _detachListeners() {
    this.dom.scopeButtons?.forEach((btn) => {
      btn.removeEventListener('click', this._handleScopeClick);
    });

    this.dom.modeFilter?.removeEventListener('click', this._handleModeClick);
  }

  _subscribeToState() {
    // Re-render when a new result is saved (PB may have changed)
    this._unsubs.push(
      subscribe('change:lifetime', () => {
        if (this.isMounted) {
          this._pbCache = null; // invalidate
          this._loadData().then(() => {
            this._renderTitle();
            this._renderTable();
          });
        }
      })
    );
  }

  // ============================================================
  // 6. FILTER HANDLERS
  // ============================================================

  _handleScopeClick(e) {
    const btn = e.currentTarget;
    const scope = btn.dataset.scope;
    if (!scope || scope === this.scope) return;

    this.scope = scope;
    this._renderScopeFilters();
    this._renderTitle();
    this._renderTable();
    this._pulse(btn);
  }

  _handleModeClick(e) {
    const btn = e.target.closest('[data-mode-key]');
    if (!btn) return;
    const modeKey = btn.dataset.modeKey;
    if (!modeKey || modeKey === this.modeKey) return;

    this.modeKey = modeKey;
    this._renderModeFilters();
    this._renderTitle();
    this._renderTable();
    this._pulse(btn);
  }

  // ============================================================
  // 7. FILTER RENDERING
  // ============================================================

  _renderScopeFilters() {
    this.dom.scopeButtons?.forEach((btn) => {
      const isActive = btn.dataset.scope === this.scope;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  _renderModeFilters() {
    const container = this.dom.modeFilter;
    if (!container) return;

    container.innerHTML = '';

    const frag = document.createDocumentFragment();

    for (const mode of TRACKED_MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.dataset.modeKey = mode.key;
      btn.textContent = mode.label;
      if (mode.key === this.modeKey) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      frag.appendChild(btn);
    }

    container.appendChild(frag);
  }

  // ============================================================
  // 8. DATA LOADING
  // ============================================================

  async _loadData() {
    if (this._pbCache) return this._pbCache;

    try {
      const allPBs = await getPersonalBests();
      this._pbCache = allPBs || {};
    } catch (err) {
      console.warn('[leaderboard] failed to load PBs:', err);
      this._pbCache = {};
    }

    return this._pbCache;
  }

  // ============================================================
  // 9. TITLE + META
  // ============================================================

  _renderTitle() {
    const modeLabel = TRACKED_MODES.find((m) => m.key === this.modeKey)?.label || this.modeKey;
    if (this.dom.title) {
      this.dom.title.textContent = `${SCOPE_LABELS[this.scope]} ${modeLabel}`;
    }

    if (this.dom.meta) {
      const total = Object.keys(this._pbCache || {}).length;
      this.dom.meta.textContent = total
        ? `${total} tracked ${total === 1 ? 'mode' : 'modes'}`
        : 'no results yet';
    }
  }

  // ============================================================
  // 10. TABLE RENDERING
  // ============================================================

  _renderTable() {
    const tbody = this.dom.tableBody;
    if (!tbody) return;

    const rows = this._getRowsForCurrentFilter();

    tbody.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('tr');
      empty.className = 'leaderboard-empty';
      empty.innerHTML = `
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">—</div>
            <p class="empty-state__text">No personal bests for this mode yet. Complete a test to record one.</p>
          </div>
        </td>
      `;
      tbody.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();

    rows.forEach((row, idx) => {
      const rank = idx + 1;
      const tr = document.createElement('tr');
      tr.dataset.rank = String(rank);

      // Rank cell
      const rankTd = document.createElement('td');
      rankTd.className = 'col-rank';
      rankTd.textContent = String(rank);
      tr.appendChild(rankTd);

      // Name cell (guest = "you")
      const nameTd = document.createElement('td');
      nameTd.className = 'col-name';
      nameTd.textContent = row.name || 'you';
      tr.appendChild(nameTd);

      // WPM
      const wpmTd = document.createElement('td');
      wpmTd.className = 'col-wpm';
      wpmTd.textContent = this._fmt(row.wpm);
      tr.appendChild(wpmTd);

      // Accuracy
      const accTd = document.createElement('td');
      accTd.className = 'col-acc';
      accTd.textContent = `${this._fmt(row.acc, 2)}%`;
      tr.appendChild(accTd);

      // Raw
      const rawTd = document.createElement('td');
      rawTd.className = 'col-raw';
      rawTd.textContent = this._fmt(row.raw);
      tr.appendChild(rawTd);

      // Consistency
      const consTd = document.createElement('td');
      consTd.className = 'col-cons';
      consTd.textContent = `${this._fmt(row.consistency, 1)}%`;
      tr.appendChild(consTd);

      // Date
      const dateTd = document.createElement('td');
      dateTd.className = 'col-date';
      dateTd.textContent = this._formatDate(row.timestamp);
      tr.appendChild(dateTd);

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  // ============================================================
  // 11. ROW SELECTION
  // ============================================================

  _getRowsForCurrentFilter() {
    const pb = this._pbCache?.[this.modeKey];
    if (!pb) return [];

    const cutoff = this._getCutoffForScope();
    if (cutoff && (pb.timestamp || 0) < cutoff) return [];

    return [
      {
        name: 'you',
        wpm: pb.wpm || 0,
        acc: pb.acc || 100,
        raw: pb.raw || 0,
        consistency: pb.consistency || 0,
        timestamp: pb.timestamp || Date.now(),
      },
    ];
  }

  _getCutoffForScope() {
    const now = Date.now();
    switch (this.scope) {
      case SCOPE.DAILY:
        return now - 24 * 60 * 60 * 1000;
      case SCOPE.WEEKLY:
        return now - 7 * 24 * 60 * 60 * 1000;
      case SCOPE.ALL_TIME:
      default:
        return 0;
    }
  }

  // ============================================================
  // 12. FORMATTERS
  // ============================================================

  _fmt(n, decimals = 2) {
    if (!Number.isFinite(n)) return '0';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(decimals).replace(/\.?0+$/, '');
  }

  _formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}\n${hh}:${mm}`;
  }

  // ============================================================
  // 13. FEEDBACK
  // ============================================================

  _pulse(btn) {
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  }

  // ============================================================
  // 14. MANUAL REFRESH
  // ============================================================

  async refresh() {
    this._pbCache = null;
    await this._loadData();
    this._renderTitle();
    this._renderTable();
  }
}

export default LeaderboardPage;
