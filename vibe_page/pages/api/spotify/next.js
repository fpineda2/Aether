// pages/api/spotify/next.js
// POST /api/spotify/next
import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No access token" });

  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/next", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 204) return res.status(204).end();
    if (r.status === 401) return res.status(401).json({ error: "Unauthorized" });
    const json = await r.json().catch(() => ({}));
    res.status(r.status).json(json);
  } catch (err) {
    res.status(500).json({ error: err.message || "Spotify next failed" });
  }
}