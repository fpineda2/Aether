"use client";
// components/AudioReactiveController.jsx
// Renders a hidden <audio> element (defaulting to the bundled Portal track) plus
// small visualizer controls. When `active` is true and the user presses play,
// it analyzes that audio in real time and drives the starfield's beat pulses.
//
// Note: this reacts to a LOCAL track you control — not the Spotify stream, which
// can't be analyzed in-browser because it's DRM-protected.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createAudioReactiveController,
  createStreamReactiveController,
} from "../lib/audioReactive";

// Bundled demo tracks, so visitors without their own audio file can still try
// the visualizer. Hardcoded rather than fetched from an API route: this list
// changes rarely (a new file added by hand once in a while), and fetching it
// at runtime meant the picker's button showed a generic fallback label until
// the request resolved — a visible flash/lag on every page load for content
// that's static at build time anyway.
const DEMO_TRACKS = [
  { file: "Salesforce Tower - Adrian Campos Ortega.m4a", label: "Salesforce Tower - Adrian Campos Ortega" },
  { file: "Tekken 9 - Adrian Campos Ortega.m4a", label: "Tekken 9 - Adrian Campos Ortega" },
  { file: "portal.mp3", label: "Portal" },
];

export default function AudioReactiveController({
  active,
  defaultSrc = "/audio/portal.mp3",
}) {
  const audioRef = useRef(null);
  const ctrlRef = useRef(null);
  // Holds { controller, stream } while a tab/system audio capture is live —
  // unlike ctrlRef (built once for the stable <audio> element), this is
  // created and torn down fresh on every capture start/stop.
  const captureCtrlRef = useRef(null);
  const pickerRef = useRef(null);
  const autoPlayRef = useRef(false);
  const [src, setSrc] = useState(defaultSrc);
  const [playing, setPlaying] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [err, setErr] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hoveredFile, setHoveredFile] = useState(null);

  // Picking a track sets `autoPlayRef` and lets this effect do the actual
  // play() call, once React has committed the new `src` to the <audio>
  // element — calling play() any earlier races the DOM update from setSrc
  // below and aborts with "interrupted by a new load request".
  useLayoutEffect(() => {
    if (!autoPlayRef.current) return;
    autoPlayRef.current = false;
    const el = audioRef.current;
    if (!el) return;
    (async () => {
      try {
        await el.play();
        await ctrlRef.current?.start();
        setPlaying(true);
      } catch (e) {
        setPlaying(false);
        setErr(e?.message || "Couldn't start audio");
      }
    })();
  }, [src]);

  // Native <select> popups can't be styled consistently across browsers
  // (Firefox/Safari mostly ignore option background/hover colors), so the
  // track picker is a real dropdown built from styled elements instead —
  // closes on an outside click like any other custom menu.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  // Build the controller once, bound to the stable <audio> element.
  useEffect(() => {
    if (!audioRef.current) return;
    ctrlRef.current = createAudioReactiveController(audioRef.current, {
      onError: (e) => setErr(e?.message || "Audio analysis failed"),
    });
    return () => {
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
      // Also release any active tab capture on unmount — otherwise
      // navigating away would leave the browser's "sharing this tab"
      // indicator on indefinitely.
      const cap = captureCtrlRef.current;
      if (cap) {
        cap.controller.dispose();
        cap.stream.getTracks().forEach((t) => t.stop());
        captureCtrlRef.current = null;
      }
    };
  }, []);

  // Turning interactive mode off stops the pulses and whatever's feeding them.
  useEffect(() => {
    if (!active) {
      ctrlRef.current?.stop();
      audioRef.current?.pause();
      setPlaying(false);
      stopCapture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Releases a live tab/system audio capture — called from the "Stop
  // Capturing" button, when the shared tab/window is closed or "Stop
  // sharing" is clicked in the browser's own UI (via the audio track's
  // `ended` event), when interactive mode is turned off, and on unmount.
  function stopCapture() {
    const cap = captureCtrlRef.current;
    if (!cap) return;
    cap.controller.dispose();
    cap.stream.getTracks().forEach((t) => t.stop());
    captureCtrlRef.current = null;
    setCapturing(false);
  }

  // Captures another tab (or, depending on the browser/OS, the whole
  // system)'s audio output via getDisplayMedia and feeds it to the same
  // beat-detection pipeline as a local track. This is how a visitor's own
  // Spotify/Apple Music/whatever ends up driving the visuals: not by
  // reading the stream directly (impossible — it's DRM-protected), but by
  // listening to what's already playing out loud, the same way a
  // microphone would.
  async function startCapture() {
    setErr("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      // getDisplayMedia (like most media-capture APIs) is only exposed on
      // secure origins — https:// or http://localhost. A plain http:// LAN
      // address (e.g. testing over Wi-Fi at a 192.168.x.x URL) leaves
      // mediaDevices entirely undefined even in a browser that fully
      // supports the feature, which reads identically to "not supported"
      // unless called out specifically.
      setErr(
        typeof window !== "undefined" && !window.isSecureContext
          ? "Tab audio capture needs a secure connection — this won't work over a plain http:// address, only https:// or http://localhost."
          : "Tab audio capture isn't supported in this browser."
      );
      return;
    }
    // Only one source should ever drive the visualizer at a time.
    audioRef.current?.pause();
    ctrlRef.current?.stop();
    setPlaying(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        // A bare `video: true` lets the picker default to "Entire Screen",
        // where Chrome's "share tab audio" checkbox either isn't offered or
        // behaves inconsistently. `displaySurface: "browser"` biases the
        // picker toward the "Chrome Tab" view, where tab-audio sharing is
        // most reliably available and the checkbox actually shows up.
        video: { displaySurface: "browser" },
        // A bare `audio: true` requests audio "if convenient" in some
        // Chrome versions; the explicit constraint object below asks for it
        // more assertively and, together with suppressLocalAudioPlayback,
        // makes sure sharing doesn't mute the source tab's own playback
        // (we're only tapping a copy of the signal, not routing it back to
        // speakers ourselves — the original tab needs to keep playing).
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false,
        },
        // Chrome-only hints: if the visitor picks "Entire Screen" anyway,
        // try to include system audio rather than defaulting to muted, and
        // don't offer this very tab as a share target (sharing ourselves
        // would be pointless and confusing).
        systemAudio: "include",
        selfBrowserSurface: "exclude",
      });
    } catch (e) {
      // NotAllowedError just means the visitor closed the picker — not a
      // real error worth surfacing.
      if (e?.name !== "NotAllowedError") {
        setErr(e?.message || "Couldn't start tab capture");
      }
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      // Firefox's tab-audio sharing is genuinely much less reliable than
      // Chrome/Edge's — this isn't necessarily something the visitor did
      // wrong, so say so instead of just repeating instructions that may
      // not be the actual problem.
      const isFirefox =
        typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
      setErr(
        isFirefox
          ? "Firefox's tab audio sharing is unreliable for this — Chrome or Edge work much better here."
          : 'That didn\'t include audio — share a browser tab (not the whole screen) and check "Share tab audio".'
      );
      return;
    }
    // Only the audio is needed — release the video track immediately
    // instead of holding a screen-recording feed open for nothing.
    stream.getVideoTracks().forEach((t) => t.stop());
    audioTracks[0].addEventListener("ended", stopCapture);

    const controller = createStreamReactiveController(stream, {
      onError: (e) => setErr(e?.message || "Audio analysis failed"),
    });
    captureCtrlRef.current = { controller, stream };
    await controller.start();
    setCapturing(true);
  }

  // Some browsers (Safari in particular) report an empty or unreliable
  // File.type for certain containers — .m4a is the common case, since it's
  // ambiguous between audio/mp4 and video/mp4. A blob: URL inherits that
  // type, and <audio> can silently refuse to play a source it can't
  // recognize. Re-derive the MIME type from the extension instead of
  // trusting whatever the OS/browser guessed.
  const EXT_MIME = {
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    webm: "audio/webm",
  };

  // Shared by both "pick a bundled track" and "use my own track": choosing
  // a track and playing it are the same action, not two — there's no point
  // in picking a song you're not going to hear, so this plays immediately
  // instead of just loading the source and waiting for a separate click.
  // The actual play() happens in the useLayoutEffect above, once the new
  // src has actually landed on the <audio> element.
  function playSrc(newSrc) {
    ctrlRef.current?.stop();
    stopCapture();
    setErr("");
    autoPlayRef.current = true;
    setSrc(newSrc);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    const knownType = ext && EXT_MIME[ext];
    const file = knownType ? new File([f], f.name, { type: knownType }) : f;
    playSrc(URL.createObjectURL(file));
  }

  function onSelectTrack(file) {
    if (!file) return;
    setPickerOpen(false);
    playSrc(`/audio/${encodeURIComponent(file)}`);
  }

  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    setErr("");
    if (playing) {
      el.pause();
      ctrlRef.current?.stop();
      setPlaying(false);
      return;
    }
    stopCapture();
    try {
      await el.play(); // user gesture — unlocks audio + AudioContext
      await ctrlRef.current?.start();
      setPlaying(true);
    } catch (e) {
      setErr(e?.message || "Couldn't start audio");
    }
  }

  const currentBundledFile = src.startsWith("/audio/")
    ? decodeURIComponent(src.slice("/audio/".length))
    : "";
  const currentTrack = DEMO_TRACKS.find((t) => t.file === currentBundledFile);
  const playBg = playing ? "rgba(168,85,247,0.35)" : "rgba(59,130,246,0.25)";

  return (
    <>
      {/* Stable element so the Web Audio source node stays valid across toggles */}
      <audio ref={audioRef} src={src} loop hidden />
      {active && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
          {/* One control, not two: picking a track and playing it are the
              same action, so this is a single pill — play/pause on the
              left, track picker on the right — instead of two separate
              buttons sitting side by side. */}
          <div
            ref={pickerRef}
            style={{
              position: "relative",
            }}
          >
            {/* This inner wrapper owns the rounded-pill clip. The dropdown
                below must NOT be a descendant of an overflow:hidden box — it
                positions itself via `top: calc(100% + 6px)`, i.e. entirely
                outside this wrapper's own (button-height-only) box, so an
                overflow:hidden here would silently clip the whole open
                dropdown to nothing. Functionally "open" (in React state,
                in the DOM) but invisible and un-clickable — which is exactly
                what looked like "the arrow does nothing" from the outside. */}
            <div
              style={{
                display: "flex",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: playBg,
                overflow: "hidden",
              }}
            >
              <button
                onClick={togglePlay}
                style={{
                  padding: "6px 14px",
                  border: "none",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                  // A long track label (e.g. "Salesforce Tower - Adrian Campos
                  // Ortega") must not be allowed to grow or wrap this button —
                  // without minWidth:0 a flex child won't shrink below its
                  // content's natural width, so a long label could push the
                  // whole pill wider than its container, carrying the caret
                  // button off past the visible edge. Truncate instead.
                  minWidth: 0,
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {playing ? "⏸" : "▶"} {currentTrack ? currentTrack.label : "Play visualizer track"}
              </button>

              <button
                onClick={() => setPickerOpen((o) => !o)}
                title="Choose a track"
                style={{
                  padding: "6px 10px",
                  border: "none",
                  borderLeft: "1px solid rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                ▾
              </button>
            </div>

            {pickerOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 20,
                  minWidth: 240,
                  maxHeight: 220,
                  overflowY: "auto",
                  background: "#132039",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  padding: 4,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                }}
              >
                {DEMO_TRACKS.map((t) => {
                  const isHovered = hoveredFile === t.file;
                  const isSelected = t.file === currentBundledFile;
                  return (
                    <div
                      key={t.file}
                      data-track-option={t.file}
                      onClick={() => onSelectTrack(t.file)}
                      onMouseEnter={() => setHoveredFile(t.file)}
                      onMouseLeave={() => setHoveredFile(null)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 7,
                        fontSize: 13,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        background: isHovered ? "rgba(103,232,249,0.18)" : "transparent",
                        color: isHovered ? "#67e8f9" : "#fff",
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {t.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <label style={{ fontSize: 12, opacity: 0.85, cursor: "pointer" }}>
            🎧 Use my own track
            <input
              type="file"
              accept="audio/*"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>

          <a
            href="/challenge"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              opacity: 0.85,
              color: "#67e8f9",
              textDecoration: "none",
            }}
          >
            🎼 Complete the Challenge
          </a>
          </div>

          {/* Lets a visitor's own music — Spotify, Apple Music, anything —
              drive the visualizer without uploading a file. Can't read
              those streams directly (DRM), so instead this captures
              whatever's already playing out loud from a shared tab/screen,
              the same way a microphone would. A divider + real breathing
              room (not just a small margin) separates this from the
              local-track controls above so the two read as distinct
              options, not one crowded row — picking a local/bundled track
              or starting a capture are mutually exclusive, each stops the
              other. */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.12)",
              marginTop: 22,
              paddingTop: 18,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              Or use what&rsquo;s already playing
            </span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              {capturing
                ? "🔴 Listening to the shared tab's audio — play anything there and the visuals will follow."
                : "Shares a browser tab's audio, not your camera or mic — pick the tab with your music and check \"share tab audio.\""}
            </span>
            <button
              onClick={capturing ? stopCapture : startCapture}
              title="Opens your browser's own tab-sharing picker — not a camera or microphone request. Pick the tab with your music and check its audio option."
              style={{
                padding: "6px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: capturing ? "rgba(248,113,113,0.28)" : "rgba(103,232,249,0.16)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              {capturing ? "⏹ Stop Capturing" : "🖥️ Capture Tab Audio"}
            </button>
          </div>

          {err && (
            <div style={{ marginTop: 10 }}>
              <span style={{ color: "#f87171", fontSize: 12 }}>{err}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}