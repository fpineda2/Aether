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
// their labels change width, and one captioned box so the corner says what
// it is for — unlabeled, it was a corner nobody thought to look at, and
// visitors who wanted exactly this never found it.
//
// The "aether-focus-hint" event is how the rest of the page points here:
// the visualizer panel's hint fires it, and the cluster flashes so the
// visitor knows which corner was meant. See styles in the module CSS.
//
// On a phone the captioned box is wider than the gap beside the centered
// "Aether" wordmark, so it sat squarely on top of it. Below the md
// breakpoint the cluster collapses to a single handle in the corner and
// `open` expands it; the handle is hidden on wider screens, where the box
// has room to say what it is. `open` is therefore a no-op on desktop, and
// the CSS — not a width measured in JS — decides which applies, so there's
// nothing to get wrong between the server render and the first paint.

import { useEffect, useRef, useState } from "react";
import FullscreenToggle from "./FullscreenToggle";
import styles from "./FocusModeWrapper.module.css";

export default function FocusModeWrapper({ children }) {
  const [hidden, setHidden] = useState(false);
  // Counts hints rather than holding a boolean: the ring below is keyed on
  // it, so a second hint mounts a fresh element and the animation replays.
  // Re-adding a class to the same element would not restart it, and the
  // usual remove-then-re-add-next-frame trick needs requestAnimationFrame,
  // which never fires while the tab is in the background.
  const [nudge, setNudge] = useState(0);
  const [open, setOpen] = useState(false);
  const nudgeTimer = useRef(null);

  useEffect(() => {
    function onHint() {
      clearTimeout(nudgeTimer.current);
      setNudge((n) => n + 1);
      // Flashing a collapsed handle would point at the right corner and
      // still leave the visitor to guess what's behind it.
      setOpen(true);
      // Unmounts the ring once it has had its say — and is what ends the
      // steady highlight shown instead of the flash under reduced motion.
      nudgeTimer.current = setTimeout(() => setNudge(0), 2800);
    }
    window.addEventListener("aether-focus-hint", onHint);
    return () => {
      window.removeEventListener("aether-focus-hint", onHint);
      clearTimeout(nudgeTimer.current);
    };
  }, []);

  return (
    <>
      <div style={hidden ? { display: "none" } : undefined}>{children}</div>

      <div className={`${styles.cluster} ${open ? styles.clusterOpen : ""}`}>
        {nudge > 0 && <span key={nudge} className={styles.ring} aria-hidden="true" />}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Close view options" : "Uninterrupted view options"}
          className={styles.handle}
        >
          {open ? "✕" : "⛶"}
        </button>
        <span className={styles.label}>Uninterrupted view</span>
        <div className={styles.row}>
          <FullscreenToggle />
          <button
            onClick={() => setHidden((h) => !h)}
            title={
              hidden
                ? "Bring the page content back"
                : "Hide the page content — just the visuals, nothing else"
            }
            className={`${styles.btn} ${hidden ? styles.btnOn : ""}`}
          >
            {hidden ? "Show Page" : "Only Background"}
          </button>
        </div>
      </div>
    </>
  );
}
