"use client";
// components/BootWrapper.jsx
import { useEffect, useState } from "react";
import Intro from "./Intro";
import styles from "./BootWrapper.module.css";

/**
 * Wrap your app content with <BootWrapper>{children}</BootWrapper>.
 * Shows Intro if localStorage 'vibe_seen_intro' is not set and skipIntro URL param is not present.
 */
export default function BootWrapper({ children }) {
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
        return;
      }
    } catch (e) {
      // ignore
    }

    const seen = localStorage.getItem("vibe_seen_intro");
    if (seen === "1") {
      setState("skip");
    } else {
      setState("showIntro");
    }
  }, []);

  if (state === "loading") return null;
  if (state === "skip") return children;

  return (
    <Intro
      onFinish={() => {
        localStorage.setItem("vibe_seen_intro", "1");
        setState("skip");
      }}
    />
  );
}