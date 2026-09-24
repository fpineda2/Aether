"use client";
// components/BootWrapper.jsx
import { useEffect, useState } from "react";
import Intro from "./Intro";
import styles from "./BootWrapper.module.css";

/**
 * Wrap your app content with <BootWrapper>{children}</BootWrapper>.
 * Shows Intro if localStorage 'vibe_seen_intro' is not set and skipIntro URL param is not present.
 *
 * `onEntered` fires exactly once, the moment boot resolves to showing the
 * real app (immediately if the intro was already seen, or once Intro
 * finishes) — the root layout uses this to defer mounting the cursor
 * effects and background canvases until there's actually something for
 * them to sit behind, instead of running them under the intro overlay
 * where they're fully hidden and invisible anyway.
 */
export default function BootWrapper({ children, onEntered }) {
  const [state, setState] = useState("loading"); // "loading" | "showIntro" | "skip"

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("skipIntro") === "1") {
        localStorage.setItem("vibe_seen_intro", "1");
        // remove param from URL without reload
        const url = new URL(window.location.href);
        url.searchParams.delete("skipIntro");
        window.history.replaceState({}, "", url.pathname + url.search);
        setState("skip");
        onEntered?.();
        return;
      }
    } catch (e) {
      // ignore
    }

    const seen = localStorage.getItem("vibe_seen_intro");
    if (seen === "1") {
      setState("skip");
      onEntered?.();
    } else {
      setState("showIntro");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") return null;
  if (state === "skip") return children;

  return (
    <Intro
      onFinish={() => {
        localStorage.setItem("vibe_seen_intro", "1");
        setState("skip");
        onEntered?.();
      }}
    />
  );
}