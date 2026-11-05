"use client";
// components/InteractiveMode.jsx
// Self-contained interactive visualizer. Reacts to a LOCAL audio track (not
// Spotify playback), which is why it lives outside the Spotify panel.
//
// The panel's look lives in styles/Visualizer.module.css — see the note at
// the top of that file for why the controls use their own sans face instead
// of the page's serifs.

import { useState } from "react";
import dynamic from "next/dynamic";
import styles from "../styles/Visualizer.module.css";

// The Web Audio analysis engine (lib/audioReactive.js + this controller) is
// only needed once someone actually opens Immersive Mode — don't ship it in
// the initial sidebar bundle.
const AudioReactiveController = dynamic(() => import("./AudioReactiveController"), { ssr: false });

export default function InteractiveMode() {
  const [active, setActive] = useState(false);

  async function pauseSpotify() {
    try {
      const res = await fetch("/api/spotify/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      if (res.ok || res.status === 204) {
        window.dispatchEvent(new CustomEvent("spotify-device-changed"));
      }
    } catch (err) {
      // No Spotify session / nothing playing — nothing to do.
    }
  }

  // FocusModeWrapper listens for this and flashes its corner cluster, so
  // "top-right corner" doesn't send anyone hunting.
  function pointAtFocusControls() {
    window.dispatchEvent(new Event("aether-focus-hint"));
  }

  function toggleActive() {
    // Side effects stay out of the state updater: React may run that
    // function twice, which would fire the hint twice on one click.
    const next = !active;
    setActive(next);
    if (next) {
      pauseSpotify();
      // The moment someone opens the light show is the moment they'd want
      // the page itself out of the way — so this is when to say where those
      // controls are.
      pointAtFocusControls();
    }
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Visualizer</h2>
      {/* Short on purpose: the blocks below explain themselves, and every
          extra line here pushes the last of them off a laptop screen. */}
      <p className={styles.subtitle}>
        Music becomes light: the visuals react to the beat, and a second set
        follows the singer&rsquo;s voice.
      </p>

      <button
        onClick={toggleActive}
        aria-pressed={active}
        title="Turn the audio-reactive visuals on or off"
        className={`${styles.primary} ${active ? styles.primaryOn : ""}`}
      >
        {active ? "Immersive Mode is on" : "Turn on Immersive Mode"}
      </button>

      {/* The two controls that clear everything away — Fullscreen and "Only
          Background" — live in the page's top-right corner, which is the
          last place someone chasing the light show thinks to look. This
          says where they are and flashes that corner on click, rather than
          duplicating the controls down here where they'd have to be kept in
          step with the originals. */}
      <button type="button" onClick={pointAtFocusControls} className={styles.cornerHint}>
        <span>
          Want nothing but the visuals? <strong>Fullscreen</strong> and{" "}
          <strong>Only Background</strong> are in the top-right corner.
        </span>
        <span className={styles.cornerHintArrow} aria-hidden="true">
          ↗
        </span>
      </button>

      <AudioReactiveController active={active} />
    </div>
  );
}
