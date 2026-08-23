"use client";
// components/AudioReactiveController.jsx
// Renders a hidden <audio> element (defaulting to the bundled intro track) plus
// small visualizer controls. When `active` is true and the user presses play,
// it analyzes that audio in real time and drives the starfield's beat pulses.
//
// Note: this reacts to a LOCAL track you control — not the Spotify stream, which
// can't be analyzed in-browser because it's DRM-protected.

import { useEffect, useRef, useState } from "react";
import { createAudioReactiveController } from "../lib/audioReactive";

export default function AudioReactiveController({
  active,
  defaultSrc = "/audio/intro.mp3",
}) {
  const audioRef = useRef(null);
  const ctrlRef = useRef(null);
  const [src, setSrc] = useState(defaultSrc);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState("");
  const [tracks, setTracks] = useState([]);

  // Bundled demo tracks, so visitors without their own audio file can still
  // try the visualizer. Fetched once when Immersive Mode actually opens,
  // not on initial page load.
  useEffect(() => {
    if (!active || tracks.length) return;
    let cancelled = false;
    fetch("/api/audio/tracks")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTracks(data?.tracks || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active, tracks.length]);

  // Build the controller once, bound to the stable <audio> element.
  useEffect(() => {
    if (!audioRef.current) return;
    ctrlRef.current = createAudioReactiveController(audioRef.current, {
      onError: (e) => setErr(e?.message || "Audio analysis failed"),
    });
    return () => {
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
  }, []);

  // Turning interactive mode off stops the pulses and the audio.
  useEffect(() => {
    if (!active) {
      ctrlRef.current?.stop();
      audioRef.current?.pause();
      setPlaying(false);
    }
  }, [active]);

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

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    ctrlRef.current?.stop();
    audioRef.current?.pause();
    setPlaying(false);
    setErr("");

    const ext = f.name.split(".").pop()?.toLowerCase();
    const knownType = ext && EXT_MIME[ext];
    const file = knownType ? new File([f], f.name, { type: knownType }) : f;

    setSrc(URL.createObjectURL(file));
  }

  function onSelectTrack(e) {
    const file = e.target.value;
    if (!file) return;
    ctrlRef.current?.stop();
    audioRef.current?.pause();
    setPlaying(false);
    setErr("");
    setSrc(`/audio/${encodeURIComponent(file)}`);
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

  return (
    <>
      {/* Stable element so the Web Audio source node stays valid across toggles */}
      <audio ref={audioRef} src={src} loop hidden />
      {active && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <button
            onClick={togglePlay}
            style={{
              padding: "6px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.15)",
              background: playing
                ? "rgba(168,85,247,0.35)"
                : "rgba(59,130,246,0.25)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {playing ? "⏸ Pause visualizer" : "▶ Play visualizer track"}
          </button>

          {tracks.length > 0 && (
            <select
              value={currentBundledFile}
              onChange={onSelectTrack}
              title="Try a bundled demo track"
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {!currentBundledFile && <option value="">🎼 Try a demo track</option>}
              {tracks.map((t) => (
                <option key={t.file} value={t.file}>
                  {t.label}
                </option>
              ))}
            </select>
          )}

          <label style={{ fontSize: 12, opacity: 0.85, cursor: "pointer" }}>
            🎧 Use my own track
            <input
              type="file"
              accept="audio/*"
              onChange={onFile}
              style={{ display: "none" }}
            />
          </label>

          {err && (
            <span style={{ color: "#f87171", fontSize: 12 }}>{err}</span>
          )}
        </div>
      )}
    </>
  );
}