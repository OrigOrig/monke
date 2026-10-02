# typeflow

> A modern, minimal typing test. Built with vanilla web standards, zero build step, zero tracking, zero server.

**Live demo:** _coming soon — deploy to Cloudflare Pages in 2 minutes (see below)_

---

## ✨ What is this?

`typeflow` is a fully client-side typing test inspired by the minimalist aesthetic of tools like Monkeytype, but built from scratch with its own visual identity, motion language, and feature set.

Everything runs in the browser. Your test history, settings, and personal bests live in your device's `localStorage` and `IndexedDB` — nothing leaves your machine.

---

## 🚀 Features

### Test modes
- **Time** — 15 / 30 / 60 / 120 seconds, or a custom duration
- **Words** — 10 / 25 / 50 / 100 words
- **Quote** — short / medium / long / thicc lengths with source attributions
- **Zen** — unlimited free typing, `Shift+Enter` to finish
- **Custom** — paste your own text with pipe-delimiter grouping, shuffle, typography normalization

### Modifiers
- **Punctuation** — injects `. , ? ! ' " - ; :` into word streams
- **Numbers** — injects `0–9` into word streams
- **Difficulty** — `normal` (typos allowed) / `expert` (fail on wrong word submit) / `master` (fail on first wrong keypress)
- **Stop on Error** — `off` / `letter` lock / `word` lock
- **Blind Mode** — no correctness coloring while typing
- **Freedom Mode** — backspace past correct words
- **Funbox** — Mirror, Upside Down, Memory, Read Ahead, Morse Code

### Stats & results
- **WPM** — correct characters ÷ 5 ÷ minutes
- **Raw WPM** — includes errors
- **Accuracy** — correct keystrokes ÷ total keystrokes
- **Consistency** — coefficient of variation of raw WPM, mapped to 0–100%
- **Character breakdown** — correct / incorrect / extra / missed
- **Chart** — SVG WPM + raw + error markers over elapsed time
- **Replay log** — every keystroke captured with `[timestamp, char, expected, status]`
- **Personal bests** — tracked per mode, persisted in IndexedDB

### Themes
- **24 built-in themes** — Serika Dark/Light, Dracula, Nord, Cyberpunk, Matrix, Bento, Chalk Light, Tokyo Night, Catppuccin (Mocha/Latte), Gruvbox, Rosé Pine, Everforest, Kanagawa, Ayu, One Dark, Solarized, Monokai, GitHub, Material, Sunset, Botanical, Olivetti
- **Custom accent color** — pick any hex, hover/dim/glow variants generated live
- **Import/export** — copy a theme as JSON to share

### Caret
- **Styles** — line / smooth line / block / underline / off
- **Blink** — toggleable pulse when idle
- **Idle breathing** — subtle glow after 1.5s of inactivity

### Sound
- **Pure Web Audio API** — no MP3s, no external assets, 100% synthesized
- **4 profiles** — thock / click / typewriter / beep
- **Volume control** + live preview
- **Error sounds** + finish chimes

### Command palette
- Trigger with `Esc` or `Ctrl/Cmd + Shift + P`
- **~70 commands** — modes, times, word counts, difficulty, themes, funbox, toggles, navigation
- **Fuzzy subsequence matching** with word-boundary bonuses
- **Live checkmarks** showing currently active setting
- **Arrow keys + Enter** to navigate without touching the mouse

### Persistence & privacy
- **Guest mode** — instant, zero-friction, no sign-up
- **IndexedDB** for test history (~1000 results)
- **localStorage** for settings + personal bests
- **No tracking, no analytics, no cookies, no server**

### Motion design
- Staggered word entry animation
- Letter press micro-interaction on every keystroke
- Error shake + combo pulse
- Caret smooth slide (spring easing) + idle breathing
- Results: number count-up, chart line draw-in, confetti on PB, badge stamp
- Command palette item stagger
- Skeleton shimmer on `— — —` placeholders
- Full `prefers-reduced-motion` support + manual toggle

---

## 🛠 Local Development

**No build step.** No `npm install`. No Node.js required (unless you want a local server).

### Option 1 — Python (built into macOS / Linux)
```bash
# From the project root
python3 -m http.server 8080
# Open http://localhost:8080
