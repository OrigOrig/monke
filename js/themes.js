/* ============================================================
   TYPE FLOW — themes.js
   Theme registry + switching. 24 built-in themes, custom
   accent generation, swatch grid, import/export.
   ============================================================ */

// ============================================================
// 1. THEME REGISTRY
// ============================================================
// Each theme provides a preview palette (bg, accent, text).
// The real color tokens live in css/themes.css and are applied
// via the `data-theme` attribute on <html>.
//
// The preview colors here are ONLY used to build the swatch
// grid — they aren't the source of truth for the actual theme.

const THEMES = [
  {
    id: 'serika-dark',
    name: 'Serika Dark',
    preview: { bg: '#0e0e0e', accent: '#e2b714', text: '#f5f5f5' },
    category: 'dark',
  },
  {
    id: 'serika-light',
    name: 'Serika Light',
    preview: { bg: '#f5f5f5', accent: '#d4a30c', text: '#1a1a1a' },
    category: 'light',
  },
  {
    id: 'dracula',
    name: 'Dracula',
    preview: { bg: '#282a36', accent: '#bd93f9', text: '#f8f8f2' },
    category: 'dark',
  },
  {
    id: 'nord',
    name: 'Nord',
    preview: { bg: '#2e3440', accent: '#88c0d0', text: '#eceff4' },
    category: 'dark',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    preview: { bg: '#0a0e17', accent: '#f7e05e', text: '#c1c9e0' },
    category: 'dark',
  },
  {
    id: 'matrix',
    name: 'Matrix',
    preview: { bg: '#000000', accent: '#00ff41', text: '#00ff41' },
    category: 'dark',
  },
  {
    id: 'bento',
    name: 'Bento',
    preview: { bg: '#1a1b1e', accent: '#ffb86c', text: '#f8f8f2' },
    category: 'dark',
  },
  {
    id: 'chalk-light',
    name: 'Chalk Light',
    preview: { bg: '#f7f7f7', accent: '#1a1a1a', text: '#1a1a1a' },
    category: 'light',
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    preview: { bg: '#1a1b26', accent: '#7aa2f7', text: '#c0caf5' },
    category: 'dark',
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    preview: { bg: '#11111b', accent: '#f5c2e7', text: '#cdd6f4' },
    category: 'dark',
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    preview: { bg: '#eff1f5', accent: '#8839ef', text: '#4c4f69' },
    category: 'light',
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    preview: { bg: '#1d2021', accent: '#fabd2f', text: '#ebdbb2' },
    category: 'dark',
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    preview: { bg: '#16141f', accent: '#ebbcba', text: '#e0def4' },
    category: 'dark',
  },
  {
    id: 'everforest',
    name: 'Everforest',
    preview: { bg: '#272e33', accent: '#a7c080', text: '#d3c6aa' },
    category: 'dark',
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    preview: { bg: '#16161d', accent: '#7e9cd8', text: '#dcd7ba' },
    category: 'dark',
  },
  {
    id: 'ayu-dark',
    name: 'Ayu Dark',
    preview: { bg: '#0a0e14', accent: '#ffb454', text: '#e6e1cf' },
    category: 'dark',
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    preview: { bg: '#1e2127', accent: '#61afef', text: '#abb2bf' },
    category: 'dark',
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    preview: { bg: '#002b36', accent: '#b58900', text: '#93a1a1' },
    category: 'dark',
  },
  {
    id: 'monokai',
    name: 'Monokai',
    preview: { bg: '#1e1f1c', accent: '#a6e22e', text: '#f8f8f2' },
    category: 'dark',
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    preview: { bg: '#0d1117', accent: '#58a6ff', text: '#e6edf3' },
    category: 'dark',
  },
  {
    id: 'material-dark',
    name: 'Material Dark',
    preview: { bg: '#1a1a1a', accent: '#82aaff', text: '#eeffff' },
    category: 'dark',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    preview: { bg: '#1a0f14', accent: '#ff8c42', text: '#ffe4c4' },
    category: 'dark',
  },
  {
    id: 'botanical',
    name: 'Botanical',
    preview: { bg: '#0f1a14', accent: '#7bc96f', text: '#d4e6d9' },
    category: 'dark',
  },
  {
    id: 'olivetti',
    name: 'Olivetti',
    preview: { bg: '#f0ece3', accent: '#b85c38', text: '#2c2416' },
    category: 'light',
  },
];

// ============================================================
// 2. THEMES CLASS
// ============================================================

export class Themes {
  /**
   * @param {Object} options
   * @param {string} options.currentTheme - initial theme id
   * @param {(id:string) => void} options.onChange
   * @param {(hex:string|null) => void} options.onCustomAccent
   */
  constructor({ currentTheme = 'serika-dark', onChange, onCustomAccent } = {}) {
    this.current = currentTheme;
    this.onChange = onChange || (() => {});
    this.onCustomAccent = onCustomAccent || (() => {});

    this.customAccent = null;

    // Custom user themes (imported / created)
    this.userThemes = loadUserThemes();

    this._grid = null;
  }

  // ============================================================
  // 3. THEME LIST
  // ============================================================

  /**
   * Returns all themes: built-in + user-imported.
   */
  getAll() {
    return [...THEMES, ...this.userThemes];
  }

  /**
   * Get a theme by id.
   */
  get(id) {
    return this.getAll().find((t) => t.id === id) || null;
  }

  /**
   * Get current theme object.
   */
  getCurrent() {
    return this.get(this.current) || THEMES[0];
  }

  // ============================================================
  // 4. THEME SWITCHING
  // ============================================================

  /**
   * Apply a theme by id.
   */
  setTheme(id) {
    const theme = this.get(id);
    if (!theme) {
      console.warn(`[themes] unknown theme "${id}", falling back to default`);
      id = 'serika-dark';
    }

    this.current = id;

    // Apply to <html>
    document.documentElement.setAttribute('data-theme', id);

    // Persist
    try {
      localStorage.setItem('typeflow:theme', id);
    } catch (e) { /* ignore */ }

    // Notify
    this.onChange(id);

    // Update grid active state
    this._refreshGridActive();
  }

  /**
   * Cycle to the next theme in the list (used by command palette).
   */
  next() {
    const all = this.getAll();
    const idx = all.findIndex((t) => t.id === this.current);
    const nextIdx = (idx + 1) % all.length;
    this.setTheme(all[nextIdx].id);
  }

  /**
   * Cycle to the previous theme.
   */
  previous() {
    const all = this.getAll();
    const idx = all.findIndex((t) => t.id === this.current);
    const prevIdx = (idx - 1 + all.length) % all.length;
    this.setTheme(all[prevIdx].id);
  }

  // ============================================================
  // 5. CUSTOM ACCENT
  // ============================================================

  /**
   * Set a custom accent color (hex). Generates hover/dim/glow
   * variants and applies as CSS custom properties.
   * Pass null to remove.
   */
  setCustomAccent(hex) {
    if (!hex) {
      this.customAccent = null;
      document.documentElement.removeAttribute('data-custom-accent');
      document.documentElement.style.removeProperty('--custom-accent');
      document.documentElement.style.removeProperty('--custom-accent-hover');
      document.documentElement.style.removeProperty('--custom-accent-dim');
      document.documentElement.style.removeProperty('--custom-accent-glow');
      this.onCustomAccent(null);
      return;
    }

    if (!isValidHex(hex)) {
      console.warn(`[themes] invalid hex "${hex}"`);
      return;
    }

    const normalized = normalizeHex(hex);
    this.customAccent = normalized;

    document.documentElement.setAttribute('data-custom-accent', 'true');
    document.documentElement.style.setProperty('--custom-accent', normalized);
    document.documentElement.style.setProperty('--custom-accent-hover', lightenHex(normalized, 12));
    document.documentElement.style.setProperty('--custom-accent-dim', hexToRgba(normalized, 0.15));
    document.documentElement.style.setProperty('--custom-accent-glow', hexToRgba(normalized, 0.4));

    // Persist
    try {
      localStorage.setItem('typeflow:custom-accent', normalized);
    } catch (e) { /* ignore */ }

    this.onCustomAccent(normalized);
  }

  getCustomAccent() {
    return this.customAccent;
  }

  // ============================================================
  // 6. SWATCH GRID
  // ============================================================

  /**
   * Mount the theme swatch grid into a container element.
   * The container must have id="themeGrid" or be passed in.
   */
  mountGrid(container) {
    if (!container) {
      container = document.getElementById('themeGrid');
    }
    if (!container) {
      console.warn('[themes] theme grid container not found');
      return;
    }

    this._grid = container;
    this.renderGrid();
  }

  /**
   * Re-render the entire swatch grid.
   */
  renderGrid() {
    if (!this._grid) return;

    const all = this.getAll();
    this._grid.innerHTML = '';

    const frag = document.createDocumentFragment();

    for (const theme of all) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'theme-swatch';
      swatch.dataset.theme = theme.id;
      swatch.setAttribute('role', 'radio');
      swatch.setAttribute('aria-checked', theme.id === this.current ? 'true' : 'false');
      swatch.setAttribute('aria-label', `${theme.name} theme`);
      swatch.title = theme.name;

      // Preview gradient: diagonal split of bg + accent
      swatch.style.setProperty('--swatch-bg', theme.preview.bg);
      swatch.style.setProperty('--swatch-accent', theme.preview.accent);
      swatch.style.setProperty('--swatch-text', theme.preview.text);

      if (theme.id === this.current) {
        swatch.classList.add('active');
      }

      // Add "user" badge if imported
      if (theme.isUser) {
        const badge = document.createElement('span');
        badge.className = 'theme-swatch__badge';
        badge.textContent = 'user';
        swatch.appendChild(badge);
      }

      // Name
      const name = document.createElement('span');
      name.className = 'theme-swatch__name';
      name.textContent = theme.name;
      swatch.appendChild(name);

      // Accent dot
      const dot = document.createElement('span');
      dot.className = 'theme-swatch__accent';
      swatch.appendChild(dot);

      // Click handler
      swatch.addEventListener('click', () => {
        swatch.classList.add('activating');
        setTimeout(() => swatch.classList.remove('activating'), 500);
        this.setTheme(theme.id);
      });

      frag.appendChild(swatch);
    }

    this._grid.appendChild(frag);
  }

  _refreshGridActive() {
    if (!this._grid) return;
    const swatches = this._grid.querySelectorAll('.theme-swatch');
    swatches.forEach((sw) => {
      const isActive = sw.dataset.theme === this.current;
      sw.classList.toggle('active', isActive);
      sw.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  // ============================================================
  // 7. USER THEMES (custom + imported)
  // ============================================================

  /**
   * Register a custom theme. Same shape as built-in themes.
   */
  addUserTheme(theme) {
    if (!theme || !theme.id || !theme.name || !theme.preview) {
      throw new Error('[themes] invalid theme shape');
    }
    // Avoid id conflicts
    if (this.get(theme.id)) {
      throw new Error(`[themes] theme id "${theme.id}" already exists`);
    }
    const userTheme = { ...theme, isUser: true };
    this.userThemes.push(userTheme);
    persistUserThemes(this.userThemes);
    this.renderGrid();
    return userTheme;
  }

  /**
   * Remove a user theme by id.
   */
  removeUserTheme(id) {
    const idx = this.userThemes.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.userThemes.splice(idx, 1);
    persistUserThemes(this.userThemes);
    if (this.current === id) {
      this.setTheme('serika-dark');
    }
    this.renderGrid();
    return true;
  }

  /**
   * Export the current theme (or a specific one) as a JSON string.
   */
  exportTheme(id) {
    const theme = this.get(id || this.current);
    if (!theme) return null;
    return JSON.stringify(
      {
        id: theme.id,
        name: theme.name,
        preview: theme.preview,
        category: theme.category || 'dark',
      },
      null,
      2
    );
  }

  /**
   * Import a theme from JSON string. Returns the imported theme.
   */
  importTheme(json) {
    let parsed;
    try {
      parsed = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      throw new Error('[themes] invalid JSON');
    }
    if (!parsed.id || !parsed.name || !parsed.preview) {
      throw new Error('[themes] missing required fields (id, name, preview)');
    }
    // Ensure unique id
    if (this.get(parsed.id)) {
      parsed.id = `${parsed.id}-${Date.now().toString(36)}`;
    }
    return this.addUserTheme(parsed);
  }
}

// ============================================================
// 8. STORAGE HELPERS
// ============================================================

const USER_THEMES_KEY = 'typeflow:user-themes';

function loadUserThemes() {
  try {
    const raw = localStorage.getItem(USER_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[themes] failed to load user themes:', err);
    return [];
  }
}

function persistUserThemes(themes) {
  try {
    localStorage.setItem(USER_THEMES_KEY, JSON.stringify(themes));
  } catch (err) {
    console.warn('[themes] failed to persist user themes:', err);
  }
}

// ============================================================
// 9. COLOR UTILITIES
// ============================================================

function isValidHex(hex) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
}

function normalizeHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  return `#${h.toLowerCase()}`;
}

function lightenHex(hex, amount) {
  const h = normalizeHex(hex).replace('#', '');
  const r = Math.min(255, parseInt(h.substring(0, 2), 16) + amount);
  const g = Math.min(255, parseInt(h.substring(2, 4), 16) + amount);
  const b = Math.min(255, parseInt(h.substring(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex, alpha) {
  const h = normalizeHex(hex).replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================
// 10. BOOT LOADER
// ============================================================

/**
 * Reads the saved theme from localStorage and applies it.
 * Called by main.js during bootstrap (before Themes instance
 * exists) so the initial paint is correct.
 */
export function applyInitialTheme() {
  try {
    const saved = localStorage.getItem('typeflow:theme') || 'serika-dark';
    document.documentElement.setAttribute('data-theme', saved);
    const accent = localStorage.getItem('typeflow:custom-accent');
    if (accent && isValidHex(accent)) {
      const normalized = normalizeHex(accent);
      document.documentElement.setAttribute('data-custom-accent', 'true');
      document.documentElement.style.setProperty('--custom-accent', normalized);
      document.documentElement.style.setProperty('--custom-accent-hover', lightenHex(normalized, 12));
      document.documentElement.style.setProperty('--custom-accent-dim', hexToRgba(normalized, 0.15));
      document.documentElement.style.setProperty('--custom-accent-glow', hexToRgba(normalized, 0.4));
    }
    return saved;
  } catch (err) {
    console.warn('[themes] failed to apply initial theme:', err);
    return 'serika-dark';
  }
}

// ============================================================
// 11. EXPORTS
// ============================================================

export const themesList = THEMES;

export default Themes;
