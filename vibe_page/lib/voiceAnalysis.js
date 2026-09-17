// lib/voiceAnalysis.js
// Reads the lead VOICE out of whatever lib/audioReactive.js feeds it, for
// components/VoiceVisualizer.jsx.
//
// Two modes:
//   - "stem": the input is an isolated vocal track (a separate file played
//     in sync with the song). Nothing to separate — every sound in it IS
//     the voice, so it's read as-is. This is the exact mode.
//   - "live": the input is a full mix (a bundled/uploaded song, or a
//     captured tab). True source separation needs an ML model far too
//     heavy to run per frame, so this narrows the mix down in three
//     passes, each removing a different kind of non-vocal sound:
//       1. Stereo: lead vocals are almost always mixed dead center. The
//          signal is split into mid (L+R) and side (L-R) in the audio graph
//          itself — a centered voice cancels out of the side signal
//          exactly, the way a karaoke vocal remover works, while anything
//          panned survives in it. Each frequency bin is weighted by how
//          little side it has relative to mid. Because the subtraction
//          happens on the waveform, phase included, it isn't fooled by two
//          different panned instruments that happen to land in the same bin
//          at similar levels. Panned guitars, pads and reverb drop out.
//       2. Harmonic/percussive split (median-filter HPSS): sustained,
//          pitched sound shows up as a steady horizontal line over time;
//          drums show up as a brief vertical smear across frequencies.
//          Comparing a per-bin median over recent frames against a
//          per-frame median over neighboring bins keeps the first and
//          discards the second. Centered kick/snare/hats drop out.
//       3. Voicing gate: a harmonic-sum pitch detector looks for one
//          fundamental with a stack of evenly spaced overtones — the
//          signature of a singing voice. The visual only opens up while
//          that's present, and follows its actual pitch.
//     What can still slip through: a centered, sustained, single-pitch
//     lead instrument (a synth lead, a sax) looks much like a voice to all
//     three passes.
//
// Publishes per frame:
//   window.__voiceBands   Float32Array(6), 0..1, log-spaced 180Hz–4kHz, gated by voicing
//   window.__voiceLevel   mean of the bands
//   window.__voicePitch   detected fundamental in Hz, 0 when not voiced
//   window.__voiceVoiced  0..1 confidence that a voice is sounding right now
//   window.__voiceSource  "stem" | "live"

const FFT = 4096; // ~10.8Hz bins at 44.1kHz — fine enough to resolve a sung pitch
const LO_HZ = 80;
const HI_HZ = 5000;
const PITCH_LO_HZ = 90; // just under the lowest common sung notes; keeps most bass fundamentals out
const PITCH_HI_HZ = 1000;
const HARMONICS = 6;
const HISTORY = 7; // frames in the HPSS time median (~115ms at 60fps)
const FREQ_MEDIAN = 4; // +/- bins in the HPSS frequency median
const BANDS = 6;
const BAND_LO_HZ = 180;
const BAND_HI_HZ = 4000;

function median(arr, n) {
  // insertion sort — n is at most 9 here, faster than anything clever
  for (let i = 1; i < n; i++) {
    const v = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > v) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = v;
  }
  return arr[n >> 1];
}

export function createVoiceAnalyzer(ctx) {
  // Force exactly two channels first: a mono source is up-mixed to identical
  // L/R (so it reads as fully centered) instead of the splitter leaving the
  // right channel silent and making everything look hard-panned left.
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  input.channelInterpretation = "speakers";
  const splitter = ctx.createChannelSplitter(2);
  input.connect(splitter);

  // mid = (L + R) / 2, side = (L - R) / 2, built from plain gain nodes —
  // multiple connections into one node are summed.
  const mid = ctx.createAnalyser();
  const side = ctx.createAnalyser();
  const lToMid = ctx.createGain();
  const rToMid = ctx.createGain();
  const lToSide = ctx.createGain();
  const rToSide = ctx.createGain();
  lToMid.gain.value = rToMid.gain.value = lToSide.gain.value = 0.5;
  rToSide.gain.value = -0.5;
  splitter.connect(lToMid, 0);
  splitter.connect(lToSide, 0);
  splitter.connect(rToMid, 1);
  splitter.connect(rToSide, 1);
  lToMid.connect(mid);
  rToMid.connect(mid);
  lToSide.connect(side);
  rToSide.connect(side);
  const nodes = [input, splitter, lToMid, rToMid, lToSide, rToSide, mid, side];

  mid.fftSize = side.fftSize = FFT;
  // Light smoothing only — the HPSS time median below needs to see real
  // frame-to-frame change to tell a drum hit from a held note.
  mid.smoothingTimeConstant = side.smoothingTimeConstant = 0.3;

  const binHz = ctx.sampleRate / FFT;
  const lo = Math.ceil(LO_HZ / binHz);
  const hi = Math.min(FFT / 2 - 1, Math.floor(HI_HZ / binHz));
  const N = hi - lo + 1;

  const dbMid = new Float32Array(FFT / 2);
  const dbSide = new Float32Array(FFT / 2);
  const mix = new Float32Array(N);
  const voice = new Float32Array(N);
  const hist = new Float32Array(N * HISTORY);
  const tmp = new Float32Array(Math.max(HISTORY, FREQ_MEDIAN * 2 + 1));
  let histPos = 0;
  let histFilled = 0;

  const bandEdges = [];
  for (let b = 0; b <= BANDS; b++) {
    const hz = BAND_LO_HZ * Math.pow(BAND_HI_HZ / BAND_LO_HZ, b / BANDS);
    bandEdges.push(Math.round(hz / binHz) - lo);
  }
  const bands = new Float32Array(BANDS);

  // Pitch detection ignores everything below ~150Hz and fades in up to
  // ~350Hz. Bass lines are centered and harmonic too, but almost all of
  // their energy sits down there, while a voice's overtones carry on well
  // above it — so the pitch is read from those overtones, and a bass can't
  // pass the three-harmonics test on its own.
  const detectWeight = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const hz = (lo + i) * binHz;
    const x = Math.min(1, Math.max(0, (hz - 150) / 200));
    detectWeight[i] = x * x * (3 - 2 * x);
  }
  const weighted = new Float32Array(N);
  const formantLo = Math.round(700 / binHz) - lo;
  const pitchHistory = [];

  let mode = "live";
  let voicing = 0;

  // Linear magnitude of `v` near fractional index `k` (relative to lo): the
  // strongest of the two nearest bins, since a partial rarely lands exactly
  // on a bin center.
  const peakAt = (k, arr = weighted) => {
    const i = Math.round(k);
    if (i < 1 || i >= N - 1) return 0;
    return Math.max(arr[i - 1], arr[i], arr[i + 1]);
  };

  function detectPitch() {
    // Harmonic sum: for each candidate fundamental, add up the energy at
    // its first few overtones and subtract the energy halfway between
    // them. The subtraction is what stops the detector from picking an
    // octave too low (whose "harmonics" would land on every other real
    // partial and on the gaps in between).
    let best = 0;
    let bestK = 0;
    const kLo = PITCH_LO_HZ / binHz;
    const kHi = PITCH_HI_HZ / binHz;
    for (let k0 = kLo; k0 <= kHi; k0 += 0.5) {
      let score = 0;
      for (let h = 1; h <= HARMONICS; h++) {
        const w = 1 / Math.sqrt(h);
        score += w * peakAt(h * k0 - lo);
        score -= 0.5 * w * peakAt((h - 0.5) * k0 - lo);
      }
      if (score > best) {
        best = score;
        bestK = k0;
      }
    }
    if (!bestK) return { pitch: 0, harmonicity: 0 };

    // Octave/overtone correction. Vowel formants make one overtone much
    // louder than the rest (an "ah" on A3/220Hz peaks at its 3rd overtone,
    // 660Hz), and the sum above can latch onto that overtone as if it were
    // the note. If the overtones a lower note would ADD — the ones in
    // between the current candidate's — are really there, the lower note
    // is the true pitch.
    {
      let loudestRaw = 0;
      for (let i = 0; i < N; i++) if (voice[i] > loudestRaw) loudestRaw = voice[i];
      let bestD = 1;
      for (let d = 2; d <= 4; d++) {
        const k = bestK / d;
        if (k < kLo) break;
        let present = 0, checked = 0;
        for (let h = 1; h <= 2 * d; h++) {
          if (h % d === 0) continue; // shared with the current candidate — proves nothing
          if (h * k * binHz < 150) continue; // too low to trust in a mix with bass
          checked++;
          if (peakAt(h * k - lo, voice) > loudestRaw * 0.1) present++;
        }
        if (checked >= 2 && present >= checked * 0.75) bestD = d;
      }
      bestK /= bestD;
    }

    // A voice is a stack of overtones. A lone sine-like tone (a sub bass,
    // a whistle-y synth) can score well above but only has one or two, so
    // require at least three audible harmonics.
    const countAudible = (k) => {
      let strongest = 0;
      for (let h = 1; h <= HARMONICS; h++) strongest = Math.max(strongest, peakAt(h * k - lo));
      let audible = 0;
      for (let h = 1; h <= HARMONICS; h++) if (peakAt(h * k - lo) > strongest * 0.1) audible++;
      return audible;
    };
    // Too few overtones can also mean the candidate is itself an overtone
    // whose lower note lost a partial or two to the filters above (e.g. a
    // fundamental sharing its bin with a panned instrument). A lower note
    // only passes if it adds overtones of its own.
    if (countAudible(bestK) < 3) {
      let found = 0;
      for (let d = 2; d <= 4 && bestK / d >= kLo; d++) {
        if (countAudible(bestK / d) >= 3) {
          found = bestK / d;
          break;
        }
      }
      if (!found) return { pitch: 0, harmonicity: 0 };
      bestK = found;
    }

    // Formant check: vowels put real energy up around 700Hz–3.5kHz (the
    // 2nd/3rd formants) whatever note is being sung. A bass line's
    // overtones have died away by then, typically 30dB+ down.
    let upper = 0;
    for (let h = 1; h * bestK * binHz <= 3500; h++) {
      if (h * bestK * binHz >= 700) upper = Math.max(upper, peakAt(h * bestK - lo, voice));
    }
    let body = 0; // loudest raw (unweighted) content from the fundamental up to the formant range
    for (let i = Math.max(0, Math.round(bestK) - lo - 1); i < formantLo; i++) if (voice[i] > body) body = voice[i];
    // Sung vowels measured ~0.2 and up here; a bass line ~0.06. Fade across
    // the gap rather than cutting hard so borderline frames don't flicker.
    const formant = body > 0 ? Math.min(1, Math.max(0, (upper / body - 0.07) / 0.07)) : 0;
    if (formant === 0) return { pitch: 0, harmonicity: 0 };

    // Harmonicity: how much of the energy across the overtone span sits
    // on those overtones, rescaled so an evenly spread (noise-like)
    // spectrum reads as 0 regardless of pitch.
    let on = 0;
    let total = 0;
    const spanLo = Math.max(0, Math.floor(0.5 * bestK) - lo);
    const spanHi = Math.min(N - 1, Math.ceil((HARMONICS + 0.5) * bestK) - lo);
    for (let i = spanLo; i <= spanHi; i++) total += weighted[i];
    let onBins = 0;
    for (let h = 1; h <= HARMONICS; h++) {
      const c = Math.round(h * bestK) - lo;
      for (let i = c - 1; i <= c + 1; i++) {
        if (i >= spanLo && i <= spanHi) {
          on += weighted[i];
          onBins++;
        }
      }
    }
    if (total <= 0) return { pitch: 0, harmonicity: 0 };
    const baseline = onBins / (spanHi - spanLo + 1);
    const harmonicity = Math.max(0, (on / total - baseline) / (1 - baseline)) * formant;
    return { pitch: bestK * binHz, harmonicity };
  }

  return {
    input,
    setMode(m) {
      mode = m;
      histFilled = 0;
      pitchHistory.length = 0;
    },
    analyse() {
      mid.getFloatFrequencyData(dbMid);
      side.getFloatFrequencyData(dbSide);

      let loudest = -Infinity;
      for (let i = 0; i < N; i++) {
        const m = Math.pow(10, dbMid[lo + i] / 20);
        const sd = Math.pow(10, dbSide[lo + i] / 20);
        mix[i] = m;
        voice[i] = m > 0 ? sd / m : 1; // stash side/mid ratio for the pass below
        if (dbMid[lo + i] > loudest) loudest = dbMid[lo + i];
      }

      const row = histPos * N;
      for (let i = 0; i < N; i++) hist[row + i] = mix[i];
      histPos = (histPos + 1) % HISTORY;
      histFilled = Math.min(HISTORY, histFilled + 1);

      for (let i = 0; i < N; i++) {
        if (mode === "stem") {
          voice[i] = mix[i];
          continue;
        }
        // side/mid is 0 for a perfectly centered sound and ~1 for one
        // panned hard to a side. Some side is normal even on a centered
        // vocal (stereo reverb), so this fades out gradually.
        const c = Math.max(0, 1 - voice[i] / 0.6);
        const center = c * c;

        for (let f = 0; f < histFilled; f++) tmp[f] = hist[f * N + i];
        const harmonic = median(tmp, histFilled);
        let n = 0;
        for (let j = i - FREQ_MEDIAN; j <= i + FREQ_MEDIAN; j++) {
          tmp[n++] = mix[Math.min(N - 1, Math.max(0, j))];
        }
        const percussive = median(tmp, n);
        const h2 = harmonic * harmonic;
        const mask = h2 / (h2 + percussive * percussive + 1e-12);

        voice[i] = mix[i] * center * mask;
      }

      // Nothing audible at all — skip pitch detection on the noise floor.
      for (let i = 0; i < N; i++) weighted[i] = voice[i] * detectWeight[i];
      const { pitch, harmonicity } = loudest > -75 ? detectPitch() : { pitch: 0, harmonicity: 0 };
      const target = Math.min(1, Math.max(0, (harmonicity - 0.2) / 0.3));
      voicing += (target - voicing) * (target > voicing ? 0.35 : 0.12);

      // Median of recent estimates irons out single-frame octave slips.
      let smoothedPitch = 0;
      if (voicing > 0.4 && pitch) {
        pitchHistory.push(pitch);
        if (pitchHistory.length > 5) pitchHistory.shift();
        smoothedPitch = median(Float32Array.from(pitchHistory), pitchHistory.length);
      } else {
        pitchHistory.length = 0;
      }

      // A stem is all voice by definition, so breaths and consonants
      // (unpitched) still show, just softer. A live mix only opens up
      // while an actual sung pitch is detected.
      const gate = mode === "stem" ? 0.5 + 0.5 * voicing : voicing;
      let levelSum = 0;
      for (let b = 0; b < BANDS; b++) {
        const a = Math.max(0, bandEdges[b]);
        const z = Math.max(a + 1, bandEdges[b + 1]);
        // Loudest partial in the band, not the average — a voice's energy
        // sits on narrow harmonic peaks with near-silence between them,
        // so an average reads a strong note as barely there.
        let peak = 0;
        for (let i = a; i < z; i++) if (voice[i] > peak) peak = voice[i];
        const db = 20 * Math.log10(peak + 1e-9);
        bands[b] = Math.min(1, Math.max(0, (db + 75) / 50)) * gate;
        levelSum += bands[b];
      }

      window.__voiceBands = bands;
      window.__voiceLevel = levelSum / BANDS;
      window.__voicePitch = smoothedPitch;
      window.__voiceVoiced = voicing;
      window.__voiceSource = mode;
    },
    dispose() {
      nodes.forEach((n) => {
        try { n.disconnect(); } catch (e) {}
      });
      delete window.__voiceBands;
      delete window.__voiceLevel;
      delete window.__voicePitch;
      delete window.__voiceVoiced;
      delete window.__voiceSource;
    },
  };
}
