"use client";

// Minimal BeatSync utility (TS)
export default class BeatSync {
  beats: number[]; // seconds
  getPositionSeconds: () => number;
  rafId: number | null = null;
  lastBeatIndex: number = -1;
  beatCallbacks: Array<() => void> = [];
  updateCallbacks: Array<(i: number, progress: number) => void> = [];

  constructor(beats: number[], getPositionSeconds: () => number) {
    this.beats = beats.slice();
    this.getPositionSeconds = getPositionSeconds;
  }

  onBeat(cb: () => void) {
    this.beatCallbacks.push(cb);
  }

  onUpdate(cb: (beatIndex: number, progress: number) => void) {
    this.updateCallbacks.push(cb);
  }

  start() {
    if (this.rafId) return;
    const loop = () => {
      const t = this.getPositionSeconds();
      let lo = 0, hi = this.beats.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.beats[mid] <= t) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (idx === -1) {
        this.invokeUpdate(-1, 0);
      } else {
        const beatStart = this.beats[idx];
        const nextStart = idx + 1 < this.beats.length ? this.beats[idx + 1] : beatStart + 1;
        const duration = Math.max(0.001, nextStart - beatStart);
        const progress = Math.max(0, Math.min(1, (t - beatStart) / duration));
        if (idx !== this.lastBeatIndex) {
          this.lastBeatIndex = idx;
          this.beatCallbacks.forEach(cb => { try { cb(); } catch (e) {} });
        }
        this.invokeUpdate(idx, progress);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  invokeUpdate(i: number, progress: number) {
    this.updateCallbacks.forEach(cb => {
      try { cb(i, progress); } catch (e) {}
    });
  }
}