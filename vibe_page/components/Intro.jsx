"use client";
// components/Intro.jsx
// Aether boot intro: a portal of sacred geometry blooms open into the mark.
//
// Sequence (all timing driven by CSS keyframes, see Intro.module.css):
//   idle      - black screen, one small pulsing cyan point ("Enter Aether")
//   blooming  - on click: point expands, radiating lines draw themselves,
//               rings unfold, and a violet/cyan atmosphere (glow + slowly
//               counter-rotating vortex rings) builds behind it — this is
//               the portal opening. A brief flash bridges the handoff, and
//               the wireframe DISSOLVES WHILE the real logo artwork
//               materializes through the same window (not after it), so the
//               geometry reads as becoming the mark rather than being
//               replaced by it. A "threshold ring" survives the crossfade
//               and frames the completed mark like a gate. Finishes ~4s in.
//   open      - a brief held beat on the completed mark + wordmark, then the
//               portal ring/glow dilate outward as the whole overlay quietly
//               fades away to reveal the app.
//
// Notes:
// - Browsers block autoplay, so the AudioContext + playback are created on
//   the user's click (startBloom), same as before.
// - Audio file at /public/audio/intro.mp3

import React, { useEffect, useRef, useState } from "react";
import styles from "./Intro.module.css";

const AUDIO_PATH = "/audio/intro.mp3";
const LOGO_PATH = "/aether-logo.png";

const BLOOM_DURATION = 3800; // matches "after about four seconds"
const HOLD_DURATION = 700; // brief pause once the logo completes
const OPEN_DURATION = 950; // "it quietly opens"

// 10 rays radiating from center, evenly spaced (decagonal, echoing the mark's
// own true symmetry — confirmed against the cropped artwork), used as a
// wireframe that draws itself and then dissolves into the real artwork.
const RAY_COUNT = 10;
const CX = 150;
const CY = 150;
const RAY_R = 136;
const RAYS = Array.from({ length: RAY_COUNT }, (_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RAY_COUNT;
  const rayDelay = 150 + i * 40; // ms — each ray fires slightly after the last
  const rayDuration = 900;
  return {
    x2: CX + RAY_R * Math.cos(angle),
    y2: CY + RAY_R * Math.sin(angle),
    rayDelay,
    // the node "catches" its ray just before the line finishes drawing
    nodeDelay: rayDelay + rayDuration - 120,
  };
});

export default function Intro({ onFinish }) {
  const [stage, setStage] = useState("idle"); // idle | blooming | open
  const timersRef = useRef([]);

  // audio refs
  const audioElRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainRef = useRef(null);
  const mediaSrcRef = useRef(null);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (audioElRef.current) {
        try { audioElRef.current.pause(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  function startBloom() {
    if (stage !== "idle") return;
    setStage("blooming");
    initAndPlayAudio();

    const t1 = setTimeout(() => {
      setStage("open");
      fadeOutAudio(0.8);
      const t2 = setTimeout(() => {
        onFinish && onFinish();
      }, OPEN_DURATION);
      timersRef.current.push(t2);
    }, BLOOM_DURATION + HOLD_DURATION);
    timersRef.current.push(t1);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startBloom();
    }
  }

  // ---------- Audio helpers ----------
  function initAndPlayAudio() {
    if (!audioElRef.current) {
      const a = new Audio(AUDIO_PATH);
      a.preload = "auto";
      a.loop = false;
      a.crossOrigin = "anonymous";
      audioElRef.current = a;
    }

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
        audioCtxRef.current = null;
        gainRef.current = null;
        mediaSrcRef.current = null;
      }
    }

    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }

    try {
      audioElRef.current.currentTime = 0;
      const p = audioElRef.current.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function fadeOutAudio(durationSeconds = 0.8) {
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    if (ctx && gain) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value || 1, now);
      gain.gain.linearRampToValueAtTime(0.001, now + durationSeconds);
      setTimeout(() => {
        try { audioElRef.current && audioElRef.current.pause(); } catch (e) {}
      }, durationSeconds * 1000 + 120);
    } else if (audioElRef.current) {
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

  // Once blooming starts we keep the "bloomed" class forever (even during
  // "open") so CSS animation-fill-mode:forwards holds the completed artwork
  // in place while the overlay itself fades away — switching classes away
  // from .blooming would instantly snap everything back to its hidden state.
  const phase = stage === "idle" ? styles.idle : styles.blooming;

  return (
    <div
      className={`${styles.overlay} ${stage === "open" ? styles.opening : ""}`}
      role="dialog"
      aria-label="Intro"
    >
      <div className={`${styles.center} ${phase}`}>
        <div
          className={`${styles.mark} ${phase}`}
          onClick={stage === "idle" ? startBloom : undefined}
          onKeyDown={onKeyDown}
          role="button"
          tabIndex={0}
          aria-pressed={stage !== "idle"}
          aria-label="Enter Aether"
        >
          {/* atmosphere: soft ambient glow + slowly counter-rotating vortex
              rings, bleeding out beyond the mark itself for scale/depth */}
          <div className={styles.atmosphere} aria-hidden>
            <div className={styles.portalGlow} />
            <div className={`${styles.vortexRing} ${styles.vortexRingA}`} />
            <div className={`${styles.vortexRing} ${styles.vortexRingB}`} />
          </div>

          <svg className={styles.wireframe} viewBox="0 0 300 300" aria-hidden>
            {/* threshold ring: survives the crossfade, frames the finished mark */}
            <g className={styles.portalRingSpin}>
              <circle className={styles.portalRing} cx={CX} cy={CY} r="146" />
            </g>

            <g className={styles.wireframeFade}>
              <circle className={styles.core} cx={CX} cy={CY} r="6" />
              {RAYS.map((r, i) => (
                <line
                  key={`ray-${i}`}
                  x1={CX}
                  y1={CY}
                  x2={r.x2}
                  y2={r.y2}
                  pathLength="1"
                  className={styles.ray}
                  style={{ animationDelay: `${r.rayDelay}ms` }}
                />
              ))}
              {RAYS.map((r, i) => (
                <circle
                  key={`node-${i}`}
                  cx={r.x2}
                  cy={r.y2}
                  r="3.4"
                  className={styles.node}
                  style={{ animationDelay: `${r.nodeDelay}ms` }}
                />
              ))}
              <circle className={`${styles.ring} ${styles.ring1}`} cx={CX} cy={CY} r="42" />
              <circle className={`${styles.ring} ${styles.ring2}`} cx={CX} cy={CY} r="80" />
              <circle className={`${styles.ring} ${styles.ring3}`} cx={CX} cy={CY} r="120" />
            </g>
          </svg>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_PATH} alt="Aether" className={styles.logoImg} draggable={false} />

          {/* crystallization flash: bridges the wireframe -> artwork handoff
              so the geometry reads as becoming the logo, not being swapped
              out for it */}
          <div className={styles.flash} aria-hidden />

          {stage === "idle" && <div className={styles.idleHint}>Enter Aether</div>}
        </div>

        <div className={styles.wordmark}>AETHER</div>
      </div>
    </div>
  );
}
