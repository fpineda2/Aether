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
import { VOICE_STYLES, VOICE_STYLE_KEY } from "./VoiceVisualizer";
import styles from "../styles/Visualizer.module.css";

const VOICE_STYLE_LABELS = {
  strands: "Strands",
  particles: "Particles",
  harmonics: "Harmonics",
  ripples: "Ripples",
  off: "Off",
};

// Bundled demo tracks, so visitors without their own audio file can still try
// the visualizer. Hardcoded rather than fetched from an API route: this list
// changes rarely (a new file added by hand once in a while), and fetching it
// at runtime meant the picker's button showed a generic fallback label until
// the request resolved — a visible flash/lag on every page load for content
// that's static at build time anyway.
//
// `vocals` (optional): an isolated vocal stem for the track, in
// public/audio/stems/. When present, the voice visuals read that instead of
// estimating the voice from the full mix — exact instead of a best guess.
// A stem can come straight from the artist, or be split from the finished
// song once with a separation tool such as Demucs. It must line up with the
// song from the very first sample (same start, same length).
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
  const stemRef = useRef(null);
  const ctrlRef = useRef(null);
  // Holds { controller, stream } while a tab/system audio capture is live —
  // unlike ctrlRef (built once for the stable <audio> element), this is
  // created and torn down fresh on every capture start/stop.
  const captureCtrlRef = useRef(null);
  const pickerRef = useRef(null);
  const autoPlayRef = useRef(false);
  const [src, setSrc] = useState(defaultSrc);
  const [stemSrc, setStemSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [err, setErr] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [voiceStyle, setVoiceStyle] = useState("strands");

  // Read the remembered voice style after mount (localStorage isn't
  // available during SSR, and reading it in useState's initializer would
  // mismatch the server-rendered markup).
  useEffect(() => {
    try {
      const s = localStorage.getItem(VOICE_STYLE_KEY);
      if (VOICE_STYLES.includes(s)) setVoiceStyle(s);
    } catch (e) {}
  }, []);

  function pickVoiceStyle(s) {
    setVoiceStyle(s);
    try {
      localStorage.setItem(VOICE_STYLE_KEY, s);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("voice-style", { detail: s }));
  }

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
      stemEl: stemRef.current,
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

  // Point voice analysis at the stem whenever the current track has one.
  useEffect(() => {
    ctrlRef.current?.setVoiceStem(!!stemSrc);
  }, [stemSrc]);

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
  function playSrc(newSrc, newStemSrc = "") {
    ctrlRef.current?.stop();
    stopCapture();
    setErr("");
    autoPlayRef.current = true;
    setSrc(newSrc);
    setStemSrc(newStemSrc);
  }

  // Pairs an isolated vocal stem with whatever track is currently loaded.
  // Replaced the moment a different track is picked (playSrc clears it).
  function onStemFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    const knownType = ext && EXT_MIME[ext];
    const file = knownType ? new File([f], f.name, { type: knownType }) : f;
    setStemSrc(URL.createObjectURL(file));
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
    const track = DEMO_TRACKS.find((t) => t.file === file);
    playSrc(
      `/audio/${encodeURIComponent(file)}`,
      track?.vocals ? `/audio/stems/${encodeURIComponent(track.vocals)}` : ""
    );
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

  return (
    <>
      {/* Stable element so the Web Audio source node stays valid across toggles */}
      <audio ref={audioRef} src={src} loop hidden />
      {/* Vocal stem: analyzed only, never heard — kept in sync by the controller */}
      <audio ref={stemRef} src={stemSrc || undefined} loop hidden preload="auto" />
      {active && (
        <div>
          {/* Each way of feeding the visualizer gets its own labeled block.
              They were a single crowded row of 12px text before, which made
              the file picker, the tab capture and the voice styles read as
              footnotes — people never found them. */}
          {/* All three ways of feeding the visualizer in one row. They were
              separate blocks with a paragraph each, which pushed the vocal
              stem option and the Challenge below the fold on a laptop —
              where nobody found them, the same disappearing act the old
              fine print pulled. Picking a track and capturing a tab are
              mutually exclusive; each stops the other. */}
          <div className={styles.group}>
            <div className={styles.groupLabel}>Feed it audio</div>
            <p className={styles.groupHint}>
              Play one of Aether&rsquo;s own tracks, use a file of your own, or
              capture whatever&rsquo;s already playing in another tab.
            </p>
            <div className={styles.row}>
              {/* One control, not two: picking a track and playing it are the
                  same action, so this is a single pill — play/pause on the
                  left, track picker on the right. */}
              <div ref={pickerRef} className={styles.pickerWrap}>
                <div className={`${styles.pill} ${playing ? styles.pillOn : ""}`}>
                  <button onClick={togglePlay} className={styles.pillPlay}>
                    {playing ? "⏸" : "▶"} {currentTrack ? currentTrack.label : "Play a track"}
                  </button>
                  <button
                    onClick={() => setPickerOpen((o) => !o)}
                    title="Choose a track"
                    aria-expanded={pickerOpen}
                    className={styles.pillCaret}
                  >
                    ▾
                  </button>
                </div>

                {pickerOpen && (
                  <div className={styles.menu}>
                    {DEMO_TRACKS.map((t) => (
                      <div
                        key={t.file}
                        data-track-option={t.file}
                        onClick={() => onSelectTrack(t.file)}
                        className={`${styles.menuItem} ${
                          t.file === currentBundledFile ? styles.menuItemOn : ""
                        }`}
                      >
                        {t.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className={styles.secondary}>
                Use my own
                <input type="file" accept="audio/*" onChange={onFile} style={{ display: "none" }} />
              </label>

              {/* Can't read a DRM stream directly, so this captures whatever's
                  already playing out loud from a shared tab, the same way a
                  microphone would. */}
              <button
                onClick={capturing ? stopCapture : startCapture}
                title="Shares a browser tab's audio — not your camera or microphone. Pick the tab with your music and check its audio option."
                className={`${styles.secondary} ${capturing ? styles.secondaryOn : ""}`}
              >
                {capturing ? (
                  <>
                    <span className={styles.live}>⏹</span> Stop capturing
                  </>
                ) : (
                  "Capture a tab"
                )}
              </button>
            </div>
            {capturing && (
              <div className={styles.status}>
                <span className={`${styles.statusDot} ${styles.live}`} />
                Listening to the shared tab — play anything there and the visuals follow.
              </div>
            )}
          </div>

          {/* The vocal ribbon (components/VoiceVisualizer.jsx) — its own
              section because it follows the singer, not the beat. */}
          <div className={styles.group}>
            <div className={styles.groupLabel}>Voice visuals</div>
            <p className={styles.groupHint}>
              A second visual that follows the vocals: pitch, phrasing, and the
              color of each vowel. Pick a shape.
            </p>
            <div className={styles.chips}>
              {VOICE_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => pickVoiceStyle(s)}
                  aria-pressed={voiceStyle === s}
                  className={`${styles.chip} ${voiceStyle === s ? styles.chipOn : ""}`}
                >
                  {VOICE_STYLE_LABELS[s]}
                </button>
              ))}
            </div>

            <div
              className={`${styles.status} ${!capturing && stemSrc ? styles.statusExact : ""}`}
              title={
                !capturing && stemSrc
                  ? "Reading the track's isolated vocal stem — only the voice, nothing else."
                  : "Estimated from the full mix: it stays quiet until it hears a sung pitch, so instrumental tracks barely move it."
              }
            >
              <span className={styles.statusDot} />
              {!capturing && stemSrc
                ? "Reading this track's vocal stem — exact"
                : "Following the voice by ear — add a vocal stem for an exact read"}
            </div>

            {!capturing && (
              <div className={styles.row} style={{ marginTop: 10 }}>
                <label className={`${styles.secondary} ${styles.accent}`}>
                  {stemSrc ? "Replace vocal stem" : "Add vocal stem"}
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={onStemFile}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            )}
          </div>

          <a href="/challenge" target="_blank" rel="noopener noreferrer" className={styles.cta}>
            <span>
              <strong>Score a piece for Aether</strong> — the open challenge for musicians
            </span>
            <span className={styles.ctaArrow}>→</span>
          </a>

          {err && <div className={styles.error}>{err}</div>}
        </div>
      )}
    </>
  );
}