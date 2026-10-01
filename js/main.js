/* ============================================================
   TYPE FLOW — main.js
   Application bootstrap. Wires modules, sets up global
   listeners, initializes state, and starts the router.
   ============================================================ */

// ============================================================
// IMPORTS
// ============================================================

// Core
import { state, initState, subscribe, update, getState } from './state.js';
import { Router } from './router.js';

// Engine
import { Engine } from './engine.js';
import { Stats } from './stats.js';
import { Sound } from './sound.js';

// Features
import { Themes } from './themes.js';
import { Funbox } from './funbox.js';
import { CustomText } from './customText.js';
import { CommandPalette } from './commandPalette.js';
import { Screenshot } from './screenshot.js';

// Pages
import { TestPage } from './pages/test.js';
import { AboutPage } from './pages/about.js';
import { LeaderboardPage } from './pages/leaderboard.js';
import { StatsPage } from './pages/stats.js';

// ============================================================
// DOM CACHE
// ============================================================

const DOM = {
  html: document.documentElement,
  body: document.body,

  // App shell
  app: document.getElementById('app'),
  sidebar: document.getElementById('sidebar'),
  main: document.getElementById('main'),

  // Navigation
  navItems: document.querySelectorAll('[data-nav]'),

  // Global buttons
  commandBtn: document.getElementById('commandBtn'),
  settingsBtn: document.getElementById('settingsBtn'),

  // Modals
  resultsOverlay: document.getElementById('resultsOverlay'),
  commandOverlay: document.getElementById('commandOverlay'),
  customTextOverlay: document.getElementById('customTextOverlay'),

  // Drawer
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsDrawer: document.getElementById('settingsDrawer'),

  // Overlays
  scanlineOverlay: document.getElementById('scanlineOverlay'),

  // Toast
  toastContainer: document.getElementById('toastContainer'),
};

// ============================================================
// MODULE REGISTRY
// Central registry so modules can talk to each other without
// circular imports.
// ============================================================

const modules = {
  engine: null,
  stats: null,
  sound: null,
  themes: null,
  funbox: null,
  customText: null,
  commandPalette: null,
  screenshot: null,
  router: null,
  pages: {
    test: null,
    about: null,
    leaderboard: null,
    stats: null,
  },
};

// ============================================================
// BOOTSTRAP
// ============================================================

async function bootstrap() {
  try {
    // ---------- 1. Initialize state from storage ----------
    initState();

    // ---------- 2. Apply saved theme + reduce motion + scanlines ----------
    applyInitialPreferences();

    // ---------- 3. Initialize core modules ----------
    initCoreModules();

    // ---------- 4. Initialize features ----------
    initFeatureModules();

    // ---------- 5. Initialize pages ----------
    initPages();

    // ---------- 6. Initialize router ----------
    initRouter();

    // ---------- 7. Attach global listeners ----------
    attachGlobalListeners();

    // ---------- 8. Attach sidebar navigation ----------
    attachNavigation();

    // ---------- 9. Expose to window for debugging ----------
    exposeToWindow();

    // ---------- 10. Mark app as ready ----------
    DOM.html.setAttribute('data-app-ready', 'true');

    console.info(
      '%ctypeflow',
      'color: #e2b714; font-weight: 700; font-size: 14px;',
      '— ready'
    );
  } catch (err) {
    console.error('[typeflow] bootstrap failed:', err);
    showFatalError(err);
  }
}

// ============================================================
// 1. INITIAL PREFERENCES
// ============================================================

function applyInitialPreferences() {
  const s = getState();

  // Theme
  DOM.html.setAttribute('data-theme', s.theme || 'serika-dark');

  // Custom accent
  if (s.customAccent) {
    DOM.html.setAttribute('data-custom-accent', 'true');
    DOM.html.style.setProperty('--custom-accent', s.customAccent);
    DOM.html.style.setProperty('--custom-accent-hover', lightenHex(s.customAccent, 12));
    DOM.html.style.setProperty('--custom-accent-dim', hexToRgba(s.customAccent, 0.15));
    DOM.html.style.setProperty('--custom-accent-glow', hexToRgba(s.customAccent, 0.4));
  }

  // Reduce motion
  if (s.reduceMotion) {
    DOM.html.setAttribute('data-reduce-motion', 'true');
  }

  // Scanlines
  if (s.scanlines) {
    DOM.scanlineOverlay.classList.add('active');
  }

  // Font size
  applyFontSize(s.fontSize || 'md');

  // Caret style (class applied later by caret.js after DOM ready)
  DOM.html.setAttribute('data-caret-style', s.caretStyle || 'line');
}

function applyFontSize(size) {
  const map = { sm: '0.9', md: '1', lg: '1.15' };
  const scale = map[size] || '1';
  DOM.html.style.setProperty('--text-scale', scale);
}

// ============================================================
// 2. CORE MODULES
// ============================================================

function initCoreModules() {
  // Sound engine
  modules.sound = new Sound({
    enabled: getState().soundEnabled,
    profile: getState().soundProfile,
    volume: getState().soundVolume ?? 0.5,
  });

  // Stats engine
  modules.stats = new Stats();

  // Typing engine
  modules.engine = new Engine({
    state,
    update,
    stats: modules.stats,
    sound: modules.sound,
    onFinish: handleTestFinish,
    onTick: handleTestTick,
  });

  // Wire engine → global state events
  subscribe('engine:finish', handleTestFinish);
  subscribe('engine:tick', handleTestTick);
}

// ============================================================
// 3. FEATURE MODULES
// ============================================================

function initFeatureModules() {
  // Themes
  modules.themes = new Themes({
    currentTheme: getState().theme,
    onChange: (themeId) => {
      DOM.html.setAttribute('data-theme', themeId);
      update('theme', themeId);
    },
    onCustomAccent: (hex) => {
      if (!hex) {
        DOM.html.removeAttribute('data-custom-accent');
        DOM.html.style.removeProperty('--custom-accent');
        DOM.html.style.removeProperty('--custom-accent-hover');
        DOM.html.style.removeProperty('--custom-accent-dim');
        DOM.html.style.removeProperty('--custom-accent-glow');
        update('customAccent', null);
        return;
      }
      DOM.html.setAttribute('data-custom-accent', 'true');
      DOM.html.style.setProperty('--custom-accent', hex);
      DOM.html.style.setProperty('--custom-accent-hover', lightenHex(hex, 12));
      DOM.html.style.setProperty('--custom-accent-dim', hexToRgba(hex, 0.15));
      DOM.html.style.setProperty('--custom-accent-glow', hexToRgba(hex, 0.4));
      update('customAccent', hex);
    },
  });

  // Funbox (mode modifiers)
  modules.funbox = new Funbox({
    activeMode: getState().funbox || 'none',
    onModeChange: (mode) => update('funbox', mode),
  });

  // Custom text
  modules.customText = new CustomText({
    onApply: (text, options) => {
      update('customText', { text, options });
      modules.engine.loadCustomText(text, options);
      closeCustomTextModal();
    },
  });

  // Command palette
  modules.commandPalette = new CommandPalette({
    container: DOM.commandOverlay,
    input: document.getElementById('commandInput'),
    list: document.getElementById('commandList'),
    state,
    update,
    engine: modules.engine,
    themes: modules.themes,
    funbox: modules.funbox,
    router: modules.router,
  });

  // Screenshot
  modules.screenshot = new Screenshot();
}

// ============================================================
// 4. PAGES
// ============================================================

function initPages() {
  modules.pages.test = new TestPage({
    engine: modules.engine,
    stats: modules.stats,
    themes: modules.themes,
    funbox: modules.funbox,
    customText: modules.customText,
    screenshot: modules.screenshot,
    sound: modules.sound,
    state,
    update,
  });

  modules.pages.about = new AboutPage({
    state,
    stats: modules.stats,
  });

  modules.pages.leaderboard = new LeaderboardPage({
    state,
    stats: modules.stats,
  });

  modules.pages.stats = new StatsPage({
    state,
    stats: modules.stats,
  });
}

// ============================================================
// 5. ROUTER
// ============================================================

function initRouter() {
  modules.router = new Router({
    defaultRoute: 'test',
    routes: {
      test: {
        page: modules.pages.test,
        onEnter: () => {
          modules.engine.focus();
        },
        onExit: () => {
          modules.engine.blur();
        },
      },
      about: {
        page: modules.pages.about,
        onEnter: () => modules.pages.about.render(),
      },
      leaderboard: {
        page: modules.pages.leaderboard,
        onEnter: () => modules.pages.leaderboard.render(),
      },
      stats: {
        page: modules.pages.stats,
        onEnter: () => modules.pages.stats.render(),
      },
    },
    onChange: (route) => {
      update('currentPage', route);
      DOM.html.setAttribute('data-page', route);
      updateNavActive(route);
    },
  });

  modules.router.start();
}

// ============================================================
// 6. GLOBAL LISTENERS
// ============================================================

function attachGlobalListeners() {
  // ---------- Global keyboard shortcuts ----------
  document.addEventListener('keydown', handleGlobalKeyDown, true);

  // ---------- Click outside to close modals ----------
  DOM.commandOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.commandOverlay) closeCommandPalette();
  });

  DOM.resultsOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.resultsOverlay) closeResults();
  });

  DOM.customTextOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.customTextOverlay) closeCustomTextModal();
  });

  // ---------- Settings drawer ----------
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.settingsOverlay.addEventListener('click', closeSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);

  // ---------- Command palette trigger ----------
  DOM.commandBtn.addEventListener('click', openCommandPalette);

  // ---------- Custom text modal buttons ----------
  document.getElementById('closeCustomTextBtn').addEventListener('click', closeCustomTextModal);
  document.getElementById('cancelCustomTextBtn').addEventListener('click', closeCustomTextModal);
  document.getElementById('applyCustomTextBtn').addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    const mode = document.querySelector('[data-setting="customTextMode"] .active')?.dataset.value || 'simple';
    const delimiter = document.querySelector('[data-setting="customTextDelimiter"] .active')?.dataset.value || 'pipe';
    modules.customText.apply(textarea.value, { mode, delimiter });
  });

  document.getElementById('stripZeroWidthBtn').addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    textarea.value = modules.customText.stripZeroWidth(textarea.value);
  });

  document.getElementById('normalizeTypographyBtn').addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    textarea.value = modules.customText.normalizeTypography(textarea.value);
  });

  // ---------- Results modal buttons ----------
  document.getElementById('restartBtn').addEventListener('click', () => {
    closeResults();
    modules.engine.restart();
  });

  document.getElementById('nextTestBtn').addEventListener('click', () => {
    closeResults();
    modules.engine.restart({ reroll: true });
  });

  document.getElementById('closeResultsBtn').addEventListener('click', closeResults);

  document.getElementById('screenshotBtn').addEventListener('click', async () => {
    const modal = DOM.resultsOverlay.querySelector('.modal--results');
    if (modal) {
      await modules.screenshot.captureElement(modal, {
        filename: `typeflow-${Date.now()}.png`,
      });
    }
  });

  // ---------- Settings drawer controls ----------
  attachSettingsControls();

  // ---------- Visibility change: pause if tab loses focus ----------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      modules.engine.pause();
    } else {
      modules.engine.resume();
    }
  });

  // ---------- beforeunload: flush state ----------
  window.addEventListener('beforeunload', () => {
    modules.engine.flush?.();
  });
}

// ============================================================
// 7. GLOBAL KEYBOARD
// ============================================================

function handleGlobalKeyDown(e) {
  const s = getState();

  // ---------- Esc / Ctrl+Shift+P → command palette ----------
  if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
    if (DOM.commandOverlay.hasAttribute('hidden') === false) {
      e.preventDefault();
      closeCommandPalette();
      return;
    }
    if (!DOM.settingsDrawer.hasAttribute('hidden')) {
      e.preventDefault();
      closeSettings();
      return;
    }
    if (!DOM.resultsOverlay.hasAttribute('hidden')) {
      e.preventDefault();
      closeResults();
      return;
    }
    if (!DOM.customTextOverlay.hasAttribute('hidden')) {
      e.preventDefault();
      closeCustomTextModal();
      return;
    }
    // Open command palette
    e.preventDefault();
    openCommandPalette();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (DOM.commandOverlay.hasAttribute('hidden')) {
      openCommandPalette();
    } else {
      closeCommandPalette();
    }
    return;
  }

  // ---------- Quick restart ----------
  if (s.quickRestart !== 'off' && !isModalOpen()) {
    if (s.quickRestart === 'tab' && e.key === 'Tab') {
      e.preventDefault();
      modules.engine.restart();
      return;
    }
    if (s.quickRestart === 'enter' && e.key === 'Enter') {
      e.preventDefault();
      modules.engine.restart();
      return;
    }
  }
}

// ============================================================
// 8. SIDEBAR NAVIGATION
// ============================================================

function attachNavigation() {
  DOM.navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      const route = item.dataset.nav;
      if (!route) return;
      e.preventDefault();
      if (isModalOpen()) closeAllModals();
      modules.router.navigate(route);
    });
  });
}

function updateNavActive(route) {
  DOM.navItems.forEach((item) => {
    const match = item.dataset.nav === route;
    item.classList.toggle('active', match);
    if (match) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

// ============================================================
// 9. SETTINGS DRAWER
// ============================================================

function attachSettingsControls() {
  // Toggle groups (stopOnError, difficulty, blindMode, etc.)
  document.querySelectorAll('.setting-control').forEach((control) => {
    control.addEventListener('click', (e) => {
      const btn = e.target.closest('.config-btn');
      if (!btn) return;
      const setting = control.dataset.setting;
      const value = btn.dataset.value;
      if (!setting || value === undefined) return;

      // Convert "on"/"off" to booleans
      const coerced = value === 'on' ? true : value === 'off' ? false : value;

      update(setting, coerced);

      // Immediate side effects
      applySettingSideEffects(setting, coerced);
    });
  });

  // Volume slider
  const volume = document.getElementById('soundVolume');
  if (volume) {
    volume.value = (getState().soundVolume ?? 0.5) * 100;
    volume.addEventListener('input', (e) => {
      const v = Number(e.target.value) / 100;
      update('soundVolume', v);
      modules.sound.setVolume(v);
    });
  }

  // Custom accent color
  const accent = document.getElementById('customAccent');
  if (accent) {
    accent.value = getState().customAccent || getState().accent || '#e2b714';
    accent.addEventListener('input', (e) => {
      modules.themes.setCustomAccent(e.target.value);
    });
  }

  // Reset settings
  document.getElementById('resetSettingsBtn').addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem('typeflow:settings');
    location.reload();
  });

  // Clear all data
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (!confirm('This will delete all your test history and settings. Continue?')) return;
    localStorage.clear();
    indexedDB.deleteDatabase('typeflow');
    location.reload();
  });
}

function applySettingSideEffects(setting, value) {
  switch (setting) {
    case 'caretStyle':
      DOM.html.setAttribute('data-caret-style', value);
      modules.engine.setCaretStyle(value);
      break;
    case 'caretBlink':
      modules.engine.setCaretBlink(value);
      break;
    case 'soundEnabled':
      modules.sound.setEnabled(value);
      break;
    case 'soundProfile':
      modules.sound.setProfile(value);
      break;
    case 'scanlines':
      DOM.scanlineOverlay.classList.toggle('active', value);
      break;
    case 'reduceMotion':
      DOM.html.setAttribute('data-reduce-motion', value ? 'true' : 'false');
      break;
    case 'fontSize':
      applyFontSize(value);
      break;
    case 'blindMode':
      modules.engine.setBlindMode(value);
      break;
    case 'freedomMode':
      modules.engine.setFreedomMode(value);
      break;
    case 'difficulty':
      modules.engine.setDifficulty(value);
      break;
    case 'stopOnError':
      modules.engine.setStopOnError(value);
      break;
    case 'funbox':
      modules.funbox.setMode(value);
      break;
    default:
      break;
  }
}

// ============================================================
// 10. MODALS: OPEN/CLOSE HELPERS
// ============================================================

function openCommandPalette() {
  DOM.commandOverlay.removeAttribute('hidden');
  modules.commandPalette.open();
}

function closeCommandPalette() {
  DOM.commandOverlay.setAttribute('hidden', '');
  modules.commandPalette.close();
}

function openSettings() {
  DOM.settingsOverlay.removeAttribute('hidden');
  DOM.settingsDrawer.removeAttribute('hidden');
  // Trigger drawer slide-in on next frame
  requestAnimationFrame(() => {
    DOM.settingsDrawer.classList.add('open');
  });
  modules.engine.pause();
}

function closeSettings() {
  DOM.settingsDrawer.classList.remove('open');
  setTimeout(() => {
    DOM.settingsOverlay.setAttribute('hidden', '');
    DOM.settingsDrawer.setAttribute('hidden', '');
    modules.engine.resume();
  }, 300);
}

function closeResults() {
  DOM.resultsOverlay.setAttribute('hidden', '');
  modules.engine.focus();
}

function openCustomTextModal() {
  DOM.customTextOverlay.removeAttribute('hidden');
  const textarea = document.getElementById('customTextArea');
  textarea.value = getState().customText?.text || '';
  textarea.focus();
}

function closeCustomTextModal() {
  DOM.customTextOverlay.setAttribute('hidden', '');
}

function closeAllModals() {
  if (!DOM.commandOverlay.hasAttribute('hidden')) closeCommandPalette();
  if (!DOM.settingsDrawer.hasAttribute('hidden')) closeSettings();
  if (!DOM.resultsOverlay.hasAttribute('hidden')) closeResults();
  if (!DOM.customTextOverlay.hasAttribute('hidden')) closeCustomTextModal();
}

function isModalOpen() {
  return (
    !DOM.commandOverlay.hasAttribute('hidden') ||
    !DOM.settingsDrawer.hasAttribute('hidden') ||
    !DOM.resultsOverlay.hasAttribute('hidden') ||
    !DOM.customTextOverlay.hasAttribute('hidden')
  );
}

// ============================================================
// 11. TEST LIFECYCLE HOOKS
// ============================================================

function handleTestFinish(result) {
  // Save result to storage
  modules.stats.saveResult(result);

  // Show results modal
  showResults(result);
}

function handleTestTick(tick) {
  // Live stat updates handled by engine directly
  // This hook exists for any cross-module reactivity
}

function showResults(result) {
  // Populate results modal
  const { wpm, raw, acc, consistency, chars, time, chartData, isPB } = result;

  document.getElementById('resultWpm').textContent = '0';
  document.getElementById('resultAcc').textContent = '0%';
  document.getElementById('resultRaw').textContent = raw;
  document.getElementById('resultConsistency').textContent = `${consistency}%`;
  document.getElementById('resultChars').textContent =
    `${chars.correct} / ${chars.incorrect} / ${chars.extra} / ${chars.missed}`;
  document.getElementById('resultTime').textContent = `${Math.round(time)}s`;

  // Show modal
  DOM.resultsOverlay.removeAttribute('hidden');

  // Animate count-up
  animateCountUp(document.getElementById('resultWpm'), 0, wpm, 700);
  animateCountUp(document.getElementById('resultAcc'), 0, acc, 700, '%');

  // Draw chart
  drawWpmChart(chartData);

  // Confetti on PB
  if (isPB) {
    spawnConfetti();
    spawnPBBadge();
  }
}

function animateCountUp(el, from, to, duration = 600, suffix = '') {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = from + (to - from) * eased;
    el.textContent = `${Math.round(value)}${suffix}`;
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = `${Math.round(to)}${suffix}`;
  }
  requestAnimationFrame(frame);
}

function drawWpmChart(data) {
  const svg = document.getElementById('wpmChart');
  if (!svg || !data || data.length < 2) {
    svg.innerHTML = '';
    return;
  }

  const W = 600;
  const H = 200;
  const pad = { top: 20, right: 20, bottom: 28, left: 36 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const maxWpm = Math.max(...data.map((d) => Math.max(d.wpm, d.raw)), 10);
  const maxTime = Math.max(...data.map((d) => d.time), 1);

  const x = (t) => pad.left + (t / maxTime) * chartW;
  const y = (v) => pad.top + chartH - (v / maxWpm) * chartH;

  const wpmPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${y(d.wpm)}`).join(' ');
  const rawPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.time)} ${y(d.raw)}`).join(' ');

  const errorMarkers = data
    .filter((d) => d.errors > 0)
    .map((d) => `<circle cx="${x(d.time)}" cy="${y(d.wpm)}" r="3" fill="var(--error)" />`)
    .join('');

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const gy = pad.top + (i / 4) * chartH;
    const val = Math.round(maxWpm * (1 - i / 4));
    return `<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="var(--border)" stroke-dasharray="4" />`
      + `<text x="${pad.left - 6}" y="${gy + 3}" text-anchor="end" fill="var(--text-muted)" font-size="9" font-family="var(--font-mono)">${val}</text>`;
  }).join('');

  svg.innerHTML = `
    ${gridLines}
    <path d="${rawPath}" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linejoin="round" />
    <path d="${wpmPath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
    ${errorMarkers}
  `;
}

function spawnConfetti() {
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

function spawnPBBadge() {
  const modal = DOM.resultsOverlay.querySelector('.modal--results');
  if (!modal) return;
  const badge = document.createElement('div');
  badge.className = 'pb-badge';
  badge.textContent = '★ new personal best';
  badge.style.position = 'absolute';
  badge.style.top = 'var(--space-lg)';
  badge.style.right = 'var(--space-lg)';
  modal.style.position = 'relative';
  modal.appendChild(badge);
  setTimeout(() => badge.remove(), 4000);
}

// ============================================================
// 12. UTILITIES
// ============================================================

function lightenHex(hex, amount) {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.substring(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(c.substring(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(c.substring(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function showFatalError(err) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: #0a0a0a; color: #f5f5f5;
    display: flex; flex-direction: column; gap: 16px;
    align-items: center; justify-content: center;
    padding: 32px; font-family: monospace;
  `;
  div.innerHTML = `
    <div style="color: #ef4444; font-size: 24px;">⚠ startup failed</div>
    <pre style="max-width: 80ch; color: #a0a0a0; font-size: 12px; white-space: pre-wrap;">${err.stack || err.message || err}</pre>
    <button onclick="location.reload()" style="padding: 8px 16px; background: #e2b714; color: #0a0a0a; border: none; border-radius: 6px; font-family: inherit; cursor: pointer;">reload</button>
  `;
  document.body.appendChild(div);
}

// ============================================================
// 13. EXPOSE FOR DEBUGGING
// ============================================================

function exposeToWindow() {
  if (typeof window === 'undefined') return;
  window.__typeflow = {
    state,
    update,
    getState,
    modules,
    version: '1.0.0',
  };
}

// ============================================================
// 14. KICKOFF
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
