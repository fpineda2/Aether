"use client";
// components/Intro.jsx
// Abstract, layered nebula intro with interactive orb -> "Rendering experience" -> massive explosion.
// Includes audio playback (user-provided file placed in public/audio/intro.mp3).
//
// Behavior summary:
// - Idle: rich, abstract, multi-layered nebula built from SVG turbulence + CSS gradients + rotating layers.
// - On user click (orb or Start experience): create AudioContext, start audio playback, start progress.
// - When progress finishes: trigger explosion (canvas particle burst + bloom layers) and fade audio out,
//   then call onFinish() so the app can continue.
//
// Notes:
// - Browsers block autoplay — audioContext and playback are created on user interaction (startRender).
// - Audio file at /public/audio/intro.mp3 
// - Tweak durations, particle count and audio fade settings below.

import React, { useEffect, useRef, useState } from "react";
import styles from "./Intro.module.css";

const AUDIO_PATH = "/audio/intro.mp3"; // put your audio file in public/audio/intro.mp3

export default function Intro({ onFinish }) {
  const [stage, setStage] = useState("idle"); // idle | rendering | explode
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);
  const turbRef = useRef(null);
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animRef = useRef(null);

  // audio refs
  const audioElRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainRef = useRef(null);
  const mediaSrcRef = useRef(null);

  // timing configuration
  const RENDER_DURATION = 3200;
  const EXPLOSION_DURATION = 1100;
  const PARTICLE_COUNT = 160;

  useEffect(() => {
    // subtle turb animation for nebula motion
    let t = 0;
    let raf = 0;
    function tick() {
      t += 0.0068;
      const turb = turbRef.current;
      if (turb) {
        const bf = 0.48 + Math.sin(t * 0.9) * 0.09 + Math.cos(t * 0.33) * 0.02;
        turb.setAttribute("baseFrequency", bf.toFixed(3));
        turb.setAttribute("seed", Math.floor(4 + Math.sin(t * 0.78) * 2));
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopParticleLoop();
      if (audioElRef.current) {
        try { audioElRef.current.pause(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  // Start the render sequence (called on user interaction)
  function startRender() {
    if (stage !== "idle") return;
    setStage("rendering");
    setProgress(0);

    // Create audio context and start audio (must be done in user gesture)
    initAndPlayAudio();

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const pct = Math.min(1, elapsed / RENDER_DURATION);
      setProgress(Math.round(pct * 100));
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        // short pause then explosion
        setTimeout(() => {
          setStage("explode");
          startExplosion();
          // fade audio out during explosion
          fadeOutAudio(0.9);
          // finish after explosion
          setTimeout(() => {
            onFinish && onFinish();
            // stop particles a bit after
            setTimeout(() => stopParticleLoop(), 400);
          }, EXPLOSION_DURATION + 180);
        }, 260);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startRender();
    }
  }

  // ---------- Audio helpers ----------
  function initAndPlayAudio() {
    // create <audio> element lazily
    if (!audioElRef.current) {
      const a = new Audio(AUDIO_PATH);
      a.preload = "auto";
      a.loop = false;
      a.crossOrigin = "anonymous";
      audioElRef.current = a;
    }

    // create AudioContext and connect to gain node for fades
    if (!audioCtxRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaElementSource(audioElRef.current);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1, ctx.currentTime);
        src.connect(gain);
        gain.connect(ctx.destination);
        mediaSrcRef.current = src;
        gainRef.current = gain;
      } catch (e) {
        // WebAudio may fail in some contexts; we'll fallback to direct audio play
        audioCtxRef.current = null;
        gainRef.current = null;
        mediaSrcRef.current = null;
      }
    }

    // Some browsers require a resume call on AudioContext after user gesture
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Start playback (audio element)
    try {
      audioElRef.current.currentTime = 0;
      const p = audioElRef.current.play();
      if (p && p.catch) p.catch(() => {
        // ignore play rejection
      });
    } catch (e) {
      // ignore
    }
  }

  function fadeOutAudio(durationSeconds = 0.9) {
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    if (ctx && gain) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value || 1, now);
      gain.gain.linearRampToValueAtTime(0.001, now + durationSeconds);
      // stop audio after fade
      setTimeout(() => {
        try { audioElRef.current && audioElRef.current.pause(); } catch (e) {}
      }, durationSeconds * 1000 + 120);
    } else if (audioElRef.current) {
      // fallback: reduce volume with intervals
      let vol = audioElRef.current.volume || 1;
      const steps = 12;
      const stepMs = (durationSeconds * 1000) / steps;
      const id = setInterval(() => {
        vol = Math.max(0, vol - 1 / steps);
        try { audioElRef.current.volume = vol; } catch (e) {}
        if (vol <= 0.02) {
          clearInterval(id);
          try { audioElRef.current.pause(); } catch (e) {}
        }
      }, stepMs);
    }
  }

  // ---------- Canvas particle system (explosion) ----------
  function initCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function spawnParticles() {
    const rect = document.body.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 14;
      const size = 3 + Math.random() * 18;
      const life = 800 + Math.random() * 1200;
      // constrain hue to cool -> violet (200..320)
      const hue = 200 + Math.random() * 120;
      const sat = 62 + Math.random() * 30;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        life,
        age: 0,
        hue,
        sat,
        alpha: 0.9 - Math.random() * 0.18,
        friction: 0.988 + Math.random() * 0.01,
      });
    }
    particlesRef.current = particles;
  }

  function drawParticles() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      // frame update is handled in particleLoop for correctness; here just draw based on state
      const lifeRatio = 1 - p.age / p.life;
      if (lifeRatio <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const radius = p.size * Math.max(0.28, lifeRatio);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
      g.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, 72%, ${0.95 * lifeRatio * p.alpha})`);
      g.addColorStop(0.45, `hsla(${p.hue}, ${p.sat}%, 60%, ${0.5 * lifeRatio * p.alpha})`);
      g.addColorStop(1, `hsla(${p.hue}, ${p.sat}%, 38%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function particleLoop(timestamp) {
    if (!animRef.current) animRef.current = { last: timestamp };
    const dt = timestamp - animRef.current.last;
    animRef.current.last = timestamp;
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      const f = Math.pow(p.friction, dt / 16);
      p.vx *= f;
      p.vy *= f;
      p.vy += 0.06 * (dt / 16);
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
    }
    drawParticles();
    if (particles.length > 0) {
      animRef.current.raf = requestAnimationFrame(particleLoop);
    } else {
      stopParticleLoop();
    }
  }

  function startExplosion() {
    initCanvas();
    spawnParticles();
    // also add CSS class to reveal blooms (handled via CSS)
    // start particle RAF
    if (!animRef.current || !animRef.current.raf) {
      animRef.current = { last: performance.now() };
      animRef.current.raf = requestAnimationFrame(particleLoop);
    }
  }

  function stopParticleLoop() {
    if (animRef.current && animRef.current.raf) {
      cancelAnimationFrame(animRef.current.raf);
      animRef.current = null;
    }
    particlesRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Intro">
      {/* SVG defs for turbulent displacement and color mapping */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
        <filter id="nebulaFilter" x="-60%" y="-60%" width="220%" height="220%">
          <feTurbulence id="turb" ref={turbRef} type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="5" result="noise" />
          {/* push color mapping toward cool colors */}
          <feColorMatrix in="noise" type="matrix"
            values="0 0 0 0 0.12
                    0 0 0 0 0.26
                    0 0 0 0 0.92
                    0 0 0 1 0" result="coloredNoise" />
          <feGaussianBlur in="coloredNoise" stdDeviation="12" result="blurred" />
          <feComponentTransfer in="blurred" result="soft">
            <feFuncA type="table" tableValues="0 0.88" />
          </feComponentTransfer>
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="22" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* full-screen canvas for particle explosion */}
      <canvas ref={canvasRef} className={styles.explosionCanvas} />

      {/* bloom layers (hidden until .exploding via CSS) */}
      <div className={`${styles.explosionBackdrop} ${stage === "explode" ? styles.exploding : ""}`} aria-hidden>
        <div className={styles.bloomA} />
        <div className={styles.bloomB} />
        <div className={styles.bloomC} />
      </div>

      <div className={styles.center}>
        {/* Nebula orb: multiple abstract layers (clouds, rings, wisps). Disable heavy SVG filter while rendering to avoid tint */}
        <div
          className={`${styles.nebula} ${stage === "idle" ? styles.idle : ""} ${stage === "rendering" ? styles.rendering : ""} ${stage === "explode" ? styles.explode : ""}`}
          onClick={startRender}
          onKeyDown={onKeyDown}
          role="button"
          tabIndex={0}
          aria-pressed={stage !== "idle"}
          aria-label="Start experience"
          style={{ filter: stage === "rendering" ? "none" : "url(#nebulaFilter)" }}
        >
          <div className={styles.layerClouds} />
          <div className={styles.layerWisps} />
          <div className={styles.coreGlow} />
          <div className={styles.chromatic} />
          <svg className={styles.ringSvg} viewBox="0 0 200 200" aria-hidden>
            <defs>
              <radialGradient id="g1" cx="30%" cy="30%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
                <stop offset="30%" stopColor="rgba(180,220,255,0.55)" />
                <stop offset="80%" stopColor="rgba(110,60,200,0.08)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="86" fill="url(#g1)" className={styles.svgRing} />
            {/* fragmented ring strokes */}
            <g className={styles.fragRing}>
              <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.2" strokeDasharray="6 12" />
              <circle cx="100" cy="100" r="102" fill="none" stroke="rgba(120,70,200,0.06)" strokeWidth="1.6" strokeDasharray="3 8" />
            </g>
          </svg>

          {stage === "idle" && <div className={styles.hint}>Click to start</div>}
        </div>

        <div className={styles.bootText}>Welcome — initialize experience </div>

        <div className={`${styles.progressWrap} ${stage === "rendering" ? styles.visible : ""}`} aria-hidden={stage !== "rendering"}>
          <div className={styles.progressLabel}>Rendering experience</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.progressPct}>{progress}%</div>
        </div>

        {stage === "idle" && (
          <button className={styles.startBtn} onClick={startRender} onKeyDown={onKeyDown} aria-label="Start experience">
            Start experience
          </button>
        )}
      </div>
    </div>
  );
}