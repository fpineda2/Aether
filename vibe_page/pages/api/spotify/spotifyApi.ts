// Helper functions to fetch audio analysis and playback state.
// clientServerBase is the server that does token exchange and refresh (e.g. http://localhost:8888)
export async function fetchAudioAnalysis(trackId: string, accessToken: string) {
  const res = await fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Audio analysis fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function getCurrentPlayback(accessToken: string) {
  const res = await fetch(`https://api.spotify.com/v1/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Playback fetch failed: ${res.status}`);
  return res.json();
}