// components/VoiceVisualizer.jsx
// Gives the artist's VOICE its own visual, separate from the beat-driven
// starfield/web: a trail of the last few seconds of singing, drawn across
// the middle of the screen from what lib/voiceAnalysis.js follows
// (window.__voiceFrame). Meant to be readable without hearing it:
//   - height      = the sung pitch, so a melody visibly rises, falls, slides,
//                   holds, and shimmers with vibrato
//   - thickness   = how strongly it's sung — syllables, swells, fades
//   - color       = the vowel: cool and deep for "oo"/"oh", warm and bright
//                   for "ah"/"ee"
//   - sparkle     = breath and consonants ("s", "sh", "t")
// A glowing head marks "now"; older singing drifts left and fades. Between
// phrases the trail simply goes dark rather than inventing motion.
//
// Three styles, picked from the visualizer controls, all drawing that same
// trail:
//   - "strands":   a braided ribbon of fine lines
//   - "particles": a twisting ribbon of dots
//   - "harmonics": the voice's actual overtones as stacked contour lines —
//                  which ones glow shows the timbre of each vowel
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

const SAMPLES = 270; // ~4.5s of trail at 60fps
const HARMS = 12;
const DRAWN_HARMONICS = 8;

// Two palettes, blended by vowel brightness. Each is [back, front] hues.
// Hues may run past 360 on purpose: blends are linear, so cyan (190) to
// amber (378 = 18) travels through violet and magenta instead of green.
const DARK_VOWEL = [265, 190]; // violet, cyan
const BRIGHT_VOWEL = [378, 325]; // amber, rose

// Hue drift along the trail for the dotted ribbon, oldest -> newest
// (cyan, violet, magenta, orange, gold)
const TRAIL_HUES = [190, 265, 320, 380, 410];

// Unwrapped (190..410) so blends with it stay on the violet/magenta side too
function trailHue(u) {
  const p = u * (TRAIL_HUES.length - 1);
  const i = Math.min(TRAIL_HUES.length - 2, Math.floor(p));
  return TRAIL_HUES[i] + (TRAIL_HUES[i + 1] - TRAIL_HUES[i]) * (p - i);
}

// Linear hue blend (see DARK_VOWEL/BRIGHT_VOWEL for why not shortest-path)
function mixHue(a, b, t) {
  return (a + (b - a) * t) % 360;
}

// Cheap deterministic noise so breath sparkle doesn't shimmer randomly per frame
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
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

    // Trail ring buffers. `head` is the index of the newest sample.
    const logPitch = new Float32Array(SAMPLES); // log2(Hz), raw — normalized at draw time
    const loud = new Float32Array(SAMPLES);
    const voiced = new Float32Array(SAMPLES);
    const bright = new Float32Array(SAMPLES);
    const breath = new Float32Array(SAMPLES);
    const harm = new Float32Array(SAMPLES * HARMS);
    let head = 0;
    let filled = 0;
    let serial = 0; // total samples ever pushed, for stable per-sample noise

    // The singer's range, so a melody that moves a few notes still fills
    // the space. Expands immediately to include a new note, relaxes back
    // slowly, and never gets narrower than 3/4 of an octave.
    let rangeLo = Math.log2(160);
    let rangeHi = Math.log2(480);

    let style = readStoredStyle();
    let raf = null;
    let active = false;
    let t = 0;

    const push = () => {
      const f = window.__voiceFrame;
      head = (head + 1) % SAMPLES;
      filled = Math.min(SAMPLES, filled + 1);
      serial++;
      const lastPitch = logPitch[(head - 1 + SAMPLES) % SAMPLES];
      if (f && f.pitch > 0) {
        logPitch[head] = Math.log2(f.pitch);
        loud[head] = f.loudness;
        voiced[head] = f.voiced;
        // The analysis reports ~0.25 ("oo") to ~0.75 ("ee") in practice;
        // stretch that to the full palette so vowel changes are visible.
        bright[head] = Math.min(1, Math.max(0, (f.brightness - 0.25) / 0.5));
        breath[head] = f.breath;
        for (let h = 0; h < HARMS; h++) harm[head * HARMS + h] = f.harmonics[h];
        if (f.voiced > 0.5) {
          const lp = logPitch[head];
          rangeLo = lp < rangeLo ? rangeLo + (lp - 0.15 - rangeLo) * 0.3 : rangeLo + (lp - 0.5 - rangeLo) * 0.002;
          rangeHi = lp > rangeHi ? rangeHi + (lp + 0.15 - rangeHi) * 0.3 : rangeHi + (lp + 0.5 - rangeHi) * 0.002;
        }
      } else {
        logPitch[head] = lastPitch || Math.log2(260);
        loud[head] = 0;
        voiced[head] = 0;
        bright[head] = bright[(head - 1 + SAMPLES) % SAMPLES];
        breath[head] = f ? f.breath : 0;
        for (let h = 0; h < HARMS; h++) harm[head * HARMS + h] = 0;
      }
      if (rangeHi - rangeLo < 0.75) {
        const mid = (rangeHi + rangeLo) / 2;
        rangeLo = mid - 0.375;
        rangeHi = mid + 0.375;
      }
    };

    // Geometry for the sample `age` frames old (0 = newest).
    const left = () => W * 0.05;
    const headX = () => W * 0.78;
    const xAt = (age) => headX() - (age / (SAMPLES - 1)) * (headX() - left());
    const yOf = (lp) => {
      const n = (lp - rangeLo) / (rangeHi - rangeLo); // 0 low .. 1 high
      return H * 0.5 + (0.5 - n) * H * 0.6;
    };
    const idx = (age) => (head - age + SAMPLES) % SAMPLES;

    // Soft luminous body along the pitch line, under the detailed layers
    const drawGlow = () => {
      const STEP = 3;
      ctx.lineCap = "round";
      for (let age = filled - 1; age >= STEP; age -= STEP) {
        const a1 = age - STEP;
        const i1 = idx(a1);
        if (voiced[i1] < 0.02) continue;
        const fade = Math.pow(1 - a1 / SAMPLES, 0.9);
        const hue = mixHue(DARK_VOWEL[1], BRIGHT_VOWEL[0], bright[i1]);
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, ${voiced[i1] * (0.015 + 0.05 * loud[i1]) * fade})`;
        ctx.lineWidth = H * (0.008 + 0.06 * loud[i1]);
        ctx.beginPath();
        let started = false;
        for (let age2 = age; age2 >= a1; age2--) {
          if (voiced[idx(age2)] < 0.05) continue;
          const x = xAt(age2);
          const y = yOf(logPitch[idx(age2)]);
          started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          started = true;
        }
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    };

    const drawStrands = () => {
      const LINES = 9;
      const STEP = 3; // samples per stroke segment (color changes per segment)
      const n = filled;
      drawGlow();
      for (let m = 0; m < LINES; m++) {
        const f = m / (LINES - 1);
        for (let age = n - 1; age >= STEP; age -= STEP) {
          const a0 = age, a1 = age - STEP;
          const i1 = idx(a1);
          const presence = voiced[i1];
          if (presence < 0.02) continue;
          const fade = Math.pow(1 - a1 / SAMPLES, 0.9);
          const alpha = presence * (0.3 + 0.7 * loud[i1]) * fade * (0.4 + 0.6 * f);
          if (alpha < 0.01) continue;
          const pal = [
            mixHue(DARK_VOWEL[0], BRIGHT_VOWEL[0], bright[i1]),
            mixHue(DARK_VOWEL[1], BRIGHT_VOWEL[1], bright[i1]),
          ];
          ctx.strokeStyle = `hsla(${mixHue(pal[0], pal[1], f)}, 90%, ${58 + f * 14}%, ${alpha})`;
          ctx.lineWidth = m === LINES - 1 ? 2.4 : 1.2;
          ctx.beginPath();
          let started = false;
          for (let age2 = a0; age2 >= a1; age2--) {
            const i = idx(age2);
            // Don't connect back to the previous phrase's last note
            if (voiced[i] < 0.05) continue;
            const th = H * (0.006 + 0.08 * loud[i]);
            // Strands braid around the pitch line; the braid drifts slowly
            // along the trail so held notes still feel alive.
            const phase = m * 0.7 + (serial - age2) * 0.045 - t * (reducedMotion ? 0.3 : 0.9);
            const fray = breath[i] * H * 0.012 * (hash((serial - age2) * 13 + m) - 0.5);
            const y = yOf(logPitch[i]) + Math.sin(phase) * th + fray;
            const x = xAt(age2);
            started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            started = true;
          }
          ctx.stroke();
        }
      }
    };

    const drawParticles = () => {
      const ROWS = 7;
      drawGlow();
      for (let age = filled - 1; age >= 0; age--) {
        const i = idx(age);
        const presence = voiced[i];
        const fade = Math.pow(1 - age / SAMPLES, 0.9);
        const x0 = xAt(age);
        const yc = yOf(logPitch[i]);
        const u = 1 - age / (SAMPLES - 1);
        // Trail hue, pulled toward amber for bright vowels or deep blue for dark ones
        const hue = mixHue(trailHue(u), bright[i] > 0.5 ? 390 : 230, Math.min(1, Math.abs(bright[i] - 0.5) * 1.2));
        if (presence > 0.02) {
          const th = H * (0.008 + 0.075 * loud[i]);
          for (let r = 0; r < ROWS; r++) {
            // Rows wrap around the pitch line like a twisting ribbon.
            const phi = (r / (ROWS - 1)) * Math.PI + (serial - age) * 0.05 - t * (reducedMotion ? 0.2 : 0.6);
            const depth = 0.5 + 0.5 * Math.sin(phi);
            const y = yc + Math.cos(phi) * th;
            const x = x0 + Math.sin(phi) * 3;
            const rad = (0.7 + depth * 1.5) * (0.6 + loud[i] * 0.9);
            const alpha = presence * (0.3 + 0.7 * depth) * (0.4 + 0.6 * loud[i]) * fade;
            ctx.fillStyle = `hsla(${hue}, 85%, ${52 + depth * 22}%, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Breath: a loose spray of fine dots around the line
        const sprays = Math.floor(breath[i] * 4);
        for (let s = 0; s < sprays; s++) {
          const k = (serial - age) * 7 + s;
          const y = yc + (hash(k) - 0.5) * H * 0.09;
          const x = x0 + (hash(k + 3) - 0.5) * 8;
          ctx.fillStyle = `hsla(${hue}, 60%, 85%, ${0.35 * breath[i] * fade})`;
          ctx.fillRect(x, y, 1.2, 1.2);
        }
      }
    };

    const drawHarmonics = () => {
      const gap = H * 0.03;
      const STEP = 3;
      for (let h = 0; h < DRAWN_HARMONICS; h++) {
        const hue = (300 + h * 40) % 360; // magenta, red, orange, gold, green, teal, blue, violet
        for (const side of [-1, 1]) {
          for (let age = filled - 1; age >= STEP; age -= STEP) {
            const a1 = age - STEP;
            const i1 = idx(a1);
            // Square root so quieter upper overtones still read — they're
            // what distinguishes one vowel's timbre from another.
            const strength = Math.sqrt(harm[i1 * HARMS + h]);
            const presence = voiced[i1];
            if (presence < 0.02 || strength < 0.15) continue;
            const fade = Math.pow(1 - a1 / SAMPLES, 0.9);
            const alpha = presence * (0.15 + 0.85 * strength) * (0.4 + 0.6 * loud[i1]) * fade * (side < 0 ? 1 : 0.5);
            ctx.strokeStyle = `hsla(${hue}, 90%, ${60 + strength * 15}%, ${alpha})`;
            ctx.lineWidth = 0.6 + strength * 2.2 * (side < 0 ? 1 : 0.6);
            ctx.beginPath();
            let started = false;
            for (let age2 = age; age2 >= a1; age2--) {
              const i = idx(age2);
              if (voiced[i] < 0.05) continue;
              // Overtones stack above the note and mirror more tightly below;
              // they spread apart as the voice gets stronger.
              const spread = gap * (0.6 + loud[i] * 0.8) * (side < 0 ? 1 : 0.55);
              const y = yOf(logPitch[i]) + side * h * spread;
              const x = xAt(age2);
              started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
              started = true;
            }
            ctx.stroke();
          }
        }
      }
    };

    const drawHead = () => {
      const i = idx(0);
      const presence = voiced[i];
      if (presence < 0.02) return;
      const x = headX();
      const y = yOf(logPitch[i]);
      const r = H * (0.012 + 0.05 * loud[i]);
      const hue = mixHue(DARK_VOWEL[1], BRIGHT_VOWEL[1], bright[i]);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${hue}, 100%, 88%, ${0.55 * presence})`);
      g.addColorStop(0.35, `hsla(${hue}, 100%, 65%, ${0.25 * presence})`);
      g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = () => {
      push();
      t += 1 / 60;

      ctx.clearRect(0, 0, W, H);
      if (style !== "off") {
        ctx.globalCompositeOperation = "lighter";
        if (style === "strands") drawStrands();
        else if (style === "particles") drawParticles();
        else if (style === "harmonics") drawHarmonics();
        drawHead();
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
      filled = 0;
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
