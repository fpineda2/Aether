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

  function toggleActive() {
    setActive((a) => {
      const next = !a;
      if (next) pauseSpotify();
      return next;
    });
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.title}>Visualizer</h2>
      <p className={styles.subtitle}>
        Music becomes light: the visuals react to the beat, and a second set
        follows the singer&rsquo;s voice. Works with the tracks below, your own
        file, or whatever&rsquo;s already playing in another tab.
      </p>

      <button
        onClick={toggleActive}
        aria-pressed={active}
        title="Turn the audio-reactive visuals on or off"
        className={`${styles.primary} ${active ? styles.primaryOn : ""}`}
      >
        {active ? "Immersive Mode is on" : "Turn on Immersive Mode"}
      </button>

      <AudioReactiveController active={active} />
    </div>
  );
}
