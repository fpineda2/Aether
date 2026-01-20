"use client";

import React, { useEffect, useState, useCallback } from "react";
import Starfield from "./Starfield";
import BeatSync from "./beatSync";
import { createCodeChallenge, generateCodeVerifier } from "../pages/api/auth/auth";
import { fetchAudioAnalysis, getCurrentPlayback } from "../pages/api/spotify/spotifyApi";

const SERVER_BASE = "http://localhost:8888"; // change if your server runs elsewhere
const CLIENT_REDIRECT_URI = "http://localhost:5173/callback"; // must match your Spotify app redirect

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state"
].join(" ");

function nowSeconds() {
  return Date.now() / 1000;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [playerPositionMs, setPlayerPositionMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beats, setBeats] = useState<number[] | null>(null);
  const [starColor, setStarColor] = useState({ h: 220, s: 70, l: 50 });
  const [beatSpike, setBeatSpike] = useState(0);

  // PKCE login: generate verifier/challenge and redirect
  const startAuth = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await createCodeChallenge(verifier);
    localStorage.setItem("pkce_code_verifier", verifier);
    const params = new URLSearchParams({
      client_id: "<YOUR_CLIENT_ID_PLACEHOLDER>",
      response_type: "code",
      redirect_uri: CLIENT_REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: challenge,
      scope: SPOTIFY_SCOPES,
      show_dialog: "true"
    });
    // instruct the user to set CLIENT_ID: replace placeholder below with your client id
    // For convenience you can dynamically inject client id via env during build.
    window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  };

  // called when /callback?code=... is loaded
  const handleCallback = useCallback(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;
    const verifier = localStorage.getItem("pkce_code_verifier");
    if (!verifier) {
      alert("Missing code verifier; restart login.");
      return;
    }
    try {
      const res = await fetch(`${SERVER_BASE}/exchange_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirect_uri: CLIENT_REDIRECT_URI,
          code_verifier: verifier
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data));
      const { access_token, refresh_token, expires_in } = data;
      const expiry = Date.now() + (expires_in * 1000);
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      setExpiresAt(expiry);
      localStorage.setItem("access_token", access_token);
      if (refresh_token) localStorage.setItem("refresh_token", refresh_token);
      localStorage.setItem("expires_at", String(expiry));
      // remove code from URL
      window.history.replaceState({}, document.title, "/");
    } catch (err) {
      console.error(err);
      alert("Token exchange failed; see console");
    }
  }, []);

  // load tokens from storage (if present)
  useEffect(() => {
    const at = localStorage.getItem("access_token");
    const rt = localStorage.getItem("refresh_token");
    const ea = localStorage.getItem("expires_at");
    if (at) setAccessToken(at);
    if (rt) setRefreshToken(rt);
    if (ea) setExpiresAt(Number(ea));
  }, []);

  // run callback handler if page has code
  useEffect(() => {
    handleCallback();
  }, [handleCallback]);

  // refresh token when needed
  useEffect(() => {
    if (!refreshToken) return;
    let interval = setInterval(async () => {
      if (!expiresAt) return;
      const now = Date.now();
      if (now > (expiresAt - 60_000)) { // refresh 60s before expiry
        try {
          const res = await fetch(`${SERVER_BASE}/refresh_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(JSON.stringify(data));
          const { access_token, expires_in, refresh_token: newRefresh } = data;
          const expiry = Date.now() + (expires_in * 1000);
          setAccessToken(access_token);
          setExpiresAt(expiry);
          localStorage.setItem("access_token", access_token);
          localStorage.setItem("expires_at", String(expiry));
          if (newRefresh) {
            setRefreshToken(newRefresh);
            localStorage.setItem("refresh_token", newRefresh);
          }
        } catch (err) {
          console.error("Refresh failed", err);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshToken, expiresAt]);

  // Poll for currently playing track and position_ms
  useEffect(() => {
    let mounted = true;
    let poll: any = null;
    async function pollPlayback() {
      if (!accessToken) return;
      try {
        const data = await getCurrentPlayback(accessToken);
        if (!mounted) return;
        if (!data) {
          setIsPlaying(false);
          return;
        }
        setIsPlaying(!data.paused);
        if (data.progress_ms != null) setPlayerPositionMs(data.progress_ms);
        if (data.item && data.item.id) {
          // if track changed, fetch audio analysis once
          const trackId = data.item.id;
          // If beats already for same track skip; we can remember last track id
          const last = localStorage.getItem("last_track_id");
          if (last !== trackId) {
            localStorage.setItem("last_track_id", trackId);
            try {
              const analysis = await fetchAudioAnalysis(trackId, accessToken);
              const beatsSec = analysis.beats.map((b: any) => b.start);
              setBeats(beatsSec);
              // simple palette pick: sample first section's key/mode to hue mapping (optional)
              if (analysis.track && analysis.track.key != null) {
                const key = analysis.track.key; // 0..11
                const hue = (key / 12) * 360;
                setStarColor({ h: hue, s: 70, l: 50 });
              }
            } catch (err) {
              console.error("analysis failed", err);
            }
          }
        }
      } catch (err) {
        console.error("playback poll error", err);
      }
    }

    if (accessToken) {
      pollPlayback();
      poll = setInterval(pollPlayback, 1500);
    }
    return () => {
      mounted = false;
      if (poll) clearInterval(poll);
    };
  }, [accessToken]);

  // BeatSync -> drive star color/intensity
  useEffect(() => {
    if (!beats || !accessToken) return;
    // Convert player position supplier to seconds using last-known position + Date.now offset
    let lastPositionMs = playerPositionMs;
    let lastFetchTime = Date.now();
    const getPositionSeconds = () => {
      // estimate using last known position (the polling loop updated playerPositionMs regularly)
      // If paused, still use lastPositionMs
      const now = Date.now();
      const delta = now - lastFetchTime;
      return (lastPositionMs + delta) / 1000;
    };

    // Update lastPositionMs whenever playerPositionMs updates
    const posHandler = (e: any) => {
      lastPositionMs = playerPositionMs;
      lastFetchTime = Date.now();
    };

    // small subscription via interval (since we don't have a central player state emitter)
    const posInterval = setInterval(() => {
      lastPositionMs = playerPositionMs;
      lastFetchTime = Date.now();
    }, 300);

    const bs = new BeatSync(beats, getPositionSeconds);

    bs.onBeat(() => {
      // on beat: spike starfield intensity and pick small hue jitter
      setBeatSpike(1);
      setStarColor(prev => {
        const jitter = (Math.random() - 0.5) * 40;
        return { h: (prev.h + jitter + 360) % 360, s: Math.min(90, prev.s + 6), l: Math.min(70, prev.l + 4) };
      });
      // decay beat spike automatically in UI via effect
    });

    bs.onUpdate((i, progress) => {
      // you can optionally use progress for per-frame easing
    });

    bs.start();

    return () => {
      clearInterval(posInterval);
      bs.stop();
    };
  }, [beats, playerPositionMs, accessToken]);

  // Smooth beat spike decay
  useEffect(() => {
    if (beatSpike <= 0) return;
    const id = setInterval(() => {
      setBeatSpike(v => {
        const next = v - 0.08;
        return next > 0 ? next : 0;
      });
    }, 60);
    return () => clearInterval(id);
  }, [beatSpike]);

  // Utility: request a fresh access token for Web Playback SDK usage
  const getFreshAccessToken = useCallback(async () => {
    // If access token valid, return it; else attempt refresh
    if (accessToken && expiresAt && Date.now() < expiresAt - 30_000) return accessToken;
    if (refreshToken) {
      const res = await fetch(`${SERVER_BASE}/refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        const expiry = Date.now() + (data.expires_in * 1000);
        setAccessToken(data.access_token);
        setExpiresAt(expiry);
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("expires_at", String(expiry));
        if (data.refresh_token) {
          setRefreshToken(data.refresh_token);
          localStorage.setItem("refresh_token", data.refresh_token);
        }
        return data.access_token;
      } else throw new Error("refresh failed");
    }
    throw new Error("no token");
  }, [accessToken, expiresAt, refreshToken]);

  // UI
  return (
    <div style={{ fontFamily: "sans-serif", color: "#fff", height: "100vh", overflow: "hidden" }}>
      {!accessToken ? (
        <div style={{ padding: 40 }}>
          <h2>Spotify Starfield Pulse Demo</h2>
          <p>This demo uses PKCE + server token exchange + Web Playback SDK. Replace the client id placeholder in App.tsx before login.</p>
          <button onClick={startAuth} style={{ padding: "12px 18px", fontSize: 16 }}>Log in with Spotify</button>
          <p style={{ marginTop: 12 }}>Make sure the redirect URI configured in your Spotify app matches: {CLIENT_REDIRECT_URI}</p>
        </div>
      ) : (
        <div>
          <div style={{ position: "absolute", zIndex: 10, padding: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Access token:</strong> {accessToken ? "available" : "none"}
            </div>
            <div>
              <strong>Playback:</strong> {isPlaying ? "Playing" : "Paused / Not available"}
            </div>
          </div>

          <div style={{ width: "100vw", height: "100vh" }}>
            <Starfield
              width={1400}
              height={900}
              beatIntensity={beatSpike}
              color={starColor}
              starCount={380}
            />
          </div>
        </div>
      )}
    </div>
  );
}