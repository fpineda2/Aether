// AudioReactiveStarfield.jsx
// Theatrical, light-show-style renderer. Takes over the starfield + spiderweb
// canvases while interactive mode is on and drives them from real audio energy:
//  - additive "bloom" blending for an overexposed, glowing look
//  - stars swell hard and halo on beats
//  - color hue jumps on every beat
//  - full-screen radial flash on hits
//  - shockwave rings ripple outward on strong beats
//
// Consumes the globals published by app/layout.js: window.__starsData / __webData,
// and canvases with ids "starfield-bg" / "spiderweb-bg".

"use client";

import { useEffect } from "react";

export default function AudioReactiveStarfield() {
  useEffect(() => {
    let intensity = 0; // smoothed sustained energy, 0..1
    let flash = 0; // screen-flash amount, spikes on beats
    let hue = 120; // recomputed each frame from colorEnergy (green=calm → red=loud)
    let colorEnergy = 0; // 0..1, jumps to a beat's loudness, eases back to calm
    let rings = []; // expanding shockwaves
    let animationFrame = null;

    const spawnRing = (strength) => {
      const e = Math.min(1, Math.max(0, colorEnergy));
      rings.push({
        x: 0.5 + (Math.random() - 0.5) * 0.3,
        y: 0.5 + (Math.random() - 0.5) * 0.3,
        r: 0,
        life: 1,
        strength,
        hue: 200 * (1 - e), // ring keeps the color of the beat that spawned it
      });
      if (rings.length > 14) rings.shift();
    };

    const pulseEffects = () => {
      const starCanvas = document.getElementById("starfield-bg");
      const webCanvas = document.getElementById("spiderweb-bg");

      // Map current musical energy to color for this frame:
      // calm (0) -> green (140), loud (1) -> red (0).
      const e = Math.min(1, Math.max(0, colorEnergy));
      hue = 140 * (1 - e);

      // ---- STARS: swell + bloom, additive ----
      if (starCanvas && window.__starsData) {
        const sc = starCanvas.getContext("2d");
        const W = starCanvas.width;
        const H = starCanvas.height;
        const stars = window.__starsData;

        sc.clearRect(0, 0, W, H);
        sc.globalCompositeOperation = "lighter";

        for (const st of stars) {
          st.a += st.s;
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.a));
          const swell = 1 + intensity * 2.4 + flash * 1.6;
          const size = st.r * swell;
          const alpha = Math.min(
            1,
            twinkle * (0.4 + intensity * 0.9 + flash * 0.7)
          );

          // core
          sc.beginPath();
          sc.arc(st.x, st.y, size, 0, Math.PI * 2);
          sc.fillStyle = `hsla(${hue}, 100%, 78%, ${alpha})`;
          sc.fill();

          // bloom halo when there's energy
          const energy = intensity + flash;
          if (energy > 0.25) {
            sc.beginPath();
            sc.arc(st.x, st.y, size * 3.4, 0, Math.PI * 2);
            sc.fillStyle = `hsla(${hue}, 100%, 68%, ${0.09 * energy})`;
            sc.fill();
          }
        }
        sc.globalCompositeOperation = "source-over";
      }

      // ---- WEB + FLASH + RINGS ----
      if (webCanvas && window.__webData) {
        const ctx = webCanvas.getContext("2d");
        const { width, height, particles, mouse } = window.__webData;

        ctx.clearRect(0, 0, width, height);

        // full-screen beat flash (radial, additive)
        if (flash > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          const maxR = Math.max(width, height) * 0.8;
          const g = ctx.createRadialGradient(
            width / 2,
            height / 2,
            0,
            width / 2,
            height / 2,
            maxR
          );
          g.addColorStop(0, `hsla(${hue}, 100%, 66%, ${0.24 * flash})`);
          g.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = "source-over";
        }

        // shockwave rings
        ctx.globalCompositeOperation = "lighter";
        rings = rings.filter((r) => r.life > 0.03);
        for (const r of rings) {
          const rad = r.r * Math.max(width, height);
          ctx.beginPath();
          ctx.arc(width * r.x, height * r.y, rad, 0, Math.PI * 2);
          ctx.lineWidth = 1.5 + 5 * r.life * r.strength;
          ctx.strokeStyle = `hsla(${r.hue}, 100%, 72%, ${0.5 * r.life})`;
          ctx.stroke();
          r.r += 0.018 + 0.03 * r.strength;
          r.life *= 0.94;
        }

        // web particles + lines (additive, hue-shifted, energy-scaled)
        const light = 60 + intensity * 25 + flash * 15;
        ctx.lineWidth = 0.6 + intensity * 2.4 + flash * 2;

        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;

          const ps = 1.6 + intensity * 2.6 + flash * 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, ps, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, ${light}%, 0.85)`;
          ctx.fill();

          if (mouse.x != null && mouse.y != null) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 150) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.strokeStyle = `hsla(${hue}, 100%, ${light}%, ${
                (1 - dist / 150) * (0.4 + intensity * 0.6)
              })`;
              ctx.stroke();
            }
          }
        });

        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.hypot(dx, dy);
            if (dist < 150) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `hsla(${hue}, 100%, ${light}%, ${
                (1 - dist / 150) * (0.35 + intensity * 0.5 + flash * 0.35)
              })`;
              ctx.stroke();
            }
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // decays — snappy attack, quick fade for distinct pulses
      intensity *= 0.9;
      flash *= 0.86;

      // color eases back toward calm (green) between loud beats
      colorEnergy *= 0.96;

      animationFrame = requestAnimationFrame(pulseEffects);
    };

    const handleAudioPulse = (event) => {
      const d = event.detail || {};
      const inc = typeof d.intensity === "number" ? d.intensity : 0;
      const beat = !!d.beat;

      window.__audioReactiveActive = true;

      if (beat) {
        const strength =
          typeof d.beatStrength === "number" ? d.beatStrength : 0.4;
        const level = typeof d.bassLevel === "number" ? d.bassLevel : inc;
        // snap up on the hit
        intensity = Math.max(intensity, Math.max(0.85, inc));
        flash = Math.min(1.2, flash + 0.9);
        // louder hit -> toward red; softer hit -> stays green
        colorEnergy = Math.max(
          colorEnergy,
          Math.min(1, level * 0.85 + strength * 0.5)
        );
        spawnRing(0.6 + strength);
      } else {
        intensity += (inc - intensity) * 0.35;
      }

      if (!animationFrame) pulseEffects();
    };

    const handleStopAudioReactive = () => {
      window.__audioReactiveActive = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      intensity = 0;
      flash = 0;
      rings = [];
    };

    window.addEventListener("audio-pulse", handleAudioPulse);
    window.addEventListener("stop-audio-reactive", handleStopAudioReactive);

    return () => {
      window.removeEventListener("audio-pulse", handleAudioPulse);
      window.removeEventListener("stop-audio-reactive", handleStopAudioReactive);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.__audioReactiveActive = false;
    };
  }, []);

  return null;
}