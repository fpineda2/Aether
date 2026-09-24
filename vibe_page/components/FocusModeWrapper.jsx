"use client";
// components/FocusModeWrapper.jsx
// Same pattern as CursorWrapper's own hide/show toggle, applied to the whole
// page instead of just the cursor-controls panel: lets a visitor drop every
// bit of page chrome (header, About, Spotify, the visualizer sidebar) so
// nothing but the cosmic background/starfield/spiderweb visuals are left —
// no scrolling required, no text competing for attention, just the vibe.
//
// Purely visual: hides content with CSS rather than un-rendering it. The
// visualizer controls (and the audio graph/analysis they drive) live inside
// this same subtree, so conditionally not rendering `children` at all would
// unmount AudioReactiveController along with everything else — tearing down
// the AudioContext and killing the very background animations this feature
// is supposed to leave running. display:none keeps it all mounted and
// working underneath while removing it from view and layout.
//
// The fullscreen toggle sits in the same corner cluster: between them, a
// visitor can drop the page's own content AND the browser's chrome around
// it. They share one flex row so neither ever lands on top of the other as
// their labels change width.

import { useState } from "react";
import FullscreenToggle from "./FullscreenToggle";

export default function FocusModeWrapper({ children }) {
  const [hidden, setHidden] = useState(false);

  return (
    <>
      <div style={hidden ? { display: "none" } : undefined}>{children}</div>

      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 2147483647,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <FullscreenToggle />
        <button
          onClick={() => setHidden((h) => !h)}
          title={
            hidden
              ? "Bring the page content back"
              : "Hide the page content — just the visuals, nothing else"
          }
          style={{
            padding: "10px 16px",
            background: "rgba(20,20,40,0.9)",
            color: "#fff",
            border: "1px solid rgba(138,43,226,0.6)",
            borderRadius: 8,
            cursor: "pointer",
            boxShadow: `0 0 12px rgba(138,43,226,${hidden ? 0.7 : 0.5})`,
            fontSize: 13,
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {hidden ? "Show Page" : "Only Background"}
        </button>
      </div>
    </>
  );
}
