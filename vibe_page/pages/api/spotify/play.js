// pages/api/spotify/play.js
// POST /api/spotify/play  { uri: "spotify:track:..." } OR { uris: ["spotify:..."] }
import cookie from "cookie";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No access token" });

  const { uri, uris } = req.body || {};
  const body = {};
  if (uri) {
    // if a single track URI given, play it
    body.uris = [uri];
  } else if (uris && Array.isArray(uris)) {
    body.uris = uris;
  } else {
    return res.status(400).json({ error: "Missing uri or uris in body" });
  }

  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 204) return res.status(204).end();
    if (r.status === 401) return res.status(401).json({ error: "Unauthorized" });
    const json = await r.json().catch(() => ({}));
    res.status(r.status).json(json);
  } catch (err) {
    res.status(500).json({ error: err.message || "Spotify play failed" });
  }
}