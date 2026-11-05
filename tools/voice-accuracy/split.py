# Splits a WAV into vocals / accompaniment with Demucs, without the CLI
# (which needs PyAV and dora). Reads and writes via soundfile instead.
import sys, time, torch, numpy as np, soundfile as sf
from demucs.pretrained import get_model
from demucs.apply import apply_model

src, out_prefix = sys.argv[1], sys.argv[2]
data, sr = sf.read(src, dtype='float32', always_2d=True)
if data.shape[1] == 1:
    data = np.repeat(data, 2, axis=1)
wav = torch.from_numpy(data.T)  # (channels, samples)

t0 = time.time()
model = get_model("htdemucs")
model.eval()
print(f"model loaded in {time.time()-t0:.0f}s | sources: {model.sources} | model sr: {model.samplerate}", flush=True)

ref = wav.mean(0)
wav_n = (wav - ref.mean()) / (ref.std() + 1e-8)
t0 = time.time()
with torch.no_grad():
    est = apply_model(model, wav_n[None], device="cpu", split=True,
                      overlap=0.1, progress=True)[0]
print(f"separated in {time.time()-t0:.0f}s", flush=True)
est = est * (ref.std() + 1e-8) + ref.mean()

for name, source in zip(model.sources, est):
    if name in ("vocals", "other"):
        path = f"{out_prefix}_{name}.wav"
        sf.write(path, source.numpy().T, sr, subtype='PCM_16')
        print("wrote", path, flush=True)
