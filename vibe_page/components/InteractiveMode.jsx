"use client";
// components/InteractiveMode.jsx
// Self-contained interactive visualizer. Reacts to a LOCAL audio track (not
// Spotify playback), which is why it lives outside the Spotify panel.

import { useState } from "react";
import AudioReactiveController from "./AudioReactiveController";

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
    <div>
      <h2 className="font-[var(--font-heading)] italic text-2xl mb-2">
        Visualizer
      </h2>
      <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 12, lineHeight: 1.4 }}>
        A beat-reactive light show driven by a local track — independent of
        Spotify playback.
      </p>

      <button
        onClick={toggleActive}
        title="Beat-reactive spiderweb (visualizes a local track)"
        style={{
          padding: "8px 16px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: active ? "rgba(168,85,247,0.35)" : "rgba(59,130,246,0.22)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          width: "100%",
        }}
      >
        {active ? "🎵 Immersive ON" : "✨ Immersive Mode"}
      </button>

      <AudioReactiveController active={active} />
    </div>
  );
}