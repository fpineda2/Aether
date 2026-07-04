"use client";
// components/InteractiveMode.jsx
// Self-contained interactive visualizer. Lives independently of the Spotify
// panel because it reacts to a LOCAL audio track, not Spotify playback.
// Drop <InteractiveMode /> anywhere (e.g. the sidebar) and it manages its own state.

import { useState } from "react";
import AudioReactiveController from "./AudioReactiveController";
// import CircularSpectrum from "./CircularSpectrum"; // uncomment once CircularSpectrum.jsx is added

export default function InteractiveMode() {
  const [active, setActive] = useState(false);

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
        onClick={() => setActive((a) => !a)}
        title="Beat-reactive starfield (visualizes a local track)"
        style={{
          padding: "8px 16px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: active
            ? "rgba(168,85,247,0.35)"
            : "rgba(59,130,246,0.22)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          width: "100%",
        }}
      >
        {active ? "🎵 Interactive ON" : "✨ Interactive Mode"}
      </button>

      {/* Controls (play / choose track) appear here when active */}
      <AudioReactiveController active={active} />

      {/* When you add the spectrum, drop it here:
      <CircularSpectrum /> */}
    </div>
  );
}
