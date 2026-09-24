"use client";
// components/FullscreenToggle.jsx
// Hides the browser's own chrome — address bar, tabs, bookmarks — so Aether
// fills the whole screen. That's the one piece of the view the page can't
// hide on its own with CSS: it needs the Fullscreen API, and browsers only
// grant it from a real click, which is why this is a button and not
// something that happens automatically.
//
// Pairs with FocusModeWrapper's "Only Background": that one hides the page's
// own content, this one hides everything around the page.
//
// Vendor-prefixed names are for Safari, which still ships the webkit- forms.
// iOS Safari has no element fullscreen at all, so the button hides itself
// rather than offering something that would do nothing.

import { useEffect, useState } from "react";

const buttonStyle = {
  padding: "10px 16px",
  background: "rgba(20,20,40,0.9)",
  color: "#fff",
  border: "1px solid rgba(138,43,226,0.6)",
  borderRadius: 8,
  cursor: "pointer",
  boxShadow: "0 0 12px rgba(138,43,226,0.5)",
  fontSize: 13,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export default function FullscreenToggle() {
  const [isFull, setIsFull] = useState(false);
  const [supported, setSupported] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setSupported(
      Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
        Boolean(el.requestFullscreen || el.webkitRequestFullscreen)
    );
    // Fullscreen can also be left with Escape or F11, which never routes
    // through the button — this keeps the label honest either way.
    const sync = () => setIsFull(Boolean(fullscreenElement()));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (fullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit?.call(document);
      } else {
        const el = document.documentElement;
        const request = el.requestFullscreen || el.webkitRequestFullscreen;
        // `navigationUI: "hide"` asks for as little browser chrome as the
        // platform will allow; browsers that don't know the option ignore it.
        await request?.call(el, { navigationUI: "hide" });
      }
    } catch (e) {
      // A browser or OS can refuse even when the API exists — a kiosk or
      // enterprise policy, an extension, or a page embedded in an app that
      // doesn't allow it. Without a word, the click would just look broken.
      setBlocked(true);
      setTimeout(() => setBlocked(false), 5000);
    }
  }

  return (
    <>
      {blocked && (
        <span
          role="status"
          style={{
            fontSize: 12,
            color: "#f0abfc",
            background: "rgba(20,20,40,0.9)",
            border: "1px solid rgba(138,43,226,0.4)",
            borderRadius: 8,
            padding: "6px 10px",
            maxWidth: 260,
          }}
        >
          Your browser wouldn&rsquo;t allow fullscreen — F11 usually works.
        </span>
      )}
      <button
        onClick={toggle}
        title={
          isFull
            ? "Leave fullscreen (Esc also works)"
            : "Fill the screen — hides the browser's address bar and tabs"
        }
        style={buttonStyle}
      >
        {isFull ? "⤢ Exit Fullscreen" : "⛶ Fullscreen"}
      </button>
    </>
  );
}
