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

45-second excerpts, three genres, split with `htdemucs`:

| | banda (Cuisillos) | norteño (Inquietos) | rap (Akwid) |
|---|---|---|---|
| sung frames caught | 96% | 99% | 70% |
| median pitch gap | 6c | 7c | 17c |
| within a quarter-tone | 74% | 63% | 68% |
| **false voice in gaps** | 72% | 91% | 42% |

Conclusions:

- **Pitch tracking is solid.** When it is on the voice it sits within 6–17 cents
  of the stem — far finer than anyone can see in a visual.
- **Sustained lead instruments are the real failure.** A centered, harmonic,
  held accordion or trumpet line passes every test the filter applies. This is
  the 91% in norteño, and the large p75/p90 pitch errors are the tracker sliding
  onto the accordion.
- **Rapped vocals get missed** about a third of the time: speech is neither
  sustained nor steadily pitched.

### Ideas tested and rejected

Both were measured on real mixes and failed, so neither is in the library:

- **Articulation, broad**: how much the whole spectral envelope moves over
  ~100ms, on the theory that a singer's formants never sit still. It separates
  voice from instruments cleanly on *isolated stems* (voice ~1.43 vs instruments
  ~0.81) but not on a *mix*, where the whole arrangement churns: voiced frames
  scored 1.535 against 1.556 for frames with no voice at all.
- **Articulation, per-note**: the same idea restricted to the tracked note's own
  overtone profile. Also flat (0.954 voiced vs 1.003 unvoiced) — when no one is
  singing, the tracker is sitting on some instrument whose profile is being
  churned by everything overlapping it.

### Idea that did hold up

- **Maximum pitch wander.** Counter to expectation, false frames wander *more*
  than real singing (median 222c vs 92c over 0.5s) because the tracker hops
  between instruments. Dropping a note that wanders more than ~650c keeps 96% of
  genuine singing while cutting 13% of false voice. Tightening to 300c cuts 40%
  of the false voice but loses 22% of real singing, which brings back the
  dropouts the note tracker exists to prevent. Not yet wired into the library.
