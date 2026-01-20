"use client";
import React, { useRef, useEffect } from "react";

type Star = { x: number; y: number; size: number; baseAlpha: number; twinklePhase: number };

function hslToCss(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

export default function Starfield({
  width = 1200,
  height = 700,
  beatIntensity = 0,
  color = { h: 220, s: 70, l: 50 },
  starCount = 300
}: {
  width?: number;
  height?: number;
  beatIntensity?: number; // 0..1 spike amplitude
  color?: { h: number; s: number; l: number };
  starCount?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const colorRef = useRef(color);
  const intensityRef = useRef(0);

  useEffect(() => {
    const s: Star[] = [];
    for (let i = 0; i < starCount; i++) {
      s.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2.5 + 0.4,
        baseAlpha: Math.random() * 0.6 + 0.2,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }
    starsRef.current = s;
  }, [width, height, starCount]);

  useEffect(() => {
    colorRef.current = color;
  }, [color.h, color.s, color.l]);

  // animate starfield
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const c = colorRef.current;
      intensityRef.current = Math.max(intensityRef.current * 0.92, beatIntensity * 0.98);

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, hslToCss(c.h, c.s, Math.max(5, c.l - 40 * intensityRef.current)));
      grad.addColorStop(1, hslToCss((c.h + 40) % 360, Math.max(20, c.s - 20), Math.max(2, c.l - 60 * intensityRef.current)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const stars = starsRef.current;
      const time = performance.now();
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const twinkle = 0.5 + 0.5 * Math.sin((time * 0.002) + st.twinklePhase);
        const alpha = st.baseAlpha * (0.4 + 0.6 * twinkle) * (0.6 + 0.8 * intensityRef.current);
        // glow
        const glowRadius = st.size * (1 + intensityRef.current * 2.5);
        const grad2 = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, glowRadius * 2.5);
        grad2.addColorStop(0, hslToCss(c.h, c.s, Math.min(95, c.l + 50 * intensityRef.current), alpha));
        grad2.addColorStop(0.4, hslToCss(c.h, c.s, Math.min(80, c.l + 20 * intensityRef.current), alpha * 0.6));
        grad2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(st.x - glowRadius * 2.5, st.y - glowRadius * 2.5, glowRadius * 5, glowRadius * 5);

        // core
        ctx.beginPath();
        ctx.fillStyle = hslToCss(c.h, c.s, Math.min(100, c.l + 60 * intensityRef.current), alpha);
        ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: "block", width: "100%", height: "100%" }} />;
}