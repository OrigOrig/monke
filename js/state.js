/* ============================================================
   TYPE FLOW — state.js
   Central state store. Single source of truth.
   - Loads/persists settings to localStorage
   - Stores test history in IndexedDB
   - Pub/sub for reactive updates
   - Schema migrations
   ============================================================ */

// ============================================================
// 1. STORAGE KEYS + VERSION
// ============================================================

const STORAGE = {
  SETTINGS: 'typeflow:settings',
  HISTORY: 'typeflow:history',
  META: 'typeflow:meta',
  VERSION: 1, // bump for migrations
};

const DB_NAME = 'typeflow';
const DB_VERSION = 1;
const DB_STORE = 'results';

// ============================================================
// 2. DEFAULT STATE
// ============================================================

const DEFAULT_STATE = {
  // ---------- Test configuration ----------
  mode: 'time',
  timeLimit: 30,
  wordLimit: 25,
  quoteLength: 'medium',
  punctuation: false,
  numbers: false,

  // ---------- Behavior settings ----------
  difficulty: 'normal',
  stopOnError: 'off',
  blindMode: false,
  freedomMode: false,
  quickRestart: 'tab',

  // ---------- Input settings ----------
  caretStyle: 'line',
  caretBlink: true,

  // ---------- Sound settings ----------
  soundEnabled: false,
  soundProfile: 'thock',
  soundVolume: 0.5,

  // ---------- Appearance settings ----------
  theme: 'serika-dark',
  customAccent: null,
  scanlines: false,
  reduceMotion: false,
  fontSize: 'md',

  // ---------- Funbox ----------
  funbox: 'none',

  // ---------- Custom text ----------
  customText: {
    text: '',
    options: { mode: 'simple', delimiter: 'pipe' },
  },

  // ---------- Runtime (not persisted) ----------
  currentPage: 'test',
  isTyping: false,
  isFinished: false,

  // ---------- Stats cache (persisted separately in IndexedDB) ----------
  lifetime: {
    testsStarted: 0,
    testsCompleted: 0,
    totalTimeSeconds: 0,
    totalKeystrokes: 0,
    totalCorrectKeystrokes: 0,
    personalBests: {},
  },
};

// ============================================================
// 3. INTERNAL STATE
// ============================================================

let _state = { ...DEFAULT_STATE };
let _initialized = false;
let _db = null;

// Subscribers: Map<event, Set<fn>>
const _subscribers = new Map();

// Persist debounce
let _persistTimer = null;
const PERSIST_DELAY = 250;

// ============================================================
// 4. INIT
// ============================================================

export async function initState() {
  if (_initialized) return _state;

  // Load settings from localStorage
  const saved = loadFromStorage(STORAGE.SETTINGS);
  if (saved && typeof saved === 'object') {
    _state = deepMerge({ ...DEFAULT_STATE }, saved);
  }

  // Run migrations
  await runMigrations();

  // Open IndexedDB
  _db = await openDatabase();

  // Load lifetime stats
  const lifetime = loadFromStorage('typeflow:lifetime');
  if (lifetime) {
    _state.lifetime = { ..._state.lifetime, ...lifetime };
  }

  _initialized = true;

  // Persist merged defaults (so future loads have all keys)
  persistSettings();

  return _state;
}

// ============================================================
// 5. STATE ACCESS
// ============================================================

/**
 * Returns a shallow-frozen snapshot of current state.
 * Deep-freeze avoided for perf; treat as read-only.
 */
export function getState() {
  return _state;
}

/**
 * Get a single key from state.
 */
export function get(key) {
  return _state[key];
}

/**
 * Update a single key. Persists + notifies.
 */
export function update(key, value) {
  if (_state[key] === value) return; // no-op

  const prev = _state[key];
  _state[key] = value;

  // Persist if the key is a settings key (not runtime)
  if (isPersistedKey(key)) {
    schedulePersist();
  }

  // Notify subscribers
  emit(`change:${key}`, { key, value, prev });
  emit('change', { key, value, prev });
}

/**
 * Bulk update multiple keys at once.
 */
export function patch(partial) {
  const changed = [];
  for (const [key, value] of Object.entries(partial)) {
    if (_state[key] !== value) {
      const prev = _state[key];
      _state[key] = value;
      changed.push({ key, value, prev });

      if (isPersistedKey(key)) schedulePersist();
      emit(`change:${key}`, { key, value, prev });
    }
  }
  if (changed.length) {
    emit('change', { bulk: changed });
  }
}

/**
 * Reset state to defaults (keeps runtime fields).
 */
export function resetState() {
  const runtime = {
    currentPage: _state.currentPage,
    isTyping: false,
    isFinished: false,
  };
  _state = { ...DEFAULT_STATE, ...runtime };
  persistSettings(true);
  emit('reset', {});
  emit('change', { key: '*', value: _state });
}

// ============================================================
// 6. PUB/SUB
// ============================================================

/**
 * Subscribe to an event. Returns an unsubscribe function.
 */
export function subscribe(event, fn) {
  if (!_subscribers.has(event)) {
    _subscribers.set(event, new Set());
  }
  _subscribers.get(event).add(fn);

  return () => unsubscribe(event, fn);
}

export function unsubscribe(event, fn) {
  const set = _subscribers.get(event);
  if (set) set.delete(fn);
}

function emit(event, payload) {
  const set = _subscribers.get(event);
  if (!set || set.size === 0) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[state] subscriber error for "${event}":`, err);
    }
  }
}

// ============================================================
// 7. PERSISTENCE — localStorage
// ============================================================

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[state] failed to load "${key}":`, err);
    return null;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // QuotaExceededError or private mode
    console.warn(`[state] failed to save "${key}":`, err);
    return false;
  }
}

function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    persistSettings();
    _persistTimer = null;
  }, PERSIST_DELAY);
}

function persistSettings(immediate = false) {
  if (immediate && _persistTimer) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  const settings = extractPersistedSettings();
  saveToStorage(STORAGE.SETTINGS, settings);
}

function extractPersistedSettings() {
  const out = {};
  for (const [key, value] of Object.entries(_state)) {
    if (isPersistedKey(key)) out[key] = value;
  }
  return out;
}

function isPersistedKey(key) {
  const RUNTIME_KEYS = new Set([
    'currentPage',
    'isTyping',
    'isFinished',
    'lifetime', // persisted separately
  ]);
  return !RUNTIME_KEYS.has(key);
}

// ============================================================
// 8. PERSISTENCE — IndexedDB (test history)
// ============================================================

function openDatabase() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      console.warn('[state] IndexedDB not supported — falling back to localStorage');
      resolve(null);
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        const store = db.createObjectStore(DB_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('mode', 'mode', { unique: false });
        store.createIndex('wpm', 'wpm', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('[state] IndexedDB open failed:', req.error);
      resolve(null);
    };
  });
}

/**
 * Add a result to history.
 */
export async function saveResult(result) {
  if (!_db) {
    // Fallback: localStorage
    const history = loadFromStorage(STORAGE.HISTORY) || [];
    history.push({ ...result, timestamp: result.timestamp || Date.now() });
    if (history.length > 500) history.splice(0, history.length - 500);
    saveToStorage(STORAGE.HISTORY, history);
    updateLifetime(result);
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = _db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const record = { ...result, timestamp: result.timestamp || Date.now() };
    const req = store.add(record);

    req.onsuccess = () => {
      updateLifetime(result);
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all results, newest first.
 */
export async function getHistory({ limit = 100 } = {}) {
  if (!_db) {
    const history = loadFromStorage(STORAGE.HISTORY) || [];
    return history.slice(-limit).reverse();
  }

  return new Promise((resolve, reject) => {
    const tx = _db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const index = store.index('timestamp');
    const results = [];
    const req = index.openCursor(null, 'prev');

    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get personal bests per mode (best WPM in each category).
 */
export async function getPersonalBests() {
  const history = await getHistory({ limit: 1000 });
  const pbs = {};

  for (const r of history) {
    const key = buildPBKey(r);
    if (!pbs[key] || r.wpm > pbs[key].wpm) {
      pbs[key] = r;
    }
  }

  return pbs;
}

function buildPBKey(result) {
  const m = result.mode || 'time';
  if (m === 'time') return `time-${result.timeLimit || 30}`;
  if (m === 'words') return `words-${result.wordLimit || 25}`;
  if (m === 'quote') return `quote-${result.quoteLength || 'medium'}`;
  return m;
}

/**
 * Clear all stored results.
 */
export async function clearHistory() {
  if (!_db) {
    localStorage.removeItem(STORAGE.HISTORY);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// 9. LIFETIME STATS
// ============================================================

function updateLifetime(result) {
  const l = { ..._state.lifetime };

  l.testsCompleted = (l.testsCompleted || 0) + 1;
  l.totalTimeSeconds = (l.totalTimeSeconds || 0) + (result.time || 0);
  l.totalKeystrokes = (l.totalKeystrokes || 0) + (result.totalKeystrokes || 0);
  l.totalCorrectKeystrokes = (l.totalCorrectKeystrokes || 0) + (result.correctKeystrokes || 0);

  _state.lifetime = l;
  saveToStorage('typeflow:lifetime', l);
  emit('change:lifetime', l);
}

/**
 * Increment "tests started" counter (called when a test begins).
 */
export function incrementTestsStarted() {
  const l = { ..._state.lifetime };
  l.testsStarted = (l.testsStarted || 0) + 1;
  _state.lifetime = l;
  saveToStorage('typeflow:lifetime', l);
}

// ============================================================
// 10. MIGRATIONS
// ============================================================

async function runMigrations() {
  const meta = loadFromStorage(STORAGE.META) || { version: 0 };
  const currentVersion = meta.version || 0;

  if (currentVersion === STORAGE.VERSION) return;

  // Migration chain (add cases as schema evolves)
  if (currentVersion < 1) {
    // v0 → v1: initial schema, nothing to migrate
  }

  saveToStorage(STORAGE.META, { version: STORAGE.VERSION });
}

// ============================================================
// 11. UTILITIES
// ============================================================

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] || {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// ============================================================
// 12. CONVENIENCE EXPORTS
// ============================================================

export const state = new Proxy(
  {},
  {
    get(_, key) {
      return _state[key];
    },
    set(_, key, value) {
      update(key, value);
      return true;
    },
    ownKeys() {
      return Reflect.ownKeys(_state);
    },
    getOwnPropertyDescriptor(_, key) {
      return {
        enumerable: true,
        configurable: true,
        value: _state[key],
      };
    },
  }
);

// ============================================================
// 13. EXPORTS
// ============================================================

export default {
  initState,
  getState,
  get,
  update,
  patch,
  resetState,
  subscribe,
  unsubscribe,
  saveResult,
  getHistory,
  getPersonalBests,
  clearHistory,
  incrementTestsStarted,
};
