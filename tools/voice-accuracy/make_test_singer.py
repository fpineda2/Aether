# Builds a synthetic singing test: a voice over drums, bass and wide pads,
# plus the isolated voice as its own file. Unlike a real song this one has
# KNOWN ground truth — truth.json lists the exact pitch at every frame — so
# pitch error can be measured to the cent rather than against a stem that is
# itself an estimate. It is also licence-free, so it can live in the repo.
#
#   python make_test_singer.py           -> sing_mix.wav, sing_stem.wav, truth.json
#
# The voice is a formant-filtered pulse train: a glottal source shaped by
# three resonances, which is how a vowel is actually made. It glides between
# notes, has vibrato that grows into held notes, changes vowel mid-phrase,
# and has 's' consonants at syllable boundaries — all the things that made
# the earlier, simpler fixture too easy for the tracker.
import json

import numpy as np
import scipy.signal as sg
import soundfile as sf

SR = 44100
DURATION = 20
rng = np.random.default_rng(7)
n = SR * DURATION
t = np.arange(n) / SR

semis = lambda midi: 440 * 2 ** ((midi - 69) / 12)

# (start, end, [(seconds_in, midi_note), ...], [vowels])
PHRASES = [
    (2.0, 5.2, [(0, 57), (0.9, 57), (1.1, 60), (2.0, 60), (2.3, 64), (3.2, 62)], ["a", "e"]),
    # melisma, then a long held note
    (6.0, 9.5, [(0, 64), (0.5, 65), (0.7, 67), (0.9, 65), (1.1, 64), (1.3, 62), (1.5, 64), (3.5, 64)], ["o", "a", "i"]),
    (11.0, 14.5, [(0, 52), (1.0, 59), (2.2, 59), (3.5, 57)], ["u", "a"]),  # slow slide up
    (16.0, 19.0, [(0, 69), (3.0, 69)], ["i"]),  # high held note, deep vibrato
]

# (centre Hz, bandwidth, gain) per vowel — the first three formants
FORMANTS = {
    "a": [(730, 90, 1.0), (1090, 110, 0.5), (2440, 170, 0.3)],
    "e": [(530, 70, 1.0), (1840, 100, 0.45), (2480, 160, 0.3)],
    "i": [(300, 60, 1.0), (2300, 100, 0.5), (3000, 180, 0.35)],
    "o": [(570, 70, 1.0), (840, 90, 0.6), (2410, 170, 0.2)],
    "u": [(320, 60, 1.0), (870, 90, 0.4), (2250, 170, 0.15)],
}

voice = np.zeros(n)
f0_track = np.zeros(n)
consonants = np.zeros(n)

for start, end, points, vowels in PHRASES:
    i0, i1 = int(start * SR), int(end * SR)
    m = i1 - i0
    tt = np.arange(m) / SR
    midi = np.interp(tt, [p[0] for p in points], [p[1] for p in points])
    # vibrato grows in over the first ~0.6s of a note, deeper on the high phrase
    depth = np.clip((tt - 0.25) / 0.6, 0, 1) * (0.9 if start < 15 else 1.2)
    midi = midi + depth * 0.5 * np.sin(2 * np.pi * 5.6 * tt + rng.random())
    f = semis(midi)
    f0_track[i0:i1] = f

    phase = 2 * np.pi * np.cumsum(f) / SR
    source = sum(np.sin(h * phase) * (1 / h) * (1 + 0.1 * rng.standard_normal()) for h in range(1, 40))
    source += 0.03 * rng.standard_normal(m)  # breath

    y = np.zeros(m)
    env = np.ones(m)
    seg = m // len(vowels)
    for k, vowel in enumerate(vowels):
        a, b = k * seg, ((k + 1) * seg if k < len(vowels) - 1 else m)
        part = np.zeros(b - a)
        for hz, bw, gain in FORMANTS[vowel]:
            bb, aa = sg.iirpeak(hz / (SR / 2), hz / bw)
            part += sg.lfilter(bb, aa, source[a:b]) * gain
        y[a:b] = part
        if k > 0:  # an 's' at the syllable boundary, with the vowel dipping under it
            c = int(0.09 * SR)
            env[a - c // 2 : a - c // 2 + c] *= np.concatenate(
                [np.linspace(1, 0.15, c // 2), np.linspace(0.15, 1, c - c // 2)]
            )
            burst = sg.lfilter(*sg.butter(4, [4500 / (SR / 2), 9500 / (SR / 2)], "band"),
                               rng.standard_normal(c)) * np.hanning(c) * 0.6
            consonants[i0 + a - c // 2 : i0 + a - c // 2 + c] += burst

    env *= np.minimum(1, np.minimum(tt / 0.05, (tt[-1] - tt) / 0.15))  # attack/release
    env *= 1 + 0.25 * np.sin(2 * np.pi * 0.7 * tt)  # phrasing swell
    voice[i0:i1] = y * env

voice = voice / np.abs(voice).max() * 0.55 + consonants * 0.5


def reverb(x, seed):
    r = np.random.default_rng(seed)
    out = np.zeros_like(x)
    for _ in range(18):
        d = int(r.uniform(0.02, 0.35) * SR)
        out[d:] += x[:-d] * r.uniform(0.05, 0.18) * np.exp(-d / SR * 4)
    return out


# decorrelated reverb per side, so the voice is centred but not mono
vL, vR = voice + reverb(voice, 1), voice + reverb(voice, 2)

L = np.zeros(n)
R = np.zeros(n)

# kick on the beat, snare off it, hats in between — all centred
for beat in np.arange(0, DURATION, 0.5):
    i, m = int(beat * SR), int(0.35 * SR)
    tt = np.arange(m) / SR
    kick = np.sin(2 * np.pi * (45 * tt + (75 / 8) * (1 - np.exp(-8 * tt)))) * np.exp(-9 * tt) * 0.9
    e = min(n, i + m)
    L[i:e] += kick[: e - i]
    R[i:e] += kick[: e - i]
for beat in np.arange(0.25, DURATION, 0.5):
    i, m = int(beat * SR), int(0.2 * SR)
    tt = np.arange(m) / SR
    snare = (rng.standard_normal(m) * 0.5 + np.sin(2 * np.pi * 200 * tt) * 0.4) * np.exp(-18 * tt) * 0.6
    e = min(n, i + m)
    L[i:e] += snare[: e - i]
    R[i:e] += snare[: e - i]
hats = sg.lfilter(*sg.butter(4, 7000 / (SR / 2), "high"), rng.standard_normal(n))
env = np.zeros(n)
for beat in np.arange(0, DURATION, 0.125):
    i, m = int(beat * SR), int(0.05 * SR)
    decay = np.exp(-60 * np.arange(m) / SR)
    env[i : i + m] += decay[: len(env[i : i + m])]
L += hats * env * 0.15
R += hats * env * 0.15

# centred bass, alternating between two notes
bass_f = np.where((t % 2) < 1, 82.4, 110.0)
bass = sg.lfilter(*sg.butter(2, 400 / (SR / 2)), sg.sawtooth(2 * np.pi * np.cumsum(bass_f) / SR)) * 0.35
L += bass
R += bass

# pads: different chord tones on each side, so they're wide, not centred
lowpass = sg.butter(2, 1800 / (SR / 2))
pad = lambda freqs: sum(sg.sawtooth(2 * np.pi * f * t + rng.random() * 6) for f in freqs)
L += sg.lfilter(*lowpass, pad([261.6, 329.6])) * 0.08
R += sg.lfilter(*lowpass, pad([392.0, 493.9])) * 0.08

L += vL
R += vR

peak = max(np.abs(L).max(), np.abs(R).max()) / 0.9
sf.write("sing_mix.wav", np.stack([L, R], 1) / peak, SR, subtype="PCM_16")
stem_peak = max(np.abs(vL).max(), np.abs(vR).max()) / 0.9
sf.write("sing_stem.wav", np.stack([vL, vR], 1) / stem_peak, SR, subtype="PCM_16")
json.dump([float(f0_track[i]) for i in range(0, n, SR // 60)], open("truth.json", "w"))
print("wrote sing_mix.wav, sing_stem.wav, truth.json")
