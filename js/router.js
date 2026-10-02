
/* ============================================================
   TYPE FLOW — router.js
   Hash-based router. Handles page transitions, deep linking,
   browser back/forward, and per-page enter/exit hooks.
   ============================================================ */

// ============================================================
// 1. ROUTER CLASS
// ============================================================

export class Router {
  /**
   * @param {Object} options
   * @param {string} [options.defaultRoute='test']
   * @param {Object} options.routes - { routeId: { page, onEnter, onExit } }
   * @param {(route:string) => void} [options.onChange]
   * @param {HTMLElement} [options.container] - main content area
   */
  constructor({ defaultRoute = 'test', routes = {}, onChange, container } = {}) {
    this.defaultRoute = defaultRoute;
    this.routes = routes;
    this.onChange = onChange || (() => {});
    this.container = container || document.getElementById('main');

    this.current = null;
    this.history = [];        // stack of visited routes
    this.transitioning = false;

    // Bind handlers
    this._onHashChange = this._onHashChange.bind(this);

    // Track reduced motion
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._reducedMotion.addEventListener?.('change', (e) => {
      this._reducedMotion = e.matches;
    });
  }

  // ============================================================
  // 2. LIFECYCLE
  // ============================================================

  start() {
    window.addEventListener('hashchange', this._onHashChange);

    // Handle initial route
    const initial = this._parseHash();
    if (initial) {
      this.navigate(initial, { replace: true });
    } else {
      this.navigate(this.defaultRoute, { replace: true });
    }
  }

  stop() {
    window.removeEventListener('hashchange', this._onHashChange);
  }

  // ============================================================
  // 3. NAVIGATION
  // ============================================================

  /**
   * Navigate to a route.
   * @param {string} route - route id (e.g. 'test')
   * @param {Object} [options]
   * @param {boolean} [options.replace=false] - replace history entry
   * @param {boolean} [options.silent=false] - skip onEnter hooks
   */
  async navigate(route, { replace = false, silent = false } = {}) {
    if (!this.routes[route]) {
      console.warn(`[router] unknown route "${route}", falling back to "${this.defaultRoute}"`);
      route = this.defaultRoute;
    }

    if (route === this.current && !silent) return;

    if (this.transitioning) {
      // Wait for current transition to finish before starting another
      await this._waitForTransition();
    }

    this.transitioning = true;

    const prevRoute = this.current;
    const prevConfig = prevRoute ? this.routes[prevRoute] : null;
    const nextConfig = this.routes[route];

    try {
      // ---------- Exit current page ----------
      if (prevConfig && !silent) {
        try {
          prevConfig.onExit?.();
        } catch (err) {
          console.warn(`[router] onExit error for "${prevRoute}":`, err);
        }
        this._hidePage(prevRoute);
      }

      // ---------- Update hash ----------
      const newHash = `#/${route}`;
      if (window.location.hash !== newHash) {
        if (replace) {
          history.replaceState(null, '', newHash);
        } else {
          window.location.hash = newHash;
        }
      }

      // ---------- Show new page ----------
      this._showPage(route);

      // ---------- Enter new page ----------
      if (!silent) {
        try {
          nextConfig.onEnter?.();
        } catch (err) {
          console.warn(`[router] onEnter error for "${route}":`, err);
        }
      }

      // ---------- Update state ----------
      if (prevRoute && prevRoute !== route) {
        this.history.push(prevRoute);
        if (this.history.length > 50) this.history.shift();
      }

      this.current = route;

      // ---------- Notify ----------
      this.onChange(route, prevRoute);

      // ---------- Focus management for accessibility ----------
      this._focusMain();
    } finally {
      // Wait for the transition duration before unlocking
      const delay = this._reducedMotion ? 0 : 220;
      setTimeout(() => { this.transitioning = false; }, delay);
    }
  }

  /**
   * Navigate to the previous route in the stack.
   */
  back() {
    if (this.history.length === 0) return;
    const prev = this.history.pop();
    this.navigate(prev, { silent: false });
  }

  /**
   * Alias for navigate with silent=false
   */
  push(route) {
    return this.navigate(route);
  }

  /**
   * Replace current route (no history entry).
   */
  replace(route) {
    return this.navigate(route, { replace: true });
  }

  /**
   * Returns the current route id.
   */
  getCurrent() {
    return this.current;
  }

  /**
   * Returns whether the given route is current.
   */
  isCurrent(route) {
    return this.current === route;
  }

  // ============================================================
  // 4. HASH PARSING
  // ============================================================

  _parseHash() {
    const raw = window.location.hash || '';
    if (!raw) return null;
    // Strip leading "#/" or "#"
    const cleaned = raw.replace(/^#\/?/, '').trim();
    if (!cleaned) return null;
    // Take only the first segment (ignore query params for now)
    const route = cleaned.split('/')[0].split('?')[0];
    return route || null;
  }

  _onHashChange() {
    const route = this._parseHash() || this.defaultRoute;
    if (route !== this.current) {
      this.navigate(route, { silent: false });
    }
  }

  // ============================================================
  // 5. PAGE VISIBILITY
  // ============================================================

  _showPage(route) {
    // Set <html data-page> for CSS scoping
    document.documentElement.setAttribute('data-page', route);

    // Unhide all matching `.page` elements
    const pages = document.querySelectorAll('.page');
    pages.forEach((p) => {
      const match = p.dataset.page === route;
      if (match) {
        p.removeAttribute('hidden');
        // Re-trigger the page-enter animation
        p.style.animation = 'none';
        // eslint-disable-next-line no-unused-expressions
        p.offsetHeight; // force reflow
        p.style.animation = '';
      } else {
        p.setAttribute('hidden', '');
      }
    });
  }

  _hidePage(route) {
    const el = document.querySelector(`.page[data-page="${route}"]`);
    if (el) el.setAttribute('hidden', '');
  }

  // ============================================================
  // 6. FOCUS MANAGEMENT
  // ============================================================

  _focusMain() {
    const main = this.container;
    if (!main) return;
    // Only move focus for keyboard users
    const lastInteraction = this._lastInteraction || 'keyboard';
    if (lastInteraction === 'keyboard') {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  }

  /**
   * Track whether the last user interaction was keyboard or mouse,
   * so we don't steal focus from mouse users.
   */
  trackInteraction() {
    const setMouse = () => { this._lastInteraction = 'mouse'; };
    const setKeyboard = () => { this._lastInteraction = 'keyboard'; };
    window.addEventListener('mousedown', setMouse, { passive: true });
    window.addEventListener('touchstart', setMouse, { passive: true });
    window.addEventListener('keydown', setKeyboard);
  }

  // ============================================================
  // 7. TRANSITION HELPERS
  // ============================================================

  _waitForTransition() {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.transitioning) resolve();
        else setTimeout(check, 20);
      };
      check();
    });
  }

  // ============================================================
  // 8. ROUTE REGISTRATION (dynamic)
  // ============================================================

  /**
   * Register a route dynamically.
   */
  register(routeId, config) {
    if (!routeId || typeof routeId !== 'string') {
      console.warn('[router] invalid route id');
      return;
    }
    this.routes[routeId] = config || {};
  }

  /**
   * Unregister a route.
   */
  unregister(routeId) {
    delete this.routes[routeId];
    if (this.current === routeId) {
      this.navigate(this.defaultRoute, { replace: true });
    }
  }

  /**
   * Returns list of all registered route ids.
   */
  getRoutes() {
    return Object.keys(this.routes);
  }
}

export default Router;
