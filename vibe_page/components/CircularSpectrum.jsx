"use client";
// components/CircularSpectrum.jsx
// An original circular frequency-spectrum visualizer (technique inspired by
// dominikhofacker/audiovisualization, MIT). Reads the live FFT array published
// by lib/audioReactive.js (window.__audioFreq) and draws a symmetric ring of
// bars radiating outward. Renders as a fixed, full-screen canvas behind the UI
// and only draws while interactive mode is active.

import { useEffect, useRef } from "react";

export default function CircularSpectrum() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const BINS = 128; // lower/mid bands carry most of the visible energy

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const freq = window.__audioFreq;
      if (window.__audioReactiveActive && freq && freq.length) {
        const cx = W / 2;
        const cy = H / 2;
        const radius = Math.min(W, H) * 0.16; // inner ring radius
        const step = Math.PI / BINS; // half circle; mirrored to a full ring

        // overall bass energy -> base color (green calm → red loud),
        // matching the starfield's color language
        let bass = 0;
        for (let i = 1; i <= 24; i++) bass += freq[i];
        bass /= 24;
        const e = Math.min(1, bass / 220);
        const baseHue = 140 * (1 - e);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
        ctx.lineCap = "round";
        ctx.globalCompositeOperation = "lighter"; // additive glow

        for (let side = 0; side < 2; side++) {
          for (let i = 0; i < BINS; i++) {
            const v = freq[i] / 255; // 0..1
            const len = radius * (0.15 + v * 1.7);
            const angle =
              -Math.PI / 2 + (side === 0 ? i * step : -i * step);

            const x1 = Math.cos(angle) * radius;
            const y1 = Math.sin(angle) * radius;
            const x2 = Math.cos(angle) * (radius + len);
            const y2 = Math.sin(angle) * (radius + len);

            const hue = (baseHue + i * 0.8) % 360;
            ctx.strokeStyle = `hsla(${hue}, 100%, ${55 + v * 25}%, ${
              0.35 + v * 0.6
            })`;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }

        ctx.restore();
        ctx.globalCompositeOperation = "source-over";
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: -1, // above starfield (-3) / web (-2), behind the UI
      }}
    />
  );
}