// pages/api/spotify/me.js
import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No token" });

  const r = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    return res.status(r.status).json({ error: txt });
  }
  const json = await r.json();
  res.status(200).json(json);
}