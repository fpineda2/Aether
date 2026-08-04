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

export default function AudioReactiveStarfield() {
  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let intensity = 0; // smoothed sustained energy
    let flash = 0; // global beat pulse (whole web breathes together)
    let hue = HUE_CALM;
    let colorEnergy = 0;
    let lastFlashAt = 0;
    let animationFrame = null;

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
              ctx.strokeStyle = `hsla(${hue}, 100%, ${light}%, ${alpha})`;
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
          ctx.fillStyle = `hsla(${hue}, 100%, ${62 + a * 25}%, ${0.5 + a * 0.5})`;
          ctx.fill();

          if (mouse.x != null && mouse.y != null) {
            const mdx = pts[i].x - mouse.x;
            const mdy = pts[i].y - mouse.y;
            const md = Math.hypot(mdx, mdy);
            if (md < 150) {
              ctx.strokeStyle = `hsla(${hue}, 100%, ${light}%, ${
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

      // decays
      intensity *= 0.9;
      flash *= 0.86;
      colorEnergy *= 0.96;

      animationFrame = requestAnimationFrame(pulseEffects);
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
    };

    window.addEventListener("audio-pulse", handleAudioPulse);
    window.addEventListener("stop-audio-reactive", handleStop);
    return () => {
      window.removeEventListener("audio-pulse", handleAudioPulse);
      window.removeEventListener("stop-audio-reactive", handleStop);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.__audioReactiveActive = false;
    };
  }, []);

  return null;
}