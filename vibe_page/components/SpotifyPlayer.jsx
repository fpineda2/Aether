"use client";
// components/SpotifyPlayer.jsx
// Full Spotify Web Playback SDK component with working Play/Pause and styled buttons.
// Uses server proxy endpoints for token checks and control (see README in repo for endpoints).
//
// "Skip to next" and "Refresh" live in SpotifySection, but are rendered here in the
// bottom controls row (next to Play/Pause) via a ref exposed from that component.

import React, { useEffect, useRef, useState } from "react";
import styles from "./SpotifyPlayer.module.css";
import SpotifySection from "./SpotifySection";

export default function SpotifyPlayer({ name = "VIBE Web Player" }) {
  const playerRef = useRef(null);
  const spotifySectionRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [isPremium, setIsPremium] = useState(null); // null=unknown
  const [deviceId, setDeviceId] = useState(null);
  const [playbackState, setPlaybackState] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isControlling, setIsControlling] = useState(false); // Prevent double clicks

  // Suppress harmless Spotify SDK robustness warning
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (args[0]?.includes?.('robustness level')) return;
      originalWarn(...args);
    };
    return () => {
      console.warn = originalWarn;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initFlow() {
      setLoading(true);
      setError("");
      setNeedsReconnect(false);

      try {
        setTokenLoading(true);
        const tokenRes = await fetch("/api/auth/token", { cache: "no-store" });
        if (!tokenRes.ok) {
          setNeedsReconnect(true);
          setTokenLoading(false);
          setLoading(false);
          return;
        }
        setTokenLoading(false);

        const meRes = await fetch("/api/spotify/me", { cache: "no-store" });
        if (!meRes.ok) {
          if (meRes.status === 401) {
            setNeedsReconnect(true);
            setLoading(false);
            return;
          }
          setIsPremium(false);
        } else {
          const me = await meRes.json();
          setIsPremium(Boolean(me && me.product && me.product.toLowerCase() === "premium"));
          if (!(me && me.product && me.product.toLowerCase() === "premium")) {
            setLoading(false);
            return;
          }
        }

        await loadSpotifySDK();
        if (!mounted) return;
        await initPlayer();
        await refreshPlaybackStateFromServer();
      } catch (err) {
        console.error("SpotifyPlayer init error", err);
        setError(err?.message || "Failed to initialize Spotify player");
        setNeedsReconnect(true);
        setLoading(false);
        setTokenLoading(false);
      }
    }

    initFlow();

    // Periodic refresh to keep playback state accurate (only when page is visible)
    const refreshInterval = setInterval(() => {
      if (!isControlling && document.visibilityState === 'visible') {
        refreshPlaybackStateFromServer();
      }
    }, 3000); // Every 3 seconds

    return () => {
      mounted = false;
      clearInterval(refreshInterval);
      cleanupPlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadSpotifySDK() {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") return reject(new Error("No window"));
      if (window.Spotify) return resolve();

      // Define the global callback that Spotify SDK expects
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log("Spotify SDK ready callback fired");
        resolve();
      };

      const id = "spotify-player-sdk";
      if (document.getElementById(id)) {
        const wait = setInterval(() => {
          if (window.Spotify) {
            clearInterval(wait);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          if (!window.Spotify) {
            clearInterval(wait);
            reject(new Error("Spotify SDK load timed out"));
          }
        }, 8000);
        return;
      }

      const s = document.createElement("script");
      s.id = id;
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.async = true;
      s.onerror = () => reject(new Error("Failed to load Spotify SDK"));
      document.head.appendChild(s);
    });
  }

  async function initPlayer() {
    if (!window.Spotify) {
      setError("Spotify SDK not available");
      setLoading(false);
      return;
    }

    cleanupPlayer();

    const player = new window.Spotify.Player({
      name: name || "VIBE Web Player",
      getOAuthToken: (cb) => {
        (async () => {
          try {
            const r = await fetch("/api/auth/token", { cache: "no-store" });
            if (!r.ok) {
              setNeedsReconnect(true);
              cb(null);
              return;
            }
            const j = await r.json();
            cb(j?.access_token || j?.token || null);
          } catch (err) {
            console.error("getOAuthToken failed", err);
            setNeedsReconnect(true);
            cb(null);
          }
        })();
      },
    });

    playerRef.current = player;

    player.addListener("initialization_error", ({ message }) => {
      console.error("Spotify SDK initialization_error", message);
      setError("Player initialization error: " + message);
    });
    player.addListener("authentication_error", ({ message }) => {
      console.error("Auth error", message);
      setNeedsReconnect(true);
    });
    player.addListener("account_error", ({ message }) => {
      console.error("Account error", message);
      setError("Account error: " + message);
    });
    player.addListener("playback_error", ({ message }) => {
      console.error("Playback error", message);
      setError("Playback error: " + message);
    });

    player.addListener("ready", async ({ device_id }) => {
      console.info("Spotify Player ready with device id", device_id);
      setDeviceId(device_id);
      setLoading(false);

      // Auto-transfer playback to this device to make it the active device
      try {
        const currentState = await fetch("/api/spotify/current", { cache: "no-store" });

        // If there's no active playback anywhere (204) or playback exists but on another device
        if (currentState.status === 204) {
          console.info("No active playback detected - transferring to this device");
          await transferPlaybackToDevice(device_id, true);
        } else if (currentState.ok) {
          const state = await currentState.json();
          // If playing on a different device, optionally auto-transfer
          if (state.device && state.device.id !== device_id) {
            console.info("Playback active on another device - this device is ready for manual transfer");
            // Optionally uncomment below to auto-transfer from other devices:
            // await transferPlaybackToDevice(device_id, true);
          }
        }
      } catch (err) {
        console.warn("Auto-transfer check failed", err);
      }
    });

    player.addListener("not_ready", ({ device_id }) => {
      console.info("Player device not ready", device_id);
      if (deviceId === device_id) setDeviceId(null);
    });

    player.addListener("player_state_changed", (state) => {
      setPlaybackState(state || null);
    });

    try {
      await player.connect();
    } catch (err) {
      console.error("player.connect failed", err);
      setError("Failed to connect player: " + (err?.message || err));
      setLoading(false);
    }
  }

  function cleanupPlayer() {
    try {
      if (playerRef.current) {
        try { playerRef.current.disconnect(); } catch (e) {}
        playerRef.current = null;
      }
    } catch (e) {}
  }

  async function refreshPlaybackStateFromServer() {
    try {
      const r = await fetch("/api/spotify/current", { cache: "no-store" });
      if (r.status === 204) {
        setPlaybackState(null);
        return;
      }
      if (!r.ok) return;
      const json = await r.json();
      setPlaybackState({
        is_playing: !!json.is_playing,
        track_window: { current_track: json.item || null },
        progress_ms: json.progress_ms || 0,
        device: json.device || null, // Add device info
      });
    } catch (e) {
      console.warn("refreshPlaybackStateFromServer failed", e);
    }
  }

  async function sendControl(action) {
    try {
      const body = { action };
      // DON'T send device_id - let it control the currently active device
      // if (action === "play" && deviceId) body.device_id = deviceId;

      const r = await fetch("/api/spotify/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 204) {
        // Success - the 5s interval will catch the state change
        return true;
      } else if (r.status === 401) {
        setNeedsReconnect(true);
        return false;
      } else if (r.status === 403) {
        const txt = await r.text().catch(() => "");
        console.error("Control forbidden (403):", txt);
        if (txt.includes("Restriction violated") || txt.includes("PREMIUM_REQUIRED")) {
          setError("⚠️ Unable to control playback. You may need to start playing music first or have Spotify Premium.");
        } else {
          setError("Playback restricted. Ensure you have Spotify Premium.");
        }
        return false;
      } else {
        const txt = await r.text().catch(() => "");
        console.error("Control failed:", txt);
        setError("Playback control failed. Try starting playback in Spotify first.");
        return false;
      }
    } catch (err) {
      console.error("sendControl error", err);
      setError("Control request failed. Check your connection and try again.");
      return false;
    }
  }

  async function transferPlaybackToDevice(targetDeviceId, silent = false) {
    if (!targetDeviceId) {
      if (!silent) setError("No device id provided for transfer");
      return false;
    }

    setIsTransferring(true);

    try {
      const r = await fetch("/api/spotify/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: targetDeviceId }),
      });

      setIsTransferring(false);

      if (r.status === 204) {
        await refreshPlaybackStateFromServer();
        setDeviceId(targetDeviceId);
        if (!silent) {
          setError(""); // Clear any previous errors
        }
        return true;
      } else if (r.status === 401) {
        setNeedsReconnect(true);
        if (!silent) {
          const txt = await r.text().catch(() => "");
          setError("Transfer auth failed: " + txt);
        }
        return false;
      } else {
        if (!silent) {
          const txt = await r.text().catch(() => "");
          setError("Transfer failed: " + txt);
        }
        return false;
      }
    } catch (err) {
      console.error("transferPlaybackToDevice error", err);
      setIsTransferring(false);
      if (!silent) setError("Transfer request failed");
      return false;
    }
  }

  async function handlePlayPause() {
    if (isControlling) return;

    setIsControlling(true);

    try {
      if (isPlaying) {
        await sendControl("pause");
      } else {
        await sendControl("play");
      }
    } finally {
      setTimeout(() => setIsControlling(false), 400);
    }
  }

  function handleReconnectClick() {
    const params = new URLSearchParams({ redirect_to: window.location.pathname });
    window.location.href = `/api/auth/login?${params.toString()}`;
  }

  function renderPlayback() {
    const hasTrack = !!(playbackState && playbackState.track_window && playbackState.track_window.current_track);
    if (!hasTrack) {
      return <div className={styles.note}>No active playback on this device.</div>;
    }
    const t = playbackState.track_window.current_track;
    const artists = (t?.artists || []).map((a) => a.name).join(", ");
    return (
      <div className={styles.playbackRow}>
        {t?.album?.images?.[0]?.url && (
          <img src={t.album.images[0].url} alt="" className={styles.art} />
        )}
        <div className={styles.trackMeta}>
          <div className={styles.trackTitle}>{t.name}</div>
          <div className={styles.trackSub}>{artists}</div>
        </div>
      </div>
    );
  }

  const isPlaying = !!(playbackState && playbackState.is_playing);

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div className={styles.title}> </div>
        {loading && <div className={styles.sub}>Initializing player…</div>}
        {tokenLoading && <div className={styles.sub}>Refreshing token…</div>}
        {isTransferring && <div className={styles.sub}>Transferring playback…</div>}
      </div>

      {error && (
        <div className={styles.errorBox} style={{
          background: 'rgba(147, 51, 234, 0.15)',
          border: '2px solid #9333ea',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '15px',
            fontWeight: '600',
            color: '#a855f7',
            marginBottom: '8px'
          }}>
            {error}
          </div>
          <div>
            <button
              className={styles.auxBtn}
              onClick={() => setError("")}
              style={{
                background: '#9333ea',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {needsReconnect && (
        <div className={styles.warnBox}>
          <div>Spotify authorization is missing or needs re-consent (playback permissions).</div>
          <div style={{ marginTop: 8 }}>
            <button className={styles.primaryBtn} onClick={handleReconnectClick}>Reconnect Spotify</button>
          </div>
        </div>
      )}

      {isPremium === false && !needsReconnect && (
        <div className={styles.warnBox}>
          <div>Your Spotify account is not Premium. The Web Playback SDK requires a Premium account.</div>
          <div style={{ marginTop: 8 }}>
            <a className={styles.link} href="https://www.spotify.com/premium/" target="_blank" rel="noreferrer">Upgrade to Premium</a>
          </div>
        </div>
      )}

      {!needsReconnect && isPremium && (
        <div>
          {/*<div className={styles.playbackArea}>{renderPlayback()}</div>*/}
          <div style={{ marginTop: 17 }}>
            <SpotifySection ref={spotifySectionRef} />
          </div>

          <div className={styles.controlsRow}>

            <button
              className={`${styles.controlBtn} ${isPlaying ? styles.negative : styles.positive}`}
              onClick={handlePlayPause}
              disabled={isTransferring || isControlling}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            
            <button
              className={styles.secondaryBtn}
              onClick={() => spotifySectionRef.current?.skipNext()}
              disabled={isTransferring || isControlling}
            >
              Skip to next
            </button>

            {deviceId && playbackState?.device && playbackState.device.name !== "VIBE Web Player" && (
              <button
                className={styles.secondaryBtn}
                onClick={async () => {
                  setError("");
                  const ok = await transferPlaybackToDevice(deviceId);
                  if (ok) {
                    setError("Transfer succeeded — playback moved to this device.");
                    // Clear success message after 3 seconds
                    setTimeout(() => setError(""), 3000);

                    // Notify other components that device changed
                    window.dispatchEvent(new CustomEvent('spotify-device-changed'));
                  }
                }}
                disabled={isTransferring}
              >
                {isTransferring ? "Transferring..." : "Transfer to this device"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}