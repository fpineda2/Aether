"use client";
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import styles from "../styles/Starfield.module.css";

/*
  Starfield.jsx
  - Canvas-based starfield
  - Exposes beatPulse(colorHex) method on ref to trigger a pulse
  - Props: width, height, palette
*/
const Starfield = forwardRef(({ width = 1400, height = 720, palette = null }, ref) => {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const pulseRef = useRef({ t: 0, color: null });
  const rafRef = useRef(null);
  const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(DPR, DPR);

    const count = Math.max(80, Math.floor((width * height) / 9000) + 60);
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.2,
        baseAlpha: Math.random() * 0.6 + 0.08,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    starsRef.current = stars;

    let last = performance.now();
    function loop(now) {
      const dt = (now - last) / 1000;
      last = now;
      update(dt);
      render(ctx, width, height);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function update(dt) {
    if (pulseRef.current.t > 0) pulseRef.current.t = Math.max(0, pulseRef.current.t - dt);
    starsRef.current.forEach((s, i) => {
      s.twinkle += dt * (0.6 + (i % 3) * 0.04);
    });
  }

  function render(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#040412";
    ctx.fillRect(0, 0, w, h);

    const pulse = pulseRef.current;
    starsRef.current.forEach((s) => {
      const tw = (Math.sin(s.twinkle) + 1) * 0.5 * 0.7 + s.baseAlpha;
      if (pulse.t > 0 && pulse.color) {
        const intensity = Math.min(1, pulse.t / 0.35);
        ctx.fillStyle = blendColorWithWhite(pulse.color, tw, intensity);
      } else {
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
      }
      const scale = 1 + (pulse.t > 0 ? pulse.t * 0.7 : 0);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * scale, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function blendColorWithWhite(hex, baseAlpha, intensity = 1) {
    const rgb = hexToRgb(hex) || { r: 255, g: 190, b: 120 };
    // alpha boosted by intensity and baseAlpha
    const a = Math.min(0.95, 0.25 + baseAlpha * 1.2 * intensity);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    if (hex.startsWith("rgb")) {
      const parts = hex.match(/\d+/g) || [];
      return { r: +parts[0] || 255, g: +parts[1] || 255, b: +parts[2] || 255 };
    }
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return null;
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  useImperativeHandle(ref, () => ({
    beatPulse: (hexColor) => {
      pulseRef.current = { t: 0.35, color: hexColor || randomPaletteColor() };
    },
  }));

  function randomPaletteColor() {
    if (Array.isArray(palette) && palette.length) {
      return palette[Math.floor(Math.random() * palette.length)];
    }
    const choices = ["#ff4d6d", "#7ce1b5", "#6ec4ff", "#ffd56e", "#c97bff"];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  return <canvas ref={canvasRef} className={styles.starfieldCanvas} aria-hidden="true" />;
});

export default Starfield;