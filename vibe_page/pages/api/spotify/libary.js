// pages/api/spotify/library.js
// GET /api/spotify/library
// Returns user's saved tracks and user's playlists (server side; requires user token cookie)

import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No access token. Please reconnect Spotify." });

  try {
    // fetch saved tracks (limit 12) and user playlists (limit 12)
    const [tracksRes, playlistsRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/tracks?limit=12", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("https://api.spotify.com/v1/me/playlists?limit=12", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    // if unauthorized, forward 401 so client can reconnect
    if (tracksRes.status === 401 || playlistsRes.status === 401) {
      return res.status(401).json({ error: "Unauthorized - token may have expired or lack scopes" });
    }

    const tracksJson = tracksRes.ok ? await tracksRes.json() : null;
    const playlistsJson = playlistsRes.ok ? await playlistsRes.json() : null;

    res.status(200).json({
      savedTracks: tracksJson,
      playlists: playlistsJson,
    });
  } catch (err) {
    console.error("[/api/spotify/library] error", err);
    res.status(500).json({ error: err.message || "Library fetch failed" });
  }
}