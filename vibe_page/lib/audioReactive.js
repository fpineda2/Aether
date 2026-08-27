// lib/audioReactive.js
// Real-time audio analysis for the interactive starfield.
//
// Spotify's own playback (and every other DRM-protected streaming service)
// can't be analyzed in-browser — the decoded audio never leaves the
// browser's protected media pipeline, so there's no tap for a Web Audio
// AnalyserNode. Two ways around that, both handled here:
//   - createAudioReactiveController: analyzes a LOCAL <audio> element you
//     control directly (a bundled track, or a file the visitor picked).
//   - createStreamReactiveController: analyzes a MediaStream captured via
//     getDisplayMedia's tab/system audio sharing — this works with
//     literally any source (Spotify, Apple Music, a video, anything)
//     because by the time it reaches us the DRM has already done its job;
//     we're just listening to what's already playing out loud, the same
//     way a microphone would.
//
// Both dispatch the same `audio-pulse` / `stop-audio-reactive` CustomEvents
// that AudioReactiveStarfield already listens for — it doesn't know or care
// which kind of source produced them.

// Shared engine: builds the analyser graph, runs the FFT loop, does beat
// detection, and dispatches events. `buildSource` is the only thing that
// differs between a local <audio> element and a captured MediaStream —
// everything downstream of "we have a Web Audio source node" is identical.
function createReactiveController({ buildSource, toDestination, onDispose, onError }) {
  let ctx = null;
  let source = null;
  let analyser = null;
  let splitter = null;
  let leftAnalyser = null;
  let rightAnalyser = null;
  let raf = null;
  let running = false; // true between start()/stop(), independent of whether a frame is currently scheduled
  let bassHistory = [];
  let lastBeat = 0;
  const HISTORY = 43; // ~0.7s of frames at 60fps, used as a rolling baseline

  // The source keeps producing audio in a hidden tab regardless, but the FFT
  // analysis + event dispatching only feeds a canvas nobody can see — pause
  // that work while hidden and pick back up once the tab is visible again.
  function handleVisibilityChange() {
    if (!document.hidden && running && !raf) {
      loop();
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  // Build the audio graph lazily, on first user gesture (browsers block
  // AudioContext until then). Guarded against re-entry — createMediaElementSource
  // in particular can only ever run once per <audio> element.
  function ensureGraph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    source = buildSource(ctx);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024; // -> 512 frequency bins
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    // A local <audio> element's default output is fully replaced once it's
    // wired into a MediaElementSource, so it has to be explicitly routed
    // back to the speakers. A captured tab/system stream is the opposite:
    // the source (Spotify, a video, whatever) is already playing out loud
    // on its own — routing our copy to the destination too would double it.
    if (toDestination) analyser.connect(ctx.destination);

    // Separate left/right analysers off a channel splitter — the combined
    // analyser above only ever sees the mixed-down signal, so this is the
    // only way to tell a bassline panned right from one panned left. Purely
    // additive tap; doesn't touch the audible signal path above.
    splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);
    leftAnalyser = ctx.createAnalyser();
    rightAnalyser = ctx.createAnalyser();
    leftAnalyser.fftSize = rightAnalyser.fftSize = 1024;
    leftAnalyser.smoothingTimeConstant = rightAnalyser.smoothingTimeConstant = 0.8;
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);
  }

  function loop() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    // Publish the full spectrum so the web renderer can react per-node
    window.__audioFreq = data;

    // Per-channel spectrum, for anything that wants to know WHERE in the
    // stereo field a sound is coming from (e.g. the background blobs
    // drifting toward whichever side a given band is panned to).
    const dataL = new Uint8Array(leftAnalyser.frequencyBinCount);
    const dataR = new Uint8Array(rightAnalyser.frequencyBinCount);
    leftAnalyser.getByteFrequencyData(dataL);
    rightAnalyser.getByteFrequencyData(dataR);
    window.__audioFreqL = dataL;
    window.__audioFreqR = dataR;

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
    raf = document.hidden ? null : requestAnimationFrame(loop);
  }

  return {
    async start() {
      try {
        ensureGraph();
        if (ctx.state === "suspended") await ctx.resume();
        running = true;
        if (!raf) loop();
      } catch (e) {
        onError?.(e);
      }
    },
    stop() {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      bassHistory = [];
      window.dispatchEvent(new CustomEvent("stop-audio-reactive"));
    },
    dispose() {
      this.stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      try {
        source && source.disconnect();
        analyser && analyser.disconnect();
        splitter && splitter.disconnect();
        leftAnalyser && leftAnalyser.disconnect();
        rightAnalyser && rightAnalyser.disconnect();
      } catch (e) {}
      try {
        ctx && ctx.close();
      } catch (e) {}
      ctx = source = analyser = splitter = leftAnalyser = rightAnalyser = null;
      delete window.__audioFreqL;
      delete window.__audioFreqR;
      onDispose?.();
    },
  };
}

export function createAudioReactiveController(audioEl, { onError } = {}) {
  return createReactiveController({
    buildSource: (ctx) => ctx.createMediaElementSource(audioEl),
    toDestination: true,
    onError,
  });
}

// `stream` is a MediaStream with an audio track — typically from
// getDisplayMedia's tab/system-audio sharing. The caller owns the stream's
// lifecycle (getting it, releasing its tracks when done); this just taps it
// for analysis.
export function createStreamReactiveController(stream, { onError } = {}) {
  return createReactiveController({
    buildSource: (ctx) => ctx.createMediaStreamSource(stream),
    toDestination: false,
    onError,
  });
}
