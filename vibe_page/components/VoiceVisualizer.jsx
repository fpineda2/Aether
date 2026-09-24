// components/VoiceVisualizer.jsx
// Gives the artist's VOICE its own visual, separate from the beat-driven
// starfield/web. Each style shows the character of the voice as it sounds
// right now — a shape that breathes and changes with the singing — driven
// by what lib/voiceAnalysis.js follows (window.__voiceFrame): whether a
// voice is sounding, its pitch, how strongly it's sung, its vowel color,
// its overtones, and breath/consonants. Vibrato is measured here from the
// pitch's own wobble.
//
// Four styles, picked from the visualizer controls:
//   - "strands":   a tapered ribbon of layered lines. The front line is the
//                  voice now; each line behind it is the same ribbon a split
//                  second earlier, so a slide or vibrato fans out like an echo.
//   - "particles": a twisting dotted ribbon. Swells with each syllable,
//                  twists faster with vibrato, scatters on breaths.
//   - "harmonics": mirrored bell shapes, one per real overtone of the voice —
//                  a vowel's timbre is literally the shape of the row.
//   - "ripples":   concentric rings born at the center and drifting outward,
//                  one per moment of singing. Each ring keeps that moment's
//                  shape: more petals for higher notes, deeper waves for
//                  richer tones, rotation following the melody, color from
//                  the vowel. Together they show the last few seconds of the
//                  voice spreading out like sound in a room.
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

export const VOICE_STYLES = ["strands", "particles", "harmonics", "ripples", "off"];
export const VOICE_STYLE_KEY = "aether.voiceStyle";

// Syllables bloom in fast and release a little slower, so the shapes read
// as a sung phrase instead of flickering.
const ATTACK = 0.35;
const DECAY = 0.08;

// Spatial frequency (cycles across the ribbon) each overtone contributes —
// the fundamental makes broad swells, higher overtones tighter ripples.
const SHAPE_CYCLES = [1.2, 2.1, 3.2, 4.6, 6.4, 8.5];
const SHAPE_N = SHAPE_CYCLES.length;
const BUMPS = 8; // overtones drawn by "harmonics"

// Aether's palette, taken from the page itself: the title's violet #8b5cf6,
// cyan #67e8f9 and pink #ff2ea6, over the background's deep violet, sky blue
// and pink blobs. Everything below stays inside cyan -> blue -> violet ->
// pink; nothing strays into green, amber or red.
const CYAN = [103, 232, 249]; // #67e8f9
const VIOLET = [139, 92, 246]; // #8b5cf6
const PINK = [255, 46, 166]; // #ff2ea6

// Hue stops across the ribbon, left -> right (cyan, sky blue, violet, magenta, pink)
const RIBBON_HUES = [187, 217, 258, 292, 327];
const HUE_CYAN = 187;
const HUE_PINK = 327;

const mixRgb = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// How much of the screen's width the ribbon styles occupy, centered. Kept
// short on purpose: a ribbon stretched across the whole viewport reads as a
// chart running past the page content, while a compact one sits in the
// middle of the visuals like an object in the scene.
const SPAN_FRACTION = 0.26;
const SPAN_MIN_PX = 240; // so it doesn't shrink to nothing on a phone
// Height relative to that width, so the shapes keep their proportions
// instead of getting tall and narrow as the ribbon gets shorter.
const AMP_IDLE = 0.025;
const AMP_GAIN = 0.142;

// Particles: dots are spaced by these distances in real pixels, so the
// ribbon thins out as it gets shorter instead of packing the same count of
// dots into less room (which reads as a solid tube, not a dotted ribbon).
const DOT_SPACING_PX = 7.5; // along the ribbon
const ROW_SPACING_PX = 9; // across its width
const DOT_STEPS_RANGE = [20, 200];
const DOT_ROWS_RANGE = [5, 14];

const ECHO_LINES = 12; // strands
const ECHO_SPACING = 2; // frames between each strand's snapshot
const RING_LIFE = 200; // frames a ripple lives (~3.3s)
const RING_EVERY = 7; // frames between ripples while singing

function ribbonHue(u, shift = 0) {
  const p = u * (RIBBON_HUES.length - 1);
  const i = Math.min(RIBBON_HUES.length - 2, Math.floor(p));
  const h = RIBBON_HUES[i] + (RIBBON_HUES[i + 1] - RIBBON_HUES[i]) * (p - i);
  // Clamp so a vowel shift can't push the hue out of Aether's range
  return Math.min(HUE_PINK, Math.max(HUE_CYAN, h + shift));
}

// Tapers the ribbon to a point at both ends, like the reference images.
function taper(u) {
  return Math.pow(Math.sin(Math.PI * u), 1.6);
}

// Cheap deterministic noise, so breath sparkle doesn't flicker randomly
function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

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
    let frameCount = 0;

    // ---- The voice, eased for display ----
    let presence = 0; // is a voice sounding
    let level = 0; // presence * how strongly it's sung
    let bright = 0.5; // vowel color, 0 dark "oo" .. 1 bright "ee"
    let breath = 0;
    let vibrato = 0; // 0..1, from the pitch's own wobble
    let pitchNorm = 0.4; // 0 low (~90Hz) .. 1 high (~900Hz), log scale
    let pitchLog = Math.log2(220); // for ripple rotation
    let lastLog = 0;
    let pitchScale = 1; // low notes stretch the ribbon's ripples wide, high notes tighten them
    let t = 0;
    const shape = new Float32Array(SHAPE_N); // overtone strengths 1..6
    const bumps = new Float32Array(BUMPS); // overtone strengths 1..8

    // Strands' echo: a snapshot of the ribbon's shape per frame
    const ECHO_FRAMES = ECHO_LINES * ECHO_SPACING;
    const echo = Array.from({ length: ECHO_FRAMES }, () => ({
      shape: new Float32Array(SHAPE_N),
      pitchScale: 1,
      t: 0,
      level: 0,
    }));
    let echoHead = 0;

    // Ripples
    const rings = [];

    const sense = () => {
      const f = window.__voiceFrame;
      const voiced = f ? f.voiced : 0;
      presence += (voiced - presence) * (voiced > presence ? 0.3 : 0.06);
      const l = f ? f.voiced * f.loudness : 0;
      level += (l - level) * (l > level ? ATTACK : DECAY);
      if (!f) return;

      // The analysis reports ~0.25 ("oo") to ~0.75 ("ee") in practice;
      // stretch that to the full range so vowel changes are visible.
      bright += (clamp01((f.brightness - 0.25) / 0.5) - bright) * 0.12;
      breath += (f.breath - breath) * (f.breath > breath ? 0.5 : 0.12);

      for (let k = 0; k < BUMPS; k++) {
        // Square root so quieter upper overtones still show — they're what
        // distinguishes one vowel's timbre from another.
        const target = Math.sqrt(f.harmonics[k] || 0) * f.voiced;
        const cur = bumps[k];
        bumps[k] += (target - cur) * (target > cur ? ATTACK : DECAY);
        if (k < SHAPE_N) shape[k] = bumps[k];
      }

      if (f.pitch > 0 && f.voiced > 0.3) {
        const lp = Math.log2(f.pitch);
        // Vibrato: how much the pitch keeps moving, in cents per frame
        // (a typical 5-6Hz, half-semitone vibrato peaks around 25-30).
        if (lastLog) {
          const cents = Math.abs(lp - lastLog) * 1200;
          vibrato += (clamp01(cents / 18) - vibrato) * 0.08;
        }
        lastLog = lp;
        pitchLog = lp;
        pitchNorm += (clamp01(Math.log(f.pitch / 90) / Math.log(10)) - pitchNorm) * 0.1;
        pitchScale += (0.7 + pitchNorm * 0.9 - pitchScale) * 0.08;
      } else {
        lastLog = 0;
        vibrato *= 0.97;
      }
    };

    // Sum of each overtone's sine at position u. Normalized by the total so
    // a full, loud voice reshapes the ribbon rather than blowing its height
    // out — size is the amplitude's job, this only decides the shape.
    const wave = (u, off, s, ps, tt) => {
      let y = 0;
      let total = 0.35;
      for (let k = 0; k < SHAPE_N; k++) {
        y += s[k] * Math.sin(2 * Math.PI * SHAPE_CYCLES[k] * ps * u + tt * (0.6 + k * 0.25) + off * (1 + k * 0.35));
        total += s[k];
      }
      return y / total;
    };

    // Ribbon geometry: centered, a quarter of the width, amplitude tied to
    // that width rather than the screen height.
    const spanOf = () => Math.min(W * 0.88, Math.max(W * SPAN_FRACTION, Math.min(SPAN_MIN_PX, W * 0.8)));
    const ampFor = (lvl, span) => span * (AMP_IDLE + lvl * AMP_GAIN);

    const drawStrands = (cy, left, span) => {
      const STEPS = 160;
      const idle = 0.4 + presence * 0.6;
      for (let m = 0; m < ECHO_LINES; m++) {
        const f = m / (ECHO_LINES - 1); // 0 = back (oldest), 1 = front (now)
        const snap = echo[(echoHead - (ECHO_LINES - 1 - m) * ECHO_SPACING + ECHO_FRAMES * 2) % ECHO_FRAMES];
        // Back strands violet, front strand cyan — the front one drifting
        // toward pink on bright vowels. Mixed in RGB rather than by hue, so
        // the middle strands blend cleanly instead of banding.
        const front = mixRgb(CYAN, PINK, bright * 0.55);
        const [r, g, b] = mixRgb(VIOLET, front, f);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.25 + f * 0.65) * idle})`;
        ctx.lineWidth = m === ECHO_LINES - 1 ? 2 : 1;
        const amp = ampFor(snap.level, span);
        ctx.beginPath();
        for (let s = 0; s <= STEPS; s++) {
          const u = s / STEPS;
          const y = cy + taper(u) * amp * wave(u, f * 0.6, snap.shape, snap.pitchScale, snap.t);
          const x = left + u * span + (1 - f) * span * 0.011; // slight stagger adds depth
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const drawParticles = (cy, left, span) => {
      const amp = ampFor(level, span);
      const STEPS = Math.round(
        Math.min(DOT_STEPS_RANGE[1], Math.max(DOT_STEPS_RANGE[0], span / DOT_SPACING_PX))
      );
      // Row count comes from the ribbon's widest possible thickness, not the
      // current one, so rows don't pop in and out as the singing swells.
      const fullThickness = span * (AMP_IDLE + AMP_GAIN);
      const LINES = Math.round(
        Math.min(DOT_ROWS_RANGE[1], Math.max(DOT_ROWS_RANGE[0], fullThickness / ROW_SPACING_PX))
      );
      const halfWidth = 0.3 + level * 0.2; // ribbon width, relative to amp
      const idle = 0.35 + presence * 0.65;
      const hueShift = (bright - 0.5) * 60; // toward pink on bright vowels, cyan on dark ones
      for (let m = 0; m < LINES; m++) {
        const across = (m / (LINES - 1)) * Math.PI; // position across the ribbon's width
        for (let s = 0; s <= STEPS; s++) {
          const u = s / STEPS;
          const env = taper(u);
          // A flat ribbon following the voice's shape, twisting along its
          // length: where cos(phi) crosses zero the ribbon is seen edge-on
          // and pinches to a thread, like the reference image.
          const phi = across + u * 3 + t * 0.4;
          const depth = 0.5 + 0.5 * Math.sin(phi); // 0 = far, 1 = near
          const y = cy + env * amp * (wave(u, 0, shape, pitchScale, t) + halfWidth * Math.cos(phi));
          const x = left + u * span + Math.sin(phi) * span * 0.009; // slant the dot rows for depth
          const r = (0.6 + depth * 1.3) * (0.6 + env * 0.6) * (0.85 + level * 0.5);
          ctx.fillStyle = `hsla(${ribbonHue(u, hueShift)}, 85%, ${50 + depth * 22}%, ${(0.25 + depth * 0.7) * idle})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Breath and consonants: fine dots drifting off the ribbon
      const sprays = Math.floor(breath * STEPS * 0.8);
      for (let i = 0; i < sprays; i++) {
        const k = i * 17 + Math.floor(frameCount / 3) * 131;
        const u = 0.08 + hash(k) * 0.84;
        const spread = (hash(k + 1) - 0.5) * amp * 2.2 * taper(u);
        ctx.fillStyle = `hsla(${ribbonHue(u, hueShift)}, 70%, 85%, ${0.5 * breath})`;
        ctx.fillRect(left + u * span, cy + wave(u, 0, shape, pitchScale, t) * amp * taper(u) + spread, 1.3, 1.3);
      }
    };

    const drawHarmonics = (cy, left, span) => {
      const LAYERS = 10;
      const STEPS = 200;
      const amp = ampFor(level, span);
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
            for (let k = 0; k < BUMPS; k++) {
              // Vibrato sways each bump slightly side to side, in sequence
              const c = 0.07 + (k / (BUMPS - 1)) * 0.86 + Math.sin(t * 5 + k * 0.8) * vibrato * 0.012;
              const g = Math.exp(-Math.pow((u - c) * BUMPS * 3.6, 2)); // narrow: distinct bumps, flat axis between
              y += g * (bumps[k] + 0.02) * (0.9 + 0.1 * Math.sin(t * 1.3 + k));
            }
            const x = left + u * span;
            const yy = cy + dir * y * amp * 1.3 * scale;
            s === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    // Radius of a ripple's outline at angle th
    const ringRadius = (ring, R, th) => {
      // Petal count blends smoothly between whole numbers as the pitch moves
      const lobes = 3 + ring.pitchNorm * 4;
      const l0 = Math.floor(lobes);
      const fr = lobes - l0;
      const petals = (1 - fr) * Math.sin(l0 * th + ring.rot) + fr * Math.sin((l0 + 1) * th + ring.rot);
      const fine = Math.sin((2 * l0 + 1) * th - ring.rot * 1.7);
      const wob = Math.sin(3 * th + ring.rot * 0.5);
      // Waves deepen as the ring grows, like the reference: calm at the
      // center, most expressive at the edge.
      const grow = 0.35 + 0.65 * clamp01(R / (Math.min(W, H) * 0.25));
      return R * (1 + grow * (ring.depth * petals + ring.brightDepth * fine + ring.vibDepth * wob));
    };

    const drawRipples = () => {
      const cx = W / 2;
      const cy = H / 2;
      // Rings travel out to the same footprint the ribbon styles occupy, so
      // every voice style takes up the same room in the scene.
      const maxR = Math.min((W * SPAN_FRACTION) / 2, H * 0.22);
      const STEPS = 140;
      ctx.lineJoin = "round";
      for (const ring of rings) {
        const life = ring.age / RING_LIFE;
        const R = 6 + ring.birthSize + life * maxR;
        // Fades gently so the outer rings still carry their color
        const alpha = Math.pow(1 - life, 0.6) * (0.45 + 0.55 * ring.level);
        if (alpha < 0.01) continue;
        // Dark vowels cyan, bright vowels pink, and every ring drifts a
        // little further toward pink as it travels outward — the title's own
        // cyan-violet-pink sweep, spread across the rings.
        const hue = Math.min(HUE_PINK, HUE_CYAN + ring.bright * 110 + life * 45);
        ctx.strokeStyle = `hsla(${hue}, 95%, ${66 + ring.level * 10}%, ${alpha})`;
        ctx.lineWidth = 0.7 + ring.level * 2.3;
        // Breathy moments draw as a dotted, airy ring
        ctx.setLineDash(ring.breath > 0.65 ? [1.5, 4] : []);
        ctx.beginPath();
        for (let s = 0; s <= STEPS; s++) {
          const th = (s / STEPS) * Math.PI * 2;
          const r = ringRadius(ring, R, th);
          const x = cx + Math.cos(th) * r;
          const y = cy + Math.sin(th) * r;
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    const updateRipples = () => {
      const speed = reducedMotion ? 0.5 : 1;
      for (const ring of rings) ring.age += speed;
      while (rings.length && rings[0].age >= RING_LIFE) rings.shift();
      if (presence > 0.15 && frameCount % RING_EVERY === 0) {
        let richness = 0;
        for (let k = 1; k < 6; k++) richness += bumps[k];
        richness /= 5;
        rings.push({
          age: 0,
          level,
          bright,
          breath,
          pitchNorm,
          // A slide up turns the petals one way, a slide down the other
          rot: pitchLog * Math.PI * 2 * 0.75,
          birthSize: level * 18,
          depth: 0.05 + richness * 0.14 * (0.5 + level),
          brightDepth: 0.01 + bright * 0.04,
          vibDepth: vibrato * 0.07,
        });
      }
    };

    const frame = () => {
      frameCount++;
      sense();
      // Vibrato makes the shapes shimmer faster
      t += (reducedMotion ? 0.012 : 0.03) * (1 + vibrato * 1.5);

      echoHead = (echoHead + 1) % ECHO_FRAMES;
      const snap = echo[echoHead];
      snap.shape.set(shape);
      snap.pitchScale = pitchScale;
      snap.t = t;
      snap.level = level;

      updateRipples();

      ctx.clearRect(0, 0, W, H);
      if (style !== "off") {
        const span = spanOf();
        const left = (W - span) / 2;
        const cy = H * 0.5;
        ctx.globalCompositeOperation = "lighter";
        if (style === "strands") drawStrands(cy, left, span);
        else if (style === "particles") drawParticles(cy, left, span);
        else if (style === "harmonics") drawHarmonics(cy, left, span);
        else if (style === "ripples") drawRipples();
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
      presence = level = breath = vibrato = 0;
      shape.fill(0);
      bumps.fill(0);
      rings.length = 0;
      echo.forEach((e) => {
        e.shape.fill(0);
        e.level = 0;
      });
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
