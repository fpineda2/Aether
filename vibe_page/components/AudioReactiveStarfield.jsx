// AudioReactiveStarfield.jsx
// The spiderweb IS the visualizer: each web node ("star"/dot) reacts to a
// frequency band like a spectrum bar, the connecting strings pulse in reaction
// to the dots they link, and the whole web breathes outward together on the beat.
//
// Consumes globals published elsewhere:
//   window.__starsData / __webData  (from app/layout.js)
//   window.__audioFreq              (live FFT array, from lib/audioReactive.js)
// Canvas ids: "starfield-bg" / "spiderweb-bg".
//
// PHOTOSENSITIVITY SAFETY NOTES
// ------------------------------
// The per-node/per-string pulses below are small-area and not a "flash" in
// the WCAG 2.3.1 sense. The full-canvas radial "beat pulse" (`flash`) is a
// large-area luminance change and IS the kind of thing that trips general
// flash / red flash thresholds if it fires too often, too brightly, or too
// red. Three guards keep it under the WCAG "no more than 3 flashes/sec"
// general threshold and away from the red flash threshold:
//   1. FLASH_MIN_INTERVAL_MS rate-limits how often the global flash can
//      re-trigger, independent of how often beats are detected.
//   2. Hue is clamped so the "loud" end of the ramp is a deep orange, never
//      pure/saturated red.
//   3. The flash's screen coverage and peak opacity are both capped lower,
//      and it's skipped entirely for prefers-reduced-motion users.
"use client";

import { useEffect } from "react";

const FLASH_MIN_INTERVAL_MS = 340; // caps the global flash under ~3/sec (WCAG general flash threshold)
const FLASH_MAX = 0.75; // was 1.2 — smaller peak swing in overall brightness
const FLASH_RADIUS_FRACTION = 0.55; // was 0.8 — flash no longer washes the whole viewport
const HUE_CALM = 140; // green
const HUE_LOUD = 26; // deep orange — stays well clear of the 0–10deg red-flash danger zone

// The web's own color (shared across every node/string, not the flash) is
// driven by the spectral centroid — where the music's energy is currently
// centered, bass-heavy through treble-heavy — mapped across the full red
// (bass) to violet (treble) range, unlike the flash's clamped range above.
// Safe to use red/small hue values here since this is a per-node/per-string
// small-area color, not the large-area flash the WCAG concern above is
// actually about (see PHOTOSENSITIVITY SAFETY NOTES at the top of the file).
const WEB_HUE_START = 0; // red — bass-heavy
const WEB_HUE_END = 280; // violet — treble-heavy

// The four .cosmic-gradient blobs each track a different slice of the
// spectrum — sub-bass through treble — so they breathe independently
// instead of in lockstep, like a speaker/equalizer visualization rather
// than one uniform pulse.
const BLOB_BANDS = [
  [1, 24], // sub-bass/bass — same band beat detection itself watches
  [24, 80], // low-mid
  [80, 160], // high-mid
  [160, 256], // treble
];

function bandAverage(freq, lo, hi) {
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += freq[i];
  return sum / (hi - lo) / 255; // 0..1
}

// Each blob gets its own attack/decay envelope — same idea as a real
// instrument section: bass swells in slowly and lingers, treble flicks in
// fast and drops out quickly. Index-matched to BLOB_BANDS/--blobN below.
const BLOB_ENVELOPES = [
  { attack: 0.12, decay: 0.045 }, // bass
  { attack: 0.20, decay: 0.08 }, // low-mid
  { attack: 0.32, decay: 0.13 }, // high-mid
  { attack: 0.50, decay: 0.20 }, // treble
];

export default function AudioReactiveStarfield() {
  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let intensity = 0; // smoothed sustained energy
    let flash = 0; // global beat pulse (whole web breathes together)
    let hue = HUE_CALM; // flash's clamped mood hue — unchanged, still photosensitivity-safe
    let webHue = HUE_CALM; // web's own uniform hue, eased toward the current spectral centroid
    let colorEnergy = 0;
    let lastFlashAt = 0;
    let animationFrame = null;
    const blobPulse = [0, 0, 0, 0]; // per-blob eased level, see pulseCosmicGradient below
    const blobPan = [0, 0, 0, 0]; // per-blob eased L/R balance, -1 (hard left) .. 1 (hard right)

    // Ambient background glow: four soft radial blobs, each eased toward a
    // target driven by its own frequency band (falls back to overall
    // `intensity` before any spectrum data exists — same fallback the
    // spiderweb nodes use below), with its own attack/decay envelope so the
    // four read as separate voices layered together — bass swelling in
    // slowly and lingering, treble flicking in fast and dropping out quick
    // — rather than one uniform pulse. Colors are untouched, straight from
    // the CSS in globals.css. Skipped entirely under reduced-motion, same
    // policy as the full-screen flash.
    const pulseCosmicGradient = () => {
      if (reducedMotion) return;
      const el = document.querySelector(".cosmic-gradient");
      if (!el) return;

      const freq = window.__audioFreq;
      const freqL = window.__audioFreqL;
      const freqR = window.__audioFreqR;
      const hasStereo = freqL && freqL.length && freqR && freqR.length;

      for (let i = 0; i < 4; i++) {
        const [lo, hi] = BLOB_BANDS[i];
        const band = freq && freq.length ? bandAverage(freq, lo, hi) : intensity;
        const target = Math.min(1, band * 0.9 + flash * 0.6);
        const { attack, decay } = BLOB_ENVELOPES[i];
        const rate = target > blobPulse[i] ? attack : decay;
        blobPulse[i] += (target - blobPulse[i]) * rate;
        el.style.setProperty(`--blob${i + 1}-scale`, (1 + blobPulse[i] * 0.22).toFixed(3));
        el.style.setProperty(`--blob${i + 1}-alpha`, (0.55 + blobPulse[i] * 0.9).toFixed(3));

        // Surround cue: this band's own L/R imbalance gently drifts its blob
        // toward whichever side it's actually panned to. Silent/mono/dead-
        // center content naturally settles back to 0 (no drift) — this only
        // shows up when the track genuinely has something to show.
        let panTarget = 0;
        if (hasStereo) {
          const l = bandAverage(freqL, lo, hi);
          const r = bandAverage(freqR, lo, hi);
          panTarget = (l + r) > 0.02 ? (r - l) / (l + r) : 0;
        }
        blobPan[i] += (panTarget - blobPan[i]) * 0.06;
        el.style.setProperty(`--blob${i + 1}-x`, (blobPan[i] * 7).toFixed(2) + "%");
      }
    };

    const pulseEffects = () => {
      const starCanvas = document.getElementById("starfield-bg");
      const webCanvas = document.getElementById("spiderweb-bg");

      const e = Math.min(1, Math.max(0, colorEnergy));
      hue = HUE_CALM - (HUE_CALM - HUE_LOUD) * e;

      const freq = window.__audioFreq; // Uint8Array | undefined

      // ---- BACKGROUND STARS: gentle twinkle + swell (kept calm) ----
      if (starCanvas && window.__starsData) {
        const sc = starCanvas.getContext("2d");
        const W = starCanvas.width;
        const H = starCanvas.height;
        const stars = window.__starsData;
        sc.clearRect(0, 0, W, H);
        sc.globalCompositeOperation = "lighter";
        for (const st of stars) {
          st.a += st.s;
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.a));
          const swell = 1 + intensity * 1.6 + flash * 1.2;
          const size = st.r * swell;
          const alpha = Math.min(1, twinkle * (0.4 + intensity * 0.7 + flash * 0.5));
          sc.beginPath();
          sc.arc(st.x, st.y, size, 0, Math.PI * 2);
          sc.fillStyle = `hsla(${hue}, 100%, 80%, ${alpha})`;
          sc.fill();
        }
        sc.globalCompositeOperation = "source-over";
      }

      // ---- SPIDERWEB: nodes = spectrum, strings pulse with them ----
      if (webCanvas && window.__webData) {
        const ctx = webCanvas.getContext("2d");
        const { width, height, particles, mouse } = window.__webData;
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const n = particles.length;

        // Subtle full-screen beat pulse — the whole web brightens as one.
        // Skipped entirely for prefers-reduced-motion; capped/rate-limited
        // for everyone else (see PHOTOSENSITIVITY SAFETY NOTES above).
        if (!reducedMotion && flash > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(
            cx, cy, 0, cx, cy, Math.max(width, height) * FLASH_RADIUS_FRACTION
          );
          g.addColorStop(0, `hsla(${hue}, 100%, 62%, ${0.1 * flash})`);
          g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = "source-over";
        }

        // Per-node amplitude from its frequency band, and a display position
        // pushed outward by (its own band) + (the global beat) = unison pulse.
        const PER = 16; // how far a node bounces on its own frequency
        const GLOBAL = reducedMotion ? 18 : 46; // how far the whole web expands together on a beat
        const binLo = 2, binHi = 170; // musical slice of the spectrum
        const pts = new Array(n);

        // The web's shared color: find the spectral centroid — where the
        // music's energy is currently centered across the musical range —
        // and ease webHue toward that position's red(bass)-to-violet(treble)
        // mapping. A bass-heavy passage drifts the whole web red; a bright,
        // treble-heavy one drifts it toward violet. Eased slowly so it reads
        // as the web's color actually moving, not flickering.
        if (freq && freq.length) {
          let weighted = 0;
          let total = 0;
          for (let i = binLo; i < binHi; i++) {
            weighted += freq[i] * i;
            total += freq[i];
          }
          if (total > 4) {
            const centroidFrac = (weighted / total - binLo) / (binHi - binLo);
            const target = WEB_HUE_START + centroidFrac * (WEB_HUE_END - WEB_HUE_START);
            webHue += (target - webHue) * 0.04;
          }
        }

        for (let i = 0; i < n; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;

          let a;
          if (freq && freq.length) {
            const bin = binLo + Math.floor((i / n) * (binHi - binLo));
            a = freq[bin] / 255;
          } else {
            a = intensity; // fallback before any spectrum data exists
          }

          let dx = p.x - cx;
          let dy = p.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          const push = a * PER + flash * GLOBAL;
          pts[i] = { x: p.x + (dx / d) * push, y: p.y + (dy / d) * push, a };
        }

        ctx.globalCompositeOperation = "lighter";
        const light = 60 + intensity * 22 + flash * 16;

        // strings first — brightness/thickness driven by the two nodes they link
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const dx = pts[i].x - pts[j].x;
            const dy = pts[i].y - pts[j].y;
            const dist = Math.hypot(dx, dy);
            if (dist < 150) {
              const pair = (pts[i].a + pts[j].a) * 0.5;
              const alpha = (1 - dist / 150) * (0.18 + pair * 0.7 + flash * 0.3);
              ctx.strokeStyle = `hsla(${webHue}, 100%, ${light}%, ${alpha})`;
              ctx.lineWidth = 0.5 + pair * 2.2 + flash * 1.5;
              ctx.beginPath();
              ctx.moveTo(pts[i].x, pts[i].y);
              ctx.lineTo(pts[j].x, pts[j].y);
              ctx.stroke();
            }
          }
        }

        // nodes on top — each one a little spectrum bar rendered as a dot
        for (let i = 0; i < n; i++) {
          const a = pts[i].a;
          const ps = 1.4 + a * 5.5 + flash * 2;
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, ps, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${webHue}, 100%, ${62 + a * 25}%, ${0.5 + a * 0.5})`;
          ctx.fill();

          if (mouse.x != null && mouse.y != null) {
            const mdx = pts[i].x - mouse.x;
            const mdy = pts[i].y - mouse.y;
            const md = Math.hypot(mdx, mdy);
            if (md < 150) {
              ctx.strokeStyle = `hsla(${webHue}, 100%, ${light}%, ${
                (1 - md / 150) * (0.22 + a * 0.5)
              })`;
              ctx.lineWidth = 0.6 + a * 1.5;
              ctx.beginPath();
              ctx.moveTo(pts[i].x, pts[i].y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.stroke();
            }
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      pulseCosmicGradient();

      // decays
      intensity *= 0.9;
      flash *= 0.86;
      colorEnergy *= 0.96;

      // Stop scheduling frames while the tab is hidden; handleVisibilityChange
      // below resumes it if audio-reactive mode is still active when it's shown again.
      animationFrame = document.hidden ? null : requestAnimationFrame(pulseEffects);
    };

    const handleAudioPulse = (event) => {
      const d = event.detail || {};
      const inc = typeof d.intensity === "number" ? d.intensity : 0;
      const beat = !!d.beat;
      const level = typeof d.bassLevel === "number" ? d.bassLevel : inc;
      window.__audioReactiveActive = true;

      if (beat) {
        const strength = typeof d.beatStrength === "number" ? d.beatStrength : 0.4;
        intensity = Math.max(intensity, Math.max(0.85, inc));

        // Rate-limit the GLOBAL flash independent of beat-detection frequency,
        // so a fast/busy track can't push the full-screen pulse past ~3/sec.
        // Per-node reactivity above still tracks every detected beat — only
        // the large-area flash is throttled.
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (!reducedMotion && now - lastFlashAt > FLASH_MIN_INTERVAL_MS) {
          lastFlashAt = now;
          flash = Math.min(FLASH_MAX, flash + 0.55);
        }

        colorEnergy = Math.min(1, colorEnergy + strength * 0.4);
      } else {
        intensity += (inc - intensity) * 0.35;
      }

      // Continuously follow bass loudness every frame (not just on detected
      // beat onsets, which are rare) so hue actually tracks intensity instead
      // of decaying back to green between beats.
      colorEnergy += (level - colorEnergy) * 0.12;

      if (!animationFrame) pulseEffects();
    };

    const handleStop = () => {
      window.__audioReactiveActive = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      intensity = 0;
      flash = 0;
      colorEnergy = 0;
      webHue = HUE_CALM;
      blobPulse.fill(0);
      blobPan.fill(0);
      const el = document.querySelector(".cosmic-gradient");
      if (el) {
        for (let i = 1; i <= 4; i++) {
          el.style.setProperty(`--blob${i}-scale`, "1");
          el.style.setProperty(`--blob${i}-alpha`, "1");
          el.style.setProperty(`--blob${i}-x`, "0%");
        }
      }
    };

    function handleVisibilityChange() {
      if (!document.hidden && window.__audioReactiveActive && !animationFrame) {
        pulseEffects();
      }
    }

    window.addEventListener("audio-pulse", handleAudioPulse);
    window.addEventListener("stop-audio-reactive", handleStop);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("audio-pulse", handleAudioPulse);
      window.removeEventListener("stop-audio-reactive", handleStop);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.__audioReactiveActive = false;
    };
  }, []);

  return null;
}