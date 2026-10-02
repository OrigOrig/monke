/* ============================================================
   TYPE FLOW — main.js
   Application bootstrap. Wires modules, sets up global
   listeners, initializes state, and starts the router.
   ============================================================ */

// ============================================================
// IMPORTS
// ============================================================

import { state, initState, subscribe, update, getState } from './state.js';
import { Router } from './router.js';
import { Engine } from './engine.js';
import { Stats } from './stats.js';
import { Sound } from './sound.js';
import { Themes } from './themes.js';
import { Funbox } from './funbox.js';
import { CustomText } from './customText.js';
import { CommandPalette } from './commandPalette.js';
import { Screenshot } from './screenshot.js';
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
  app: document.getElementById('app'),
  sidebar: document.getElementById('sidebar'),
  main: document.getElementById('main'),
  navItems: document.querySelectorAll('[data-nav]'),
  commandBtn: document.getElementById('commandBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  resultsOverlay: document.getElementById('resultsOverlay'),
  commandOverlay: document.getElementById('commandOverlay'),
  customTextOverlay: document.getElementById('customTextOverlay'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsDrawer: document.getElementById('settingsDrawer'),
  scanlineOverlay: document.getElementById('scanlineOverlay'),
  toastContainer: document.getElementById('toastContainer'),
};

// ============================================================
// MODULE REGISTRY
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
    // 1. Initialize state from storage
    initState();

    // 2. Apply saved theme + reduce motion + scanlines
    applyInitialPreferences();

    // 3. Load word lists + quotes
    const data = await loadData();

    // 4. Initialize core modules
    initCoreModules(data);

    // 5. Initialize features
    initFeatureModules();

    // 6. Initialize pages
    initPages();

    // 7. Initialize router
    initRouter();

    // 8. Attach global listeners
    attachGlobalListeners();

    // 9. Attach sidebar navigation
    attachNavigation();

    // 10. Expose to window for debugging
    exposeToWindow();

    // 11. Mark app as ready
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
    DOM.scanlineOverlay?.classList.add('active');
  }

  // Font size
  applyFontSize(s.fontSize || 'md');

  // Caret style
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

function initCoreModules(data) {
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

  // Inject loaded data (word lists + quotes)
  if (data) {
    modules.engine.setData(data);
  }

  // Init engine (binds DOM, attaches listeners, renders initial test)
  modules.engine.init();

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

  // Mount theme grid into settings drawer
  modules.themes.mountGrid();

  // Funbox
  modules.funbox = new Funbox({
    activeMode: getState().funbox || 'none',
    onModeChange: (mode) => update('funbox', mode),
  });

  // Custom text
  modules.customText = new CustomText({
    onApply: (words, options) => {
      update('customText', { text: words.join(' '), options });
      modules.engine.loadCustomText(words.join(' '), options);
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
    router: null, // set after router init
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
  modules.pages.test.mount();

  modules.pages.about = new AboutPage({
    state,
    stats: modules.stats,
  });
  modules.pages.about.mount();

  modules.pages.leaderboard = new LeaderboardPage({
    state,
    stats: modules.stats,
  });
  modules.pages.leaderboard.mount();

  modules.pages.stats = new StatsPage({
    state,
    stats: modules.stats,
  });
  modules.pages.stats.mount();
}

// ============================================================
// 5. ROUTER
// ============================================================

function initRouter() {
  modules.router = new Router({
    defaultRoute: 'test',
    container: DOM.main,
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

  // Give command palette a reference to the router
  modules.commandPalette.router = modules.router;

  modules.router.start();
}

// ============================================================
// 6. GLOBAL LISTENERS
// ============================================================

function attachGlobalListeners() {
  // Global keyboard shortcuts
  document.addEventListener('keydown', handleGlobalKeyDown, true);

  // Click outside to close modals
  DOM.commandOverlay?.addEventListener('click', (e) => {
    if (e.target === DOM.commandOverlay) closeCommandPalette();
  });

  DOM.resultsOverlay?.addEventListener('click', (e) => {
    if (e.target === DOM.resultsOverlay) closeResults();
  });

  DOM.customTextOverlay?.addEventListener('click', (e) => {
    if (e.target === DOM.customTextOverlay) closeCustomTextModal();
  });

  // Settings drawer
  DOM.settingsBtn?.addEventListener('click', openSettings);
  DOM.settingsOverlay?.addEventListener('click', closeSettings);
  document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);

  // Command palette trigger
  DOM.commandBtn?.addEventListener('click', openCommandPalette);

  // Custom text modal buttons
  document.getElementById('closeCustomTextBtn')?.addEventListener('click', closeCustomTextModal);
  document.getElementById('cancelCustomTextBtn')?.addEventListener('click', closeCustomTextModal);
  document.getElementById('applyCustomTextBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    const mode = document.querySelector('[data-setting="customTextMode"] .active')?.dataset.value || 'simple';
    const delimiter = document.querySelector('[data-setting="customTextDelimiter"] .active')?.dataset.value || 'pipe';
    modules.customText.apply(textarea.value, { mode, delimiter });
  });

  document.getElementById('stripZeroWidthBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    textarea.value = modules.customText.stripZeroWidth(textarea.value);
  });

  document.getElementById('normalizeTypographyBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('customTextArea');
    textarea.value = modules.customText.normalizeTypography(textarea.value);
  });

  // Results modal buttons
  document.getElementById('restartBtn')?.addEventListener('click', () => {
    closeResults();
    modules.engine.restart();
  });

  document.getElementById('nextTestBtn')?.addEventListener('click', () => {
    closeResults();
    modules.engine.restart({ reroll: true });
  });

  document.getElementById('closeResultsBtn')?.addEventListener('click', closeResults);

  document.getElementById('screenshotBtn')?.addEventListener('click', async () => {
    const modal = DOM.resultsOverlay?.querySelector('.modal--results');
    if (modal) {
      await modules.screenshot.captureElement(modal, {
        filename: `typeflow-${Date.now()}.png`,
      });
    }
  });

  // Settings drawer controls
  attachSettingsControls();

  // Visibility change: pause if tab loses focus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      modules.engine.pause();
      modules.sound.suspend();
    } else {
      modules.engine.resume();
      modules.sound.resume();
    }
  });

  // beforeunload: flush state
  window.addEventListener('beforeunload', () => {
    modules.engine.flush?.();
  });
}

// ============================================================
// 7. GLOBAL KEYBOARD
// ============================================================

function handleGlobalKeyDown(e) {
  const s = getState();

  // Esc / Ctrl+Shift+P → command palette
  if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
    if (DOM.commandOverlay && !DOM.commandOverlay.hasAttribute('hidden')) {
      e.preventDefault();
      closeCommandPalette();
      return;
    }
    if (DOM.settingsDrawer && !DOM.settingsDrawer.hasAttribute('hidden')) {
      e.preventDefault();
      closeSettings();
      return;
    }
    if (DOM.resultsOverlay && !DOM.resultsOverlay.hasAttribute('hidden')) {
      e.preventDefault();
      closeResults();
      return;
    }
    if (DOM.customTextOverlay && !DOM.customTextOverlay.hasAttribute('hidden')) {
      e.preventDefault();
      closeCustomTextModal();
      return;
    }
    e.preventDefault();
    openCommandPalette();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (DOM.commandOverlay?.hasAttribute('hidden')) {
      openCommandPalette();
    } else {
      closeCommandPalette();
    }
    return;
  }

  // Quick restart
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
  // Toggle groups
  document.querySelectorAll('.setting-control').forEach((control) => {
    control.addEventListener('click', (e) => {
      const btn = e.target.closest('.config-btn');
      if (!btn) return;
      const setting = control.dataset.setting;
      const value = btn.dataset.value;
      if (!setting || value === undefined) return;

      const coerced = value === 'on' ? true : value === 'off' ? false : value;

      update(setting, coerced);
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
    accent.value = getState().customAccent || '#e2b714';
    accent.addEventListener('input', (e) => {
      modules.themes.setCustomAccent(e.target.value);
    });
  }

  // Reset settings
  document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem('typeflow:settings');
    location.reload();
  });

  // Clear all data
  document.getElementById('clearDataBtn')?.addEventListener('click', () => {
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
      DOM.scanlineOverlay?.classList.toggle('active', value);
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
      modules.engine.setTransform(modules.funbox.getTransform());
      break;
    default:
      break;
  }
}

// ============================================================
// 10. MODALS: OPEN/CLOSE HELPERS
// ============================================================

function openCommandPalette() {
  DOM.commandOverlay?.removeAttribute('hidden');
  modules.commandPalette.open();
}

function closeCommandPalette() {
  DOM.commandOverlay?.setAttribute('hidden', '');
  modules.commandPalette.close();
}

function openSettings() {
  DOM.settingsOverlay?.removeAttribute('hidden');
  DOM.settingsDrawer?.removeAttribute('hidden');
  modules.engine.pause();
}

function closeSettings() {
  DOM.settingsOverlay?.setAttribute('hidden', '');
  DOM.settingsDrawer?.setAttribute('hidden', '');
  modules.engine.resume();
}

function closeResults() {
  DOM.resultsOverlay?.setAttribute('hidden', '');
  modules.engine.focus();
}

function openCustomTextModal() {
  DOM.customTextOverlay?.removeAttribute('hidden');
  const textarea = document.getElementById('customTextArea');
  if (textarea) {
    textarea.value = getState().customText?.text || '';
    textarea.focus();
  }
}

function closeCustomTextModal() {
  DOM.customTextOverlay?.setAttribute('hidden', '');
}

function closeAllModals() {
  if (DOM.commandOverlay && !DOM.commandOverlay.hasAttribute('hidden')) closeCommandPalette();
  if (DOM.settingsDrawer && !DOM.settingsDrawer.hasAttribute('hidden')) closeSettings();
  if (DOM.resultsOverlay && !DOM.resultsOverlay.hasAttribute('hidden')) closeResults();
  if (DOM.customTextOverlay && !DOM.customTextOverlay.hasAttribute('hidden')) closeCustomTextModal();
}

function isModalOpen() {
  return (
    (DOM.commandOverlay && !DOM.commandOverlay.hasAttribute('hidden')) ||
    (DOM.settingsDrawer && !DOM.settingsDrawer.hasAttribute('hidden')) ||
    (DOM.resultsOverlay && !DOM.resultsOverlay.hasAttribute('hidden')) ||
    (DOM.customTextOverlay && !DOM.customTextOverlay.hasAttribute('hidden'))
  );
}

// ============================================================
// 11. TEST LIFECYCLE HOOKS
// ============================================================

async function handleTestFinish(result) {
  // Save result + update stats
  try {
    await modules.stats.saveResult(result);
  } catch (err) {
    console.warn('[main] failed to save result:', err);
  }

  // Delegate to test page (handles count-up, chart, confetti, PB badge)
  modules.pages.test.showResults(result);
}

function handleTestTick(tick) {
  // Live stat updates handled by engine directly
  // Hook exists for future cross-module reactivity
}

// ============================================================
// 12. DATA LOADING
// ============================================================

const DATA_VERSION = 'v1';
const DATA_CACHE_KEY = `typeflow:data:${DATA_VERSION}`;

async function loadData() {
  // 1. Try localStorage cache first (instant)
  try {
    const cached = localStorage.getItem(DATA_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.words && parsed.quotes) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[main] data cache read failed, fetching fresh:', err);
  }

  // 2. Fetch both files in parallel
  try {
    const [wordsRes, quotesRes] = await Promise.all([
      fetch('./data/words.json'),
      fetch('./data/quotes.json'),
    ]);

    if (!wordsRes.ok || !quotesRes.ok) {
      throw new Error(`fetch failed: words=${wordsRes.status} quotes=${quotesRes.status}`);
    }

    const [words, quotes] = await Promise.all([
      wordsRes.json(),
      quotesRes.json(),
    ]);

    const data = { words, quotes };

    // 3. Cache for next visit
    try {
      localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[main] data cache write failed:', err);
    }

    return data;
  } catch (err) {
    console.error('[main] failed to load data files:', err);
    // Safe fallback so the app still boots
    return {
      words: {
        english: ['type', 'to', 'start', 'loading', 'data'],
        english1k: [],
        code: [],
      },
      quotes: {
        short: [],
        medium: [],
        long: [],
        thicc: [],
      },
    };
  }
}

// ============================================================
// 13. UTILITIES
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
// 14. EXPOSE FOR DEBUGGING
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
// 15. KICKOFF
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
