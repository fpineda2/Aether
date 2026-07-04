// lib/audioReactive.js
// Real-time audio analysis for the interactive starfield.
//
// Spotify's own playback can't be analyzed in-browser (it's DRM/EME-protected),
// so this analyzes a LOCAL audio element you control via the Web Audio API and
// dispatches the same `audio-pulse` / `stop-audio-reactive` CustomEvents that
// AudioReactiveStarfield already listens for. No changes to the starfield needed.

export function createAudioReactiveController(audioEl, { onError } = {}) {
  let ctx = null;
  let source = null;
  let analyser = null;
  let raf = null;
  let bassHistory = [];
  let lastBeat = 0;
  const HISTORY = 43; // ~0.7s of frames at 60fps, used as a rolling baseline
  

  // Build the audio graph lazily, on first user gesture (browsers block
  // AudioContext until then). createMediaElementSource can only run once
  // per element, so this is guarded against re-entry.
  function ensureGraph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    source = ctx.createMediaElementSource(audioEl);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; // -> 512 frequency bins
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination); // keep the audio audible
  }

  function loop() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Publish the full spectrum so the web renderer can react per-node
    window.__audioFreq = data;

    // Low band (kick/bass) drives the "beat". Skip bin 0 (DC offset).
    let bass = 0;
    const bassBins = 24;
    for (let i = 1; i <= bassBins; i++) bass += data[i];
    bass /= bassBins; // 0..255

    // Overall energy gives a baseline shimmer between beats.
    let total = 0;
    for (let i = 0; i < data.length; i++) total += data[i];
    const avgAll = total / data.length; // 0..255

    // Rolling baseline of bass energy for beat detection.
    bassHistory.push(bass);
    if (bassHistory.length > HISTORY) bassHistory.shift();
    const baseline =
      bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

    // A beat = bass jumps clearly above its own recent average.
    // A short refractory window stops machine-gun re-triggering every frame.
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const isBeat =
      bass > baseline * 1.3 && bass > 28 && now - lastBeat > 110;

    let beatStrength = 0;
    if (isBeat) {
      lastBeat = now;
      beatStrength = Math.min(1, (bass - baseline) / (baseline + 1));
    }

    // Map to the 0..1 intensity the starfield expects, with a punchy floor on beats.
    let intensity = Math.min(1, avgAll / 150);
    if (isBeat) {
      intensity = Math.min(1, Math.max(intensity, 0.7) + 0.3);
    }

    window.dispatchEvent(
      new CustomEvent("audio-pulse", {
        detail: {
          intensity,
          beat: isBeat,
          beatStrength,
          // absolute bass loudness (0..1) — lets the renderer color loud beats
          // differently from soft ones instead of flooring them all the same
          bassLevel: Math.min(1, bass / 220),
        },
      })
    );
    raf = requestAnimationFrame(loop);
  }

  return {
    async start() {
      try {
        ensureGraph();
        if (ctx.state === "suspended") await ctx.resume();
        if (!raf) loop();
      } catch (e) {
        onError?.(e);
      }
    },
    stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      bassHistory = [];
      window.dispatchEvent(new CustomEvent("stop-audio-reactive"));
    },
    dispose() {
      this.stop();
      try {
        source && source.disconnect();
        analyser && analyser.disconnect();
      } catch (e) {}
      try {
        ctx && ctx.close();
      } catch (e) {}
      ctx = source = analyser = null;
    },
  };
}