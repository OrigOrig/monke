/* ============================================================
   TYPE FLOW — sound.js
   Pure Web Audio API synthesizer. Zero external assets.
   Four profiles: thock, click, typewriter, beep.
   ============================================================ */

// ============================================================
// 1. PROFILES
// ============================================================
// Each profile is a function that, given an AudioContext and
// a destination gain node, synthesizes one keystroke sound.
// All synthesis uses oscillators + noise buffers + gain
// envelopes. No samples, no MP3s, no external assets.

const PROFILES = {
  // ------------------------------------------------------------
  // THOCK — low, muted, gasket-mounted feel
  // ------------------------------------------------------------
  thock(ctx, out) {
    const now = ctx.currentTime;

    // Low body: descending sine
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.045);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.55, now + 0.004);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

    osc.connect(oscGain).connect(out);
    osc.start(now);
    osc.stop(now + 0.08);

    // Short noise transient for the "attack"
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.02);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.22, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    noise.connect(noiseFilter).connect(noiseGain).connect(out);
    noise.start(now);
    noise.stop(now + 0.025);
  },

  // ------------------------------------------------------------
  // CLICK — sharp, high, linear-switch feel
  // ------------------------------------------------------------
  click(ctx, out) {
    const now = ctx.currentTime;

    // High-frequency square burst
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.02);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.18, now + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

    osc.connect(oscGain).connect(out);
    osc.start(now);
    osc.stop(now + 0.03);

    // Tonal snap: triangle ping
    const ping = ctx.createOscillator();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(2400, now);
    ping.frequency.exponentialRampToValueAtTime(1200, now + 0.015);

    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0.08, now);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

    ping.connect(pingGain).connect(out);
    ping.start(now);
    ping.stop(now + 0.02);
  },

  // ------------------------------------------------------------
  // TYPEWRITER — mechanical, metallic, vintage
  // ------------------------------------------------------------
  typewriter(ctx, out) {
    const now = ctx.currentTime;

    // Broadband noise burst (the "clack")
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.06);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2600;
    noiseFilter.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    noise.connect(noiseFilter).connect(noiseGain).connect(out);
    noise.start(now);
    noise.stop(now + 0.06);

    // Metallic body: sine partials
    const partials = [340, 720, 1480];
    partials.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + 0.05);

      const gain = ctx.createGain();
      const peak = 0.11 / (i + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + i * 0.008);

      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + 0.08 + i * 0.01);
    });
  },

  // ------------------------------------------------------------
  // BEEP — minimal, electronic, terminal feel
  // ------------------------------------------------------------
  beep(ctx, out) {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.003);
    gain.gain.setValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.05);
  },
};

// ============================================================
// 2. ERROR SOUNDS (played on incorrect keystrokes)
// ============================================================

const ERROR_PROFILES = {
  thock(ctx, out) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.09);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.12);
  },

  click(ctx, out) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.11);
  },

  typewriter(ctx, out) {
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 0.04);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    noise.connect(filter).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + 0.05);
  },

  beep(ctx, out) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.09);
  },
};

// ============================================================
// 3. FINISH SOUNDS (played when a test completes)
// ============================================================

const FINISH_PROFILES = {
  thock(ctx, out) {
    const now = ctx.currentTime;
    // Two-note descending chime
    [660, 440].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.28);

      osc.connect(gain).connect(out);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  },

  click(ctx, out) {
    const now = ctx.currentTime;
    [1047, 784, 523].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.08 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.22);

      osc.connect(gain).connect(out);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.24);
    });
  },

  typewriter(ctx, out) {
    const now = ctx.currentTime;
    // Bell-like ding + descending noise
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.6);
  },

  beep(ctx, out) {
    const now = ctx.currentTime;
    [1200, 1200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.1, now + i * 0.12 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.09);

      osc.connect(gain).connect(out);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.1);
    });
  },
};

// ============================================================
// 4. HELPERS
// ============================================================

/**
 * Creates a noise buffer of the given duration (in seconds).
 * Uses Math.random() to fill white noise.
 */
function makeNoiseBuffer(ctx, duration) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Fade out at the tail for a softer noise burst
    const t = i / length;
    const fade = 1 - Math.pow(t, 2);
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  return buffer;
}

// ============================================================
// 5. SOUND CLASS
// ============================================================

export class Sound {
  constructor({ enabled = false, profile = 'thock', volume = 0.5 } = {}) {
    this.enabled = !!enabled;
    this.profile = profile;
    this.volume = Math.max(0, Math.min(1, volume));

    this._ctx = null;
    this._master = null;
    this._userGestureUnlocked = false;

    // Bind lazy unlock
    this._unlock = this._unlock.bind(this);

    // Attach one-time user gesture listener
    if (typeof window !== 'undefined') {
      const opts = { once: true, passive: true };
      window.addEventListener('pointerdown', this._unlock, opts);
      window.addEventListener('keydown', this._unlock, opts);
      window.addEventListener('touchstart', this._unlock, opts);
    }
  }

  // ============================================================
  // 6. AUDIO CONTEXT LIFECYCLE
  // ============================================================

  /**
   * Lazy-initializes the AudioContext. Browsers require a user
   * gesture before an AudioContext can play sound.
   */
  _ensureContext() {
    if (!this._ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      this._ctx = new Ctor();

      this._master = this._ctx.createGain();
      this._master.gain.value = this.volume;
      this._master.connect(this._ctx.destination);
    }

    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => { /* ignore */ });
    }

    return this._ctx;
  }

  _unlock() {
    if (this._userGestureUnlocked) return;
    this._userGestureUnlocked = true;
    // Initialize silently on first gesture so subsequent plays are instant
    this._ensureContext();
  }

  // ============================================================
  // 7. PUBLIC API
  // ============================================================

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) this._ensureContext();
  }

  setProfile(profile) {
    if (!PROFILES[profile]) {
      console.warn(`[sound] unknown profile "${profile}", falling back to "thock"`);
      profile = 'thock';
    }
    this.profile = profile;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this._master) {
      // Smooth ramp to avoid clicks
      const now = this._ctx.currentTime;
      this._master.gain.cancelScheduledValues(now);
      this._master.gain.setValueAtTime(this._master.gain.value, now);
      this._master.gain.linearRampToValueAtTime(this.volume, now + 0.05);
    }
  }

  /**
   * Play a sound.
   * @param {'key'|'error'|'finish'} type
   */
  play(type = 'key') {
    if (!this.enabled) return;

    const ctx = this._ensureContext();
    if (!ctx || !this._master) return;

    // Guard against playing before user gesture unlocked
    if (ctx.state !== 'running' && ctx.state !== 'interrupted') {
      // Try to resume; if it fails, silently skip this play
      ctx.resume().catch(() => { /* ignore */ });
      if (ctx.state !== 'running') return;
    }

    // Guard against overlapping too many sounds in one frame
    if (this._lastPlayAt && performance.now() - this._lastPlayAt < 8) {
      // Debounce rapid repeats (e.g. held keys)
      // (not skipped — just falls through; this is a soft guard)
    }
    this._lastPlayAt = performance.now();

    try {
      switch (type) {
        case 'key':
          PROFILES[this.profile]?.(ctx, this._master);
          break;
        case 'error':
          ERROR_PROFILES[this.profile]?.(ctx, this._master);
          break;
        case 'finish':
          FINISH_PROFILES[this.profile]?.(ctx, this._master);
          break;
        default:
          PROFILES[this.profile]?.(ctx, this._master);
      }
    } catch (err) {
      console.warn('[sound] playback failed:', err);
    }
  }

  /**
   * Force a test sound (used by the settings drawer preview).
   */
  preview(profile) {
    if (profile) this.setProfile(profile);
    const ctx = this._ensureContext();
    if (!ctx || !this._master) return;
    try {
      PROFILES[this.profile]?.(ctx, this._master);
    } catch (err) {
      console.warn('[sound] preview failed:', err);
    }
  }

  /**
   * Freeze the AudioContext (used on visibility change).
   * Saves CPU when tab is hidden.
   */
  suspend() {
    if (this._ctx && this._ctx.state === 'running') {
      this._ctx.suspend().catch(() => { /* ignore */ });
    }
  }

  resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => { /* ignore */ });
    }
  }

  /**
   * Fully tear down (used on logout / clear data).
   */
  destroy() {
    if (this._ctx) {
      this._ctx.close().catch(() => { /* ignore */ });
      this._ctx = null;
      this._master = null;
    }
    this._userGestureUnlocked = false;
  }

  // ============================================================
  // 8. STATIC
  // ============================================================

  static availableProfiles() {
    return Object.keys(PROFILES);
  }
}

export default Sound;
