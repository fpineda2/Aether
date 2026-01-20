"use client"// Minimal Spotify helpers (fetch audio analysis and current playback).
// You must supply a valid access token with 'user-read-playback-state' and 'user-read-currently-playing' scopes.

export async function fetchAudioAnalysis(trackId: string, accessToken: string) {
  const res = await fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Audio analysis fetch failed: ${res.status}`);
  return res.json(); // contains .beats (array), .sections, .segments, etc.
}

export async function getCurrentPlayback(accessToken: string) {
  const res = await fetch(`https://api.spotify.com/v1/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    if (res.status === 204) return null;
    throw new Error(`Playback fetch failed: ${res.status}`);
  }
  return res.json();
}