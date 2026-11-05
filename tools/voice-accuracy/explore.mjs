// Candidate-feature explorer.
//
// Computes several "is this actually a voice?" measures per frame, straight
// from its own spectra, and scores each one against ground truth from the
// isolated vocal stem. Nothing here touches lib/voiceAnalysis.js: a feature
// has to earn its way in by the numbers this prints before it gets wired up.
//
//   node explore.mjs mix1.wav vocals1.wav [mix2.wav vocals2.wav ...]
//
// The library still supplies the tracked pitch (live mode) and the labels
// (stem mode) — the features describe whatever note the tracker is currently
// holding, which is exactly where its false positives come from.
import fs from "fs";
import { readWav, mkAnalyser } from "./wav.mjs";
globalThis.window = globalThis;
const { createVoiceAnalyzer } = await import("../../vibe_page/lib/voiceAnalysis.js");

const FFT = 4096;
const WINDOW = 90; // frames (~1.5s) of history for the modulation measures
const HARMONICS = 8;

function runLib(file, mode) {
  const { sr, L, R } = readWav(file);
  const mid = mkAnalyser(), side = mkAnalyser();
  let made = 0;
  const node = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  const ctx = { sampleRate: sr, createGain: node, createChannelSplitter: node, createAnalyser: () => (made++ === 0 ? mid : side) };
  const v = createVoiceAnalyzer(ctx);
  v.setMode(mode);
  mid._sig = L.map((x, i) => (x + R[i]) / 2);
  side._sig = L.map((x, i) => (x - R[i]) / 2);
  const hop = Math.round(sr / 60), out = [];
  for (let p = FFT; p < L.length; p += hop) {
    mid._pos = side._pos = p;
    v.analyse();
    const f = window.__voiceFrame;
    out.push({ voiced: f.voiced, pitch: f.pitch, loudness: f.loudness });
  }
  return out;
}

// Features computed on our own spectra, for the note the tracker is holding.
function features(file, live) {
  const { sr, L, R } = readWav(file);
  const mid = mkAnalyser(), side = mkAnalyser();
  mid._sig = L.map((x, i) => (x + R[i]) / 2);
  side._sig = L.map((x, i) => (x - R[i]) / 2);
  const binHz = sr / FFT;
  const dbM = new Float32Array(FFT / 2), dbS = new Float32Array(FFT / 2);
  const magM = new Float32Array(FFT / 2), magS = new Float32Array(FFT / 2);
  const peak = (arr, hz, tol = 1.5) => {
    const c = hz / binHz;
    let m = 0;
    for (let i = Math.max(0, Math.floor(c - tol)); i <= Math.min(arr.length - 1, Math.ceil(c + tol)); i++) if (arr[i] > m) m = arr[i];
    return m;
  };
  const hop = Math.round(sr / 60);
  const energyHist = [], pitchHist = [], out = [];

  // Magnitude of a 3-8Hz (or 4-8Hz) modulation in a 1.5s history, as a
  // fraction of its own mean: speech and singing pulse at syllable rate,
  // a held instrument note does not.
  const modulation = (hist, loF, hiF) => {
    const n = hist.length;
    if (n < WINDOW * 0.8) return 0;
    const mean = hist.reduce((a, b) => a + b, 0) / n;
    let best = 0;
    for (let f = loF; f <= hiF; f += 0.5) {
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const t = i / 60, w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
        const x = (hist[i] - mean) * w;
        re += x * Math.cos(2 * Math.PI * f * t);
        im += x * Math.sin(2 * Math.PI * f * t);
      }
      best = Math.max(best, (2 * Math.hypot(re, im)) / n);
    }
    return best;
  };

  for (let k = 0, p = FFT; p < L.length && k < live.length; p += hop, k++) {
    mid._pos = side._pos = p;
    mid.getFloatFrequencyData(dbM);
    side.getFloatFrequencyData(dbS);
    for (let i = 0; i < FFT / 2; i++) {
      magM[i] = Math.pow(10, dbM[i] / 20);
      magS[i] = Math.pow(10, dbS[i] / 20);
    }
    // How wide the WHOLE mix is right now, across the vocal range: the
    // baseline a note's own width should be judged against. A song drenched
    // in stereo reverb makes everything wide, including the voice.
    let mixMid = 0, mixSide = 0;
    for (let i = Math.round(200 / binHz); i < Math.round(4000 / binHz); i++) { mixMid += magM[i]; mixSide += magS[i]; }
    const mixWidth = mixMid > 0 ? mixSide / mixMid : 1;

    const hz = live[k].pitch;
    let on = 0, off = 0, sideE = 0, midE = 0;
    if (hz > 0) {
      for (let h = 1; h <= HARMONICS; h++) {
        if (h * hz > 5000) break;
        on += peak(magM, h * hz);
        off += peak(magM, (h + 0.5) * hz);
        midE += peak(magM, h * hz);
        sideE += peak(magS, h * hz);
      }
    }
    energyHist.push(on);
    pitchHist.push(hz > 0 ? Math.log2(hz) * 1200 : (pitchHist.length ? pitchHist[pitchHist.length - 1] : 0));
    if (energyHist.length > WINDOW) { energyHist.shift(); pitchHist.shift(); }

    out.push({
      // Breath between the harmonics. A voice is never perfectly clean;
      // reeds and brass very nearly are.
      hnr: on > 0 ? 20 * Math.log10(on / (off + 1e-9)) : 0,
      // Is the held note actually centred, measured on its own harmonics?
      sideRatio: midE > 0 ? sideE / midE : 1,
      // The same, but relative to how wide the whole mix is: below 1 means
      // this note is more centred than the music around it.
      relCenter: midE > 0 ? (sideE / midE) / (mixWidth + 1e-9) : 9,
      // Syllable-rate pulsing of the note's energy (3-8Hz).
      syllableAM: on > 0 ? modulation(energyHist, 3, 8) / (energyHist.reduce((a, b) => a + b, 0) / energyHist.length + 1e-9) : 0,
      // Vibrato: periodic pitch movement at 4-8Hz, in cents.
      vibrato: modulation(pitchHist, 4, 8),
    });
  }
  return out;
}

const q = (a, x) => { const s = a.slice().sort((p, n) => p - n); return s[Math.floor(x * (s.length - 1))]; };

function report(name, voiced, silent, higherIsVoice) {
  if (!voiced.length || !silent.length) return;
  console.log(`\n${name}  (voice ${higherIsVoice ? "higher" : "lower"} = good)`);
  console.log(`  voice     p10 ${q(voiced,0.1).toFixed(2).padStart(7)}  p25 ${q(voiced,0.25).toFixed(2).padStart(7)}  med ${q(voiced,0.5).toFixed(2).padStart(7)}  p75 ${q(voiced,0.75).toFixed(2).padStart(7)}`);
  console.log(`  no voice  p10 ${q(silent,0.1).toFixed(2).padStart(7)}  p25 ${q(silent,0.25).toFixed(2).padStart(7)}  med ${q(silent,0.5).toFixed(2).padStart(7)}  p75 ${q(silent,0.75).toFixed(2).padStart(7)}`);
  // best threshold by net gain (keep% + reject% - 100); 0 means useless
  let best = { net: -1e9 };
  const lo = Math.min(...voiced, ...silent), hi = Math.max(...voiced, ...silent);
  for (let i = 0; i <= 40; i++) {
    const t = lo + ((hi - lo) * i) / 40;
    const keep = 100 * (higherIsVoice ? voiced.filter((v) => v >= t).length : voiced.filter((v) => v <= t).length) / voiced.length;
    const rej = 100 * (higherIsVoice ? silent.filter((v) => v < t).length : silent.filter((v) => v > t).length) / silent.length;
    if (keep + rej - 100 > best.net) best = { net: keep + rej - 100, t, keep, rej };
  }
  console.log(`  best cut: ${best.t.toFixed(2)} -> keeps ${best.keep.toFixed(0)}% of voice, rejects ${best.rej.toFixed(0)}% of false voice (net ${best.net >= 0 ? "+" : ""}${best.net.toFixed(0)})`);
  if (best.net > 15) {
    console.log("  trade curve:");
    for (let i = 1; i <= 9; i++) {
      const t = q(voiced, i / 10);
      const keep = 100 * (higherIsVoice ? voiced.filter((v) => v >= t).length : voiced.filter((v) => v <= t).length) / voiced.length;
      const rej = 100 * (higherIsVoice ? silent.filter((v) => v < t).length : silent.filter((v) => v > t).length) / silent.length;
      console.log(`    cut ${t.toFixed(3).padStart(7)}  keeps ${keep.toFixed(0).padStart(3)}% voice  rejects ${rej.toFixed(0).padStart(3)}% false  net ${(keep + rej - 100 >= 0 ? "+" : "") + (keep + rej - 100).toFixed(0)}`);
    }
  }
}

const args = process.argv.slice(2);
const pairs = [];
for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
if (!pairs.length) { console.error("usage: node explore.mjs <mix.wav> <vocals.wav> [...]"); process.exit(1); }

const acc = {};
for (const [mix, voc] of pairs) {
  const live = runLib(mix, "live"), stem = runLib(voc, "stem");
  const feats = features(mix, live);
  const n = Math.min(live.length, stem.length, feats.length);
  for (let i = 0; i < n; i++) {
    if (live[i].voiced <= 0.5) continue; // only frames the filter currently believes
    const bucket = stem[i].voiced > 0.5 ? "voiced" : "silent";
    for (const k of Object.keys(feats[i])) {
      acc[k] ??= { voiced: [], silent: [] };
      acc[k][bucket].push(feats[i][k]);
    }
  }
  console.log(`scored ${mix.split(/[\\/]/).pop()}`);
}

console.log(`\n=== candidate features, all tracks combined ===`);
report("harmonic-to-noise ratio (dB)", acc.hnr.voiced, acc.hnr.silent, false);
report("side/mid at the note's harmonics", acc.sideRatio.voiced, acc.sideRatio.silent, false);
report("syllable-rate AM, 3-8Hz (relative)", acc.syllableAM.voiced, acc.syllableAM.silent, true);
report("vibrato, 4-8Hz pitch movement (cents)", acc.vibrato.voiced, acc.vibrato.silent, true);
report("note width RELATIVE to the mix", acc.relCenter.voiced, acc.relCenter.silent, false);
