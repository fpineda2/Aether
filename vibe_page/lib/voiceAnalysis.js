// lib/voiceAnalysis.js
// Follows the lead VOICE in whatever lib/audioReactive.js feeds it, for
// components/VoiceVisualizer.jsx: its pitch, how strongly it's sung, the
// color of the vowel, and breathy consonants.
//
// Two modes:
//   - "stem": the input is an isolated vocal track (a separate file played
//     in sync with the song). Every sound in it IS the voice, so loudness,
//     vowel color and consonants are read straight from it. Exact.
//   - "live": the input is a full mix (a bundled/uploaded song, or a
//     captured tab). True source separation needs an ML model far too heavy
//     to run per frame, so the voice is estimated:
//       1. Stereo: a mid (L+R) / side (L-R) split built in the audio graph.
//          A centered lead vocal cancels out of the side signal exactly —
//          the karaoke vocal-remover trick, run in reverse — so each bin's
//          side level is subtracted from its mid level. A hard-panned
//          instrument has equal mid and side and drops out, while a voice
//          singing the SAME note as a panned instrument (melodies land on
//          chord tones all the time) keeps its own level instead of being
//          wiped out along with it.
//       2. Drums: median-filter harmonic/percussive separation. Sustained
//          sound is a steady line over time, a drum hit a brief smear across
//          frequencies. The time median runs over a slightly widened
//          spectrum so a partial wobbling with vibrato still counts as
//          sustained instead of being mistaken for a transient.
//       3. Finding a voice: a harmonic-sum pitch detector with octave
//          correction and a formant check — one fundamental with a stack of
//          overtones and real energy up where vowels resonate.
//
// Both modes share a NOTE TRACKER. Deciding "is this a voice?" from scratch
// every frame makes a sung word flicker out right after it starts (vibrato,
// slides and consonants all blur the evidence for a frame or two). So once
// a note is found it is followed: each frame searches just around the last
// pitch, on the stereo-filtered spectrum without the drum pass (which can
// smear a sliding partial), and the note is only let go after the voice
// has really been gone for ~150ms. Pitch is refined from the overtones'
// exact peak positions, so slides and vibrato come out smooth rather than
// stepping by whole FFT bins.
//
// Publishes window.__voiceFrame every frame:
//   voiced      0..1   eased: is a voice sounding right now
//   pitch       Hz     smoothed sung pitch; holds its last value between notes
//   loudness    0..1   how strongly the voice is sung (syllables, swells)
//   brightness  0..1   vowel color: dark "oo" -> bright "ee"
//   breath      0..1   unpitched vocal noise: "s", "sh", "t", breaths
//   harmonics   Float32Array(12), 0..1 — strength of each overtone
//   source      "stem" | "live"

const FFT = 4096; // ~10.8Hz bins at 44.1kHz
const LO_HZ = 80;
const HI_HZ = 10000;
const PITCH_LO_HZ = 90;
const PITCH_HI_HZ = 1100;
const SCORE_HARMONICS = 6;
const OUT_HARMONICS = 12;
const HISTORY = 9; // frames in the drum-pass time median (~150ms at 60fps)
const FREQ_MEDIAN = 4; // +/- bins in the drum-pass frequency median
const RELEASE_FRAMES = 9; // ~150ms without the voice before a note is let go
// A held note stays held while its strength is at least this fraction of the
// note's recent peak. When a singer stops, strength falls well below it even
// if an instrument carries on at the same pitch; brief dips mid-word
// (consonants) are covered by RELEASE_FRAMES instead.
const HOLD_RATIO = 0.4;

function median(arr, n) {
  // insertion sort — n is at most 9 here
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

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

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
  // Light smoothing only — the drum pass needs to see real frame-to-frame change.
  mid.smoothingTimeConstant = side.smoothingTimeConstant = 0.3;

  const binHz = ctx.sampleRate / FFT;
  const lo = Math.ceil(LO_HZ / binHz);
  const hi = Math.min(FFT / 2 - 1, Math.floor(HI_HZ / binHz));
  const N = hi - lo + 1;
  const bin = (hz) => hz / binHz - lo; // Hz -> fractional index into the arrays below

  const dbMid = new Float32Array(FFT / 2);
  const dbSide = new Float32Array(FFT / 2);
  const mix = new Float32Array(N); // full mid spectrum (linear)
  const centered = new Float32Array(N); // strict stereo pass — for finding a new note
  const following = new Float32Array(N); // gentler stereo pass — for following one
  const followingW = new Float32Array(N); // `following`, faded out below ~350Hz like `weighted`
  const voice = new Float32Array(N); // stereo + drum passes (== mix for a stem)
  const weighted = new Float32Array(N); // voice, faded out below ~350Hz for acquisition
  const noise = new Float32Array(N); // the percussive/unpitched part of `centered`
  const dilated = new Float32Array(N);
  const sideRatio = new Float32Array(N).fill(1);
  const hist = new Float32Array(N * HISTORY);
  const tmp = new Float32Array(Math.max(HISTORY, FREQ_MEDIAN * 2 + 1));
  const rawHarm = new Float32Array(OUT_HARMONICS);
  let histPos = 0;
  let histFilled = 0;

  // Acquisition ignores everything below ~150Hz and fades in up to ~350Hz:
  // bass lines are centered and harmonic too, but their energy sits down
  // there, while a voice's overtones carry on well above.
  const detectWeight = new Float32Array(N);
  // Vibrato moves higher partials further, so widen more as frequency rises.
  const dilateWidth = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const hz = (lo + i) * binHz;
    const x = clamp01((hz - 150) / 200);
    detectWeight[i] = x * x * (3 - 2 * x);
    dilateWidth[i] = hz < 800 ? 1 : hz < 2500 ? 2 : 3;
  }
  const breathLo = Math.round(bin(4000));

  let mode = "live";

  // Tracker state
  let active = false;
  let trackedHz = 0;
  let misses = 0;
  let refEnergy = 0;
  let upperVotes = 0; // consecutive frames suggesting the note is really an octave up
  let noteAge = 0; // frames since the current note was found
  let candidateHz = 0; // a possible new note, waiting to be confirmed
  let candidateFrames = 0;
  let switchHz = 0; // a possible jump to a different note while one is held
  let switchVotes = 0;
  let sinceVoiced = 1e9; // frames since the tracker last held a note

  // Published (eased) values
  const frame = {
    voiced: 0,
    pitch: 0,
    loudness: 0,
    brightness: 0.5,
    breath: 0,
    harmonics: new Float32Array(OUT_HARMONICS),
    source: "live",
  };

  // Strongest value near fractional index k in arr, within +/- tol bins.
  const peakNear = (arr, k, tol = 1) => {
    const a = Math.max(0, Math.floor(k - tol));
    const b = Math.min(N - 1, Math.ceil(k + tol));
    let m = 0;
    for (let i = a; i <= b; i++) if (arr[i] > m) m = arr[i];
    return m;
  };

  // Harmonic-sum score for fundamental `hz`: energy on the overtones minus
  // energy halfway between them (stops octave-too-low picks).
  const harmonicScore = (arr, hz) => {
    let score = 0;
    for (let h = 1; h <= SCORE_HARMONICS; h++) {
      if (h * hz > 5000) break;
      const w = 1 / Math.sqrt(h);
      score += w * peakNear(arr, bin(h * hz));
      score -= 0.5 * w * peakNear(arr, bin((h - 0.5) * hz));
    }
    return score;
  };

  const countAudible = (arr, hz) => {
    let strongest = 0;
    for (let h = 1; h <= SCORE_HARMONICS; h++) strongest = Math.max(strongest, peakNear(arr, bin(h * hz)));
    let audible = 0;
    for (let h = 1; h <= SCORE_HARMONICS; h++) if (peakNear(arr, bin(h * hz)) > strongest * 0.1) audible++;
    return audible;
  };

  // How much of the energy across the overtone span sits on the overtones,
  // rescaled so a noise-like spectrum reads 0 whatever the pitch.
  const harmonicity = (arr, hz) => {
    const spanLo = Math.max(0, Math.floor(bin(0.5 * hz)));
    const spanHi = Math.min(N - 1, Math.ceil(bin((SCORE_HARMONICS + 0.5) * hz)));
    let total = 0;
    for (let i = spanLo; i <= spanHi; i++) total += arr[i];
    if (total <= 0) return 0;
    let on = 0, onBins = 0;
    for (let h = 1; h <= SCORE_HARMONICS; h++) {
      const c = Math.round(bin(h * hz));
      // Vibrato smears higher overtones across more bins within one analysis
      // window (a 3% wobble on a 2kHz overtone spans ~5 bins), so the
      // "on the overtone" zone widens with frequency.
      const tol = Math.max(1, Math.round((h * hz * 0.025) / binHz));
      for (let i = c - tol; i <= c + tol; i++) {
        if (i >= spanLo && i <= spanHi) {
          on += arr[i];
          onBins++;
        }
      }
    }
    const baseline = onBins / (spanHi - spanLo + 1);
    return clamp01((on / total - baseline) / (1 - baseline));
  };

  // Vowels put real energy up around 700Hz–3.5kHz whatever note is sung; a
  // bass line's overtones have died away by then. Sung vowels measure ~0.2+
  // here, bass ~0.06 — faded across the gap.
  const formantFactor = (arr, hz) => {
    let upper = 0, body = 0;
    for (let h = 1; h * hz <= 3500; h++) {
      const v = peakNear(arr, bin(h * hz));
      if (h * hz >= 700) upper = Math.max(upper, v);
      else body = Math.max(body, v);
    }
    if (body <= 0) return upper > 0 ? 1 : 0;
    return clamp01((upper / body - 0.07) / 0.07);
  };

  // Precise pitch from where each overtone's peak actually sits (parabolic
  // interpolation on the log spectrum), averaged by strength. Sub-bin
  // accurate, so glides and vibrato are smooth instead of stair-stepped.
  const refinePitch = (arr, hz) => {
    let strongest = 0;
    for (let h = 1; h * hz <= 4000 && h <= OUT_HARMONICS; h++) strongest = Math.max(strongest, peakNear(arr, bin(h * hz), 2));
    let sum = 0, wsum = 0;
    for (let h = 1; h * hz <= 4000 && h <= OUT_HARMONICS; h++) {
      const c = bin(h * hz);
      // Tight window: a wide one around the low overtones reaches a nearby
      // instrument's peak (a bass a semitone away) and drags the pitch to it.
      const tol = Math.max(0.6, (h * hz * 0.015) / binHz);
      let best = -1, bestV = 0;
      for (let i = Math.max(1, Math.floor(c - tol)); i <= Math.min(N - 2, Math.ceil(c + tol)); i++) {
        if (arr[i] > bestV) {
          bestV = arr[i];
          best = i;
        }
      }
      if (best < 0 || bestV < strongest * 0.08) continue;
      const a = Math.log(arr[best - 1] + 1e-12);
      const b = Math.log(bestV + 1e-12);
      const g = Math.log(arr[best + 1] + 1e-12);
      const denom = a - 2 * b + g;
      const delta = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - g)) / denom)) : 0;
      sum += (((best + delta + lo) * binHz) / h) * bestV;
      wsum += bestV;
    }
    if (wsum <= 0) return hz;
    const refined = sum / wsum;
    // Refinement only fine-tunes; it never moves the estimate far.
    return Math.abs(Math.log2(refined / hz)) < 0.043 ? refined : hz;
  };

  // True if the odd overtones of `hz` (1st, 3rd, 5th) are mostly missing
  // while the even ones are there: then the real note is an octave up.
  // Unweighted spectrum, but ignoring anything under 150Hz (bass).
  const missingOddOvertones = (arr, hz) => {
    if (hz * 2 > PITCH_HI_HZ) return false;
    let odd = 0, even = 0;
    for (let h = 1; h <= 6; h++) {
      if (h * hz < 150) continue;
      const v = peakNear(arr, bin(h * hz), Math.max(1, (h * hz * 0.02) / binHz));
      if (h % 2) odd += v;
      else even += v;
    }
    return even > 0 && odd < even * 0.2;
  };

  // Full-range search, used to FIND a new note. conf 0 if nothing voice-like.
  function acquire() {
    let best = 0, bestHz = 0;
    for (let k = PITCH_LO_HZ / binHz; k <= PITCH_HI_HZ / binHz; k += 0.5) {
      const hz = k * binHz;
      let s = harmonicScore(weighted, hz);
      // Mild preference for staying near the current note (avoids octave
      // flips) — only while one is actually being held
      if (active && trackedHz) s *= 1 + 0.3 * Math.exp(-Math.pow(Math.log2(hz / trackedHz) / 0.2, 2));
      if (s > best) {
        best = s;
        bestHz = hz;
      }
    }
    if (!bestHz) return { hz: 0, conf: 0 };

    // Overtone correction: formants can make one overtone louder than the
    // note (an "ah" on 220Hz peaks at 660Hz). If the in-between overtones a
    // lower note would add are really there, the lower note is the pitch.
    // Measured against the candidate's own overtones, so stray energy from
    // other instruments landing in between doesn't pull the pitch down.
    let loudest = 0;
    for (let h = 1; h <= SCORE_HARMONICS; h++) if (h * bestHz >= 150) loudest = Math.max(loudest, peakNear(voice, bin(h * bestHz)));
    let bestD = 1;
    for (let d = 2; d <= 4 && bestHz / d >= PITCH_LO_HZ; d++) {
      const f = bestHz / d;
      let present = 0, checked = 0;
      for (let h = 1; h <= 2 * d; h++) {
        if (h % d === 0 || h * f < 150) continue;
        checked++;
        if (peakNear(voice, bin(h * f)) > loudest * 0.25) present++;
      }
      if (checked >= 2 && present >= checked * 0.75) bestD = d;
    }
    bestHz /= bestD;

    // Too few overtones can mean the candidate is itself an overtone whose
    // note lost a partial to the filters; a lower note only passes if it
    // adds audible overtones of its own.
    if (countAudible(weighted, bestHz) < 3) {
      let found = 0;
      for (let d = 2; d <= 4 && bestHz / d >= PITCH_LO_HZ; d++) {
        if (countAudible(weighted, bestHz / d) >= 3) {
          found = bestHz / d;
          break;
        }
      }
      if (!found) return { hz: 0, conf: 0 };
      bestHz = found;
    }

    if (missingOddOvertones(voice, bestHz)) bestHz *= 2;

    const conf = harmonicity(weighted, bestHz) * formantFactor(voice, bestHz);
    return { hz: refinePitch(voice, bestHz), conf };
  }

  // Local search around the tracked note, on the spectrum WITHOUT the drum
  // pass (which can smear a sliding partial). Covers about +/- a semitone
  // per frame (~60 semitones a second) — faster than a sung slide or run,
  // but too narrow to hop onto a different instrument's nearby note when
  // the singer stops. Larger jumps are picked up by the switch check.
  function follow(arr, scoreArr) {
    let best = 0, bestHz = 0;
    for (let c = -0.09; c <= 0.09; c += 0.01) {
      const hz = trackedHz * Math.pow(2, c);
      const s = harmonicScore(scoreArr, hz);
      if (s > best) {
        best = s;
        bestHz = hz;
      }
    }
    if (!bestHz) return { hz: 0, energy: 0, conf: 0 };
    // Octave check, only while a note is new: a singer basically never
    // jumps an exact octave mid-note, so after the first ~200ms the octave
    // is trusted and a clashing instrument can't flip the line.
    if (noteAge < 12) {
      if (missingOddOvertones(scoreArr, bestHz)) {
        if (++upperVotes >= 3) {
          bestHz *= 2;
          upperVotes = 0;
        }
      } else {
        upperVotes = 0;
      }
    }
    const hz = refinePitch(scoreArr, bestHz);
    // Strength measured with the bass range faded out too, so that once the
    // singer stops, a bass line sitting on the same pitch can't keep the
    // note alive.
    let e = 0;
    for (let h = 1; h * hz <= 5000 && h <= OUT_HARMONICS; h++) {
      const v = peakNear(scoreArr, bin(h * hz), 1.5);
      e += v * v;
    }
    // No vowel (formant) check while following: it was only there to keep
    // bass lines from being FOUND as a voice, and it's too strict for some
    // vowels mid-note ("ee" has a strong low resonance and weaker highs).
    return { hz, energy: Math.sqrt(e), conf: harmonicity(scoreArr, hz) };
  }

  // Returns whether a note is being held this frame.
  function track() {
    const pitchArr = following;
    if (active) {
      // Every few frames, check whether a clearly voice-like note has
      // started somewhere else (a new phrase over a sustained instrument
      // the tracker might still be holding).
      // Must be confirmed on consecutive checks, and an exact octave away
      // never counts (that's almost always an instrument's overtone).
      if (noteAge % 2 === 0 && noteAge > 12) {
        const a = acquire();
        const octaves = a.hz ? Math.log2(a.hz / trackedHz) : 0;
        const elsewhere = Math.abs(octaves) > 0.1 && Math.abs(octaves - Math.round(octaves)) > 0.08;
        if (a.hz && a.conf > 0.45 && elsewhere) {
          if (switchHz && Math.abs(Math.log2(a.hz / switchHz)) < 0.05) switchVotes++;
          else switchVotes = 1;
          switchHz = a.hz;
        } else {
          switchVotes = 0;
          switchHz = 0;
        }
        if (switchVotes >= 3) {
          trackedHz = switchHz;
          switchVotes = 0;
          switchHz = 0;
          misses = 0;
          refEnergy = 0;
          noteAge = 0;
          upperVotes = 0;
          return true;
        }
      }
      const f = follow(pitchArr, followingW);
      refEnergy = Math.max(refEnergy * 0.997, f.energy);
      if (f.hz && f.energy >= refEnergy * HOLD_RATIO && f.conf > 0.08) {
        trackedHz = f.hz;
        misses = 0;
        noteAge++;
        return true;
      }
      // Lost the thread — maybe the singer jumped further than follow()
      // looks. A confident new note elsewhere takes over immediately.
      const a = acquire();
      if (a.hz && a.conf > 0.45) {
        trackedHz = a.hz;
        misses = 0;
        refEnergy = 0;
        noteAge = 0;
        return true;
      }
      if (++misses > RELEASE_FRAMES) {
        active = false;
        return false;
      }
      return true; // brief gap (a consonant, a drum hit) — hold the note
    }
    // A new note must show up consistently for a few frames before it's
    // committed to. The very first frames of a note are the messiest (the
    // drum pass hasn't caught up with it yet, an instrument can briefly
    // outweigh it), and whatever pitch is committed to here gets followed.
    const a = acquire();
    if (a.hz && a.conf > 0.3) {
      if (candidateHz && Math.abs(Math.log2(a.hz / candidateHz)) < 0.05) candidateFrames++;
      else candidateFrames = 1;
      candidateHz = a.hz;
    } else {
      candidateFrames = 0;
      candidateHz = 0;
    }
    if (candidateFrames >= 3) {
      candidateFrames = 0;
      candidateHz = 0;
      active = true;
      trackedHz = a.hz;
      misses = 0;
      refEnergy = 0;
      noteAge = 0;
      upperVotes = 0;
      return true;
    }
    return false;
  }

  return {
    input,
    setMode(m) {
      mode = m;
      histFilled = 0;
      active = false;
      trackedHz = 0;
    },
    analyse() {
      mid.getFloatFrequencyData(dbMid);
      side.getFloatFrequencyData(dbSide);

      for (let i = 0; i < N; i++) {
        const m = Math.pow(10, dbMid[lo + i] / 20);
        const s = Math.pow(10, dbSide[lo + i] / 20);
        mix[i] = m;
        // |V + P/2| - |P/2| >= |V|: for a centered voice V plus a panned
        // part P, subtracting never removes the voice, and a purely panned
        // part (mid == side) goes to zero. On top of that, bins that are
        // still mostly side are faded: two instruments panned opposite ways
        // share an overtone and drift in and out of phase, faking a centered
        // sound for a moment. A real centered voice stays centered, so the
        // fade uses the side/mid ratio averaged over the last ~0.2s.
        const ratio = m > 0 ? s / m : 1;
        sideRatio[i] += (ratio - sideRatio[i]) * 0.08;
        centered[i] = mode === "stem" ? m : Math.max(0, m - s) * clamp01(1 - sideRatio[i] / 0.7);
        // Once a note is already found, only the subtraction is applied: a
        // voice's own stereo reverb puts steady side energy on its overtones
        // too, and the averaged fade above would dim it mid-note.
        following[i] = mode === "stem" ? m : Math.max(0, m - s);
        followingW[i] = following[i] * detectWeight[i];
      }

      // Drum pass
      for (let i = 0; i < N; i++) {
        const w = dilateWidth[i];
        let v = 0;
        for (let j = Math.max(0, i - w); j <= Math.min(N - 1, i + w); j++) if (centered[j] > v) v = centered[j];
        dilated[i] = v;
      }
      const row = histPos * N;
      for (let i = 0; i < N; i++) hist[row + i] = dilated[i];
      histPos = (histPos + 1) % HISTORY;
      histFilled = Math.min(HISTORY, histFilled + 1);
      for (let i = 0; i < N; i++) {
        for (let f = 0; f < histFilled; f++) tmp[f] = hist[f * N + i];
        const harm = median(tmp, histFilled);
        let n = 0;
        for (let j = i - FREQ_MEDIAN; j <= i + FREQ_MEDIAN; j++) tmp[n++] = centered[Math.min(N - 1, Math.max(0, j))];
        const perc = median(tmp, n);
        const h2 = harm * harm;
        const mask = h2 / (h2 + perc * perc + 1e-12);
        voice[i] = mode === "stem" ? mix[i] : centered[i] * mask;
        noise[i] = centered[i] * (1 - mask);
        weighted[i] = voice[i] * detectWeight[i];
      }

      const wasHeld = sinceVoiced === 0;
      const held = track();
      sinceVoiced = held ? 0 : sinceVoiced + 1;

      // ---- Publish ----
      const pitchArr = following;
      const harmonics = frame.harmonics;
      let energy = 0, centroidNum = 0, centroidDen = 0, strongest = 0;
      if (held && trackedHz) {
        for (let h = 1; h <= OUT_HARMONICS; h++) {
          const v = h * trackedHz <= HI_HZ ? peakNear(pitchArr, bin(h * trackedHz), 1.5) : 0;
          rawHarm[h - 1] = v;
          energy += v * v;
          if (v > strongest) strongest = v;
          centroidNum += v * h * trackedHz;
          centroidDen += v;
        }
        for (let h = 0; h < OUT_HARMONICS; h++) {
          const target = strongest > 0 ? rawHarm[h] / strongest : 0;
          harmonics[h] += (target - harmonics[h]) * 0.35;
        }
        // Pitch eases in log space: fast enough for a quick run, smooth
        // enough that analysis jitter doesn't read as a wobble.
        // A note that starts after silence starts right on its pitch instead
        // of gliding in from wherever the last phrase ended.
        frame.pitch = frame.pitch > 0 && sinceVoiced === 0 && wasHeld ? frame.pitch * Math.pow(trackedHz / frame.pitch, 0.45) : trackedHz;
      } else {
        for (let h = 0; h < OUT_HARMONICS; h++) harmonics[h] *= 0.9;
      }

      let loudTarget;
      if (mode === "stem") {
        // The stem is all voice: follow its total level, voiced or not, so
        // consonants and breaths move it too.
        let e = 0;
        for (let i = 0; i < N; i++) e += mix[i] * mix[i];
        loudTarget = clamp01((20 * Math.log10(Math.sqrt(e) + 1e-9) + 55) / 45);
      } else {
        loudTarget = held ? clamp01((20 * Math.log10(Math.sqrt(energy) + 1e-9) + 60) / 45) : 0;
      }
      frame.loudness += (loudTarget - frame.loudness) * (loudTarget > frame.loudness ? 0.5 : 0.18);

      frame.voiced += ((held ? 1 : 0) - frame.voiced) * (held ? 0.5 : 0.12);

      if (centroidDen > 0) {
        // Overtone centroid, ~250Hz ("oo" on a low note) to ~2.5kHz ("ee" up high), log scale
        const b = clamp01(Math.log(centroidNum / centroidDen / 250) / Math.log(10));
        frame.brightness += (b - frame.brightness) * 0.15;
      }

      // Breath/consonants: unpitched energy above 4kHz. In a live mix hats
      // live up there too, so it only counts right around sung notes.
      let ne = 0;
      for (let i = breathLo; i < N; i++) ne += noise[i] * noise[i];
      const breathDb = 20 * Math.log10(Math.sqrt(ne) + 1e-9);
      const nearVoice = mode === "stem" || sinceVoiced < 24;
      const breathTarget = nearVoice ? clamp01((breathDb + 62) / 30) : 0;
      frame.breath += (breathTarget - frame.breath) * (breathTarget > frame.breath ? 0.6 : 0.15);

      frame.source = mode;
      window.__voiceFrame = frame;
    },
    dispose() {
      nodes.forEach((n) => {
        try { n.disconnect(); } catch (e) {}
      });
      delete window.__voiceFrame;
    },
  };
}
