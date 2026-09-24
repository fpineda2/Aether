// pages/api/spotify/search.js
// GET /api/spotify/search?q=...
import cookie from "cookie";

export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No access token" });

  try {
    const url = `https://api.spotify.com/v1/search?limit=12&type=track,artist,playlist&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) return res.status(401).json({ error: "Unauthorized" });
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (err) {
    res.status(500).json({ error: err.message || "Spotify search failed" });
  }
}