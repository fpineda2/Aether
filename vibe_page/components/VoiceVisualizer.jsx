// components/VoiceVisualizer.jsx
// Gives the artist's VOICE its own visual, separate from the beat-driven
// starfield/web: a horizontal ribbon across the middle of the screen whose
// shape is sculpted by the vocal-range energy lib/audioReactive.js isolates
// (window.__voiceBands — six log-spaced slices of ~180Hz–4kHz, weighted
// toward center-panned content, which is where lead vocals live).
//
// Three styles, picked from the visualizer controls:
//   - "strands":   layered lines fanning out like a sound ribbon
//   - "particles": a twisting 3D ribbon drawn as dots
//   - "harmonics": mirrored bell-shaped bumps, one per vocal band
//   - "off"
// The choice arrives as a `voice-style` CustomEvent and is remembered per
// browser in localStorage.
//
// Same architecture as AudioReactiveStarfield: its own fixed canvas, direct
// canvas writes per frame, no React state, starts on `audio-pulse`, stops on
// `stop-audio-reactive`, and pauses while the tab is hidden. It's mounted in
// app/layout.js rather than next to the controls because the controls live
// inside FocusModeWrapper, which hides with display:none — this has to keep
// drawing precisely when everything else is hidden.
"use client";

import { useEffect } from "react";

export const VOICE_STYLES = ["strands", "particles", "harmonics", "off"];
export const VOICE_STYLE_KEY = "aether.voiceStyle";

// Per-band attack/decay: syllables should bloom in fast but release a little
// slower, so the ribbon reads as a sung phrase instead of flickering noise.
const ATTACK = 0.35;
const DECAY = 0.08;

// Spatial frequency (cycles across the ribbon) each vocal band contributes —
// low voice = broad swells, high voice = tighter ripples.
const BAND_CYCLES = [1.2, 2.1, 3.2, 4.6, 6.4, 8.5];

// Hue stops across the ribbon, left -> right (cyan, violet, magenta, orange, gold)
const RIBBON_HUES = [190, 265, 320, 380, 410];

function ribbonHue(u) {
  const p = u * (RIBBON_HUES.length - 1);
  const i = Math.min(RIBBON_HUES.length - 2, Math.floor(p));
  const h = RIBBON_HUES[i] + (RIBBON_HUES[i + 1] - RIBBON_HUES[i]) * (p - i);
  return h % 360;
}

// Tapers the ribbon to a point at both ends, like the reference images.
function taper(u) {
  return Math.pow(Math.sin(Math.PI * u), 1.6);
}

function readStoredStyle() {
  try {
    const s = localStorage.getItem(VOICE_STYLE_KEY);
    return VOICE_STYLES.includes(s) ? s : "strands";
  } catch (e) {
    return "strands";
  }
}

export default function VoiceVisualizer() {
  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.id = "voice-bg";
    Object.assign(canvas.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: "-1", // above the web (-2), still behind page content
      pointerEvents: "none",
    });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let style = readStoredStyle();
    let raf = null;
    let active = false;
    let t = 0;
    let presence = 0; // eased overall vocal level, drives global amplitude/brightness
    let peak = 0.15; // slow-following loudness ceiling, auto-gain for quiet mixes
    const bands = new Float32Array(BAND_CYCLES.length);

    // Sum of each band's sine at position u, for strand/phase offset `off`.
    // Normalized by the bands' total so a full, loud voice reshapes the
    // ribbon rather than just blowing its height out — overall size is
    // `amp`'s job (driven by presence), this only decides the shape.
    const wave = (u, off) => {
      let y = 0;
      let total = 0.35;
      for (let k = 0; k < bands.length; k++) {
        y += bands[k] * Math.sin(2 * Math.PI * BAND_CYCLES[k] * u + t * (0.6 + k * 0.25) + off * (1 + k * 0.35));
        total += bands[k];
      }
      return y / total;
    };

    const drawStrands = (cy, amp, left, span) => {
      const LINES = 12;
      const STEPS = 160;
      for (let m = 0; m < LINES; m++) {
        const f = m / (LINES - 1); // 0 = back strand, 1 = front strand
        // back strands warm (orange), front strand cool (cyan). Mixed in RGB,
        // not by hue — sweeping the hue wheel from orange to cyan passes
        // through a muddy yellow-green on the middle strands.
        const r = Math.round(255 + (70 - 255) * f);
        const g = Math.round(110 + (220 - 110) * f);
        const b = Math.round(60 + (255 - 60) * f);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.25 + f * 0.65) * (0.4 + presence * 0.6)})`;
        ctx.lineWidth = m === LINES - 1 ? 2 : 1;
        ctx.beginPath();
        for (let s = 0; s <= STEPS; s++) {
          const u = s / STEPS;
          const y = cy + taper(u) * amp * wave(u, f * 1.4);
          const x = left + u * span + (1 - f) * 12; // slight stagger adds depth
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const drawParticles = (cy, amp, left, span) => {
      const LINES = 14;
      const STEPS = 150;
      const halfWidth = 0.3 + presence * 0.15; // ribbon width, relative to amp
      for (let m = 0; m < LINES; m++) {
        const across = (m / (LINES - 1)) * Math.PI; // position across the ribbon's width
        for (let s = 0; s <= STEPS; s++) {
          const u = s / STEPS;
          const env = taper(u);
          // A flat ribbon following the vocal waveform, twisting along its
          // length: where cos(phi) crosses zero the ribbon is seen edge-on
          // and pinches to a thread, like the reference image.
          const phi = across + u * 3 + t * 0.4;
          const depth = 0.5 + 0.5 * Math.sin(phi); // 0 = far, 1 = near
          const y = cy + env * amp * (wave(u, 0) + halfWidth * Math.cos(phi));
          const x = left + u * span + Math.sin(phi) * 10; // slant the dot rows for depth
          const r = (0.6 + depth * 1.3) * (0.6 + env * 0.6);
          ctx.fillStyle = `hsla(${ribbonHue(u)}, 85%, ${50 + depth * 22}%, ${(0.25 + depth * 0.7) * (0.35 + presence * 0.65)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawHarmonics = (cy, amp, left, span) => {
      const LAYERS = 10;
      const STEPS = 200;
      const K = bands.length;
      const grad = ctx.createLinearGradient(left, 0, left + span, 0);
      for (let i = 0; i < RIBBON_HUES.length; i++) {
        grad.addColorStop(i / (RIBBON_HUES.length - 1), `hsl(${RIBBON_HUES[i] % 360}, 90%, 65%)`);
      }
      ctx.strokeStyle = grad;
      for (let l = 1; l <= LAYERS; l++) {
        const scale = l / LAYERS;
        ctx.globalAlpha = (0.15 + scale * 0.6) * (0.35 + presence * 0.65);
        ctx.lineWidth = l === LAYERS ? 1.6 : 0.8;
        for (const dir of [-1, 0.55]) { // tall bumps above the axis, shorter mirror below
          ctx.beginPath();
          for (let s = 0; s <= STEPS; s++) {
            const u = s / STEPS;
            let y = 0;
            for (let k = 0; k < K; k++) {
              const c = (k + 0.5) / K;
              const g = Math.exp(-Math.pow((u - c) * K * 3.6, 2)); // narrow: distinct bumps, flat axis between
              // a gentle breathing sway so the bumps don't sit frozen between syllables
              y += g * (bands[k] + 0.02) * (0.85 + 0.15 * Math.sin(t * 1.3 + k));
            }
            const x = left + u * span;
            const yy = cy + dir * y * amp * 0.9 * scale;
            s === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = () => {
      const src = window.__voiceBands;
      const level = window.__voiceLevel || 0;
      peak = Math.max(level, peak * 0.997, 0.08);
      const gain = 1 / peak;
      for (let k = 0; k < bands.length; k++) {
        const target = src ? Math.min(1.2, src[k] * gain) : 0;
        bands[k] += (target - bands[k]) * (target > bands[k] ? ATTACK : DECAY);
      }
      const p = Math.min(1, level * gain);
      presence += (p - presence) * (p > presence ? 0.2 : 0.05);
      t += reducedMotion ? 0.012 : 0.03;

      ctx.clearRect(0, 0, W, H);
      if (style !== "off") {
        const left = W * 0.06;
        const span = W * 0.88;
        const cy = H * 0.5;
        // small idle amplitude keeps a living thread on screen between phrases
        const amp = H * (0.05 + presence * 0.2);
        ctx.globalCompositeOperation = "lighter";
        if (style === "strands") drawStrands(cy, amp, left, span);
        else if (style === "particles") drawParticles(cy, amp, left, span);
        else if (style === "harmonics") drawHarmonics(cy, amp, left, span);
        ctx.globalCompositeOperation = "source-over";
      }

      raf = active && !document.hidden ? requestAnimationFrame(frame) : null;
    };

    const onPulse = () => {
      active = true;
      if (!raf) frame();
    };
    const onStop = () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      bands.fill(0);
      presence = 0;
      ctx.clearRect(0, 0, W, H);
    };
    const onStyle = (e) => {
      if (VOICE_STYLES.includes(e.detail)) style = e.detail;
    };
    const onVisibility = () => {
      if (!document.hidden && active && !raf) frame();
    };

    window.addEventListener("audio-pulse", onPulse);
    window.addEventListener("stop-audio-reactive", onStop);
    window.addEventListener("voice-style", onStyle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("audio-pulse", onPulse);
      window.removeEventListener("stop-audio-reactive", onStop);
      window.removeEventListener("voice-style", onStyle);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, []);

  return null;
}
