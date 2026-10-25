# Voice accuracy tools

Measures how closely Aether's by-ear voice tracking (`vibe_page/lib/voiceAnalysis.js`
in **live** mode) matches the same analysis reading an **isolated vocal stem**. The
stem read is the reference: it hears only the voice, so wherever the two disagree,
the live filter is what's wrong.

Nothing here ships with the site — it's a dev harness, and it never touches the
browser: `wav.mjs` stands in for the Web Audio `AnalyserNode` so the real library
runs under Node against files.

## Setup

Splitting stems needs Demucs plus two small packages (PyTorch is Demucs's own
dependency):

```bash
pip install demucs omegaconf soundfile
```

`soundfile` is what lets these scripts read mp3 without ffmpeg installed.
`split.py` deliberately avoids the `demucs` CLI, which additionally wants PyAV
and dora; it calls the model directly instead. The model weights (~80 MB,
`htdemucs`) download themselves on first run and are cached.

## Use

```bash
# 1. make a WAV excerpt of a song that has vocals (any length; 45s is plenty)
python -c "import soundfile as sf; d,sr = sf.read('song.mp3', start=44100*75, frames=44100*45, always_2d=True); sf.write('mix.wav', d, sr, subtype='PCM_16')"

# 2. split the voice out (~1x realtime on CPU) -> stem_vocals.wav, stem_other.wav
python split.py mix.wav stem

# 3. compare the live filter against the stem
node compare.mjs mix.wav stem_vocals.wav
```

`compare.mjs` reports:

- **how much of the singing the live filter caught**, per the stem
- **how often it invents a voice** where the stem is silent
- **the pitch gap** between the two, in cents

`feature-check.mjs` evaluates one candidate gate — how much pitch wanders over
half a second — across several tracks at once, printing what each threshold would
keep and reject:

```bash
node feature-check.mjs mix1.wav vocals1.wav mix2.wav vocals2.wav
```

It's written to be edited: swap the measured quantity for whatever feature you're
testing next, and it prints the same keep/reject trade table.

## What's been measured (Oct 2026)

45-second excerpts, three genres, split with `htdemucs`, plus a synthetic
singer (`make_test_singer.py`) whose exact pitch is known.

| | banda | norteño | rap | synthetic |
|---|---|---|---|---|
| sung frames caught | 96% → **93%** | 99% → **94%** | 70% → **60%** | 99% → **88%** |
| false voice in gaps | 72% → **37%** | 91% → **80%** | 42% → **16%** | 2% → **0%** |
| pitch within a quarter-tone | 74% → **78%** | 63% → **70%** | 68% → **77%** | 91% → **98%** |

(before → after the note-centeredness gate described below)

Standing conclusions:

- **Pitch tracking is solid.** Where it tracks, it sits within a few cents of
  the stem — finer than anyone can see in a visual.
- **Deciding whether a voice is present at all is the weak part**, and
  sustained centered lead instruments are why: a held accordion or trumpet
  line passes nearly every test a spectrum can apply. Norteño remains the
  hardest case.
- **Rapped vocals still get missed** about 40% of the time. Speech is neither
  sustained nor steadily pitched, and the acquisition gate wants both. This is
  the next thing worth attacking.

## Features tested

Each was computed in `explore.mjs` and scored against stem ground truth before
any of it touched the library. "Net" is `kept voice % + rejected false voice %
- 100`, so 0 means the feature is worthless and 100 means perfect.

| feature | net | verdict |
|---|---|---|
| **note centeredness** — side/mid on the tracked note's own overtones | **+34** | **adopted** |
| pitch wander over 0.5s (a ceiling, not a floor) | +8…+29 | not used; overlaps with the above |
| syllable-rate AM, 3–8 Hz, of the note's energy | +8 | too weak |
| note width relative to the whole mix's width | +7 | normalizing destroys the signal |
| harmonic-to-noise ratio at the note | +0 | useless |
| vibrato, 4–8 Hz periodic pitch movement | +0 | useless |
| articulation — whole-spectrum envelope movement | ~0 | separates on stems, flat on mixes |
| articulation — the tracked note's overtone profile | ~0 | same |

Notes on the two that surprised me:

- **Articulation** was the strongest-looking idea on paper: a singer's mouth
  never stops moving, an accordion's shape is fixed. On *isolated stems* it
  separates cleanly (voice ~1.43 vs instruments ~0.81). On a *mix* it is flat
  (1.535 voiced vs 1.556 unvoiced) because the whole arrangement churns —
  "something moved" says nothing about whether it was a voice. The per-note
  version failed too (0.954 vs 1.003): when nobody sings, the tracker is
  sitting on an instrument whose profile is being churned by whatever overlaps
  it.
- **Pitch wander** is backwards from the intuition. False frames wander *more*
  than real singing (median 222c vs 92c over 0.5s), because with no voice to
  hold, the tracker hops between instruments.

### The adopted gate

`noteCenterFactor` in `lib/voiceAnalysis.js`: the side/mid energy of the note
being considered, measured on its own overtones, faded between 0.20 (centered,
full confidence) and 0.45 (wide, none). It gates **acquisition only**. Gating
every frame scored slightly better on the three real songs but cost a third of
a reverberant vocal's frames (99% → 65% on the synthetic fixture), because
heavy stereo reverb and doubled rap vocals are genuinely wide. Gating just the
decision to start following keeps instruments out while letting a wide voice
stay once found.

