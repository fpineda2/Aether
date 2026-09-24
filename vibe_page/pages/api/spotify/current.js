// pages/api/spotify/current.js
// GET /api/spotify/current
// Fixed to return device information
import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  if (!token) return res.status(401).json({ error: "No access token" });

  try {
    // Use /me/player instead of /me/player/currently-playing to get device info
    const r = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (r.status === 204) {
      // No active playback
      return res.status(204).end();
    }
    
    if (r.status === 401) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!r.ok) {
      console.error("Spotify API error:", r.status, await r.text());
      return res.status(r.status).json({ error: "Failed to get current playback" });
    }
    
    const json = await r.json();
    
    // Log device info for debugging
    console.log("📱 Current playback device:", json.device?.name, json.device?.type);
    
    res.status(200).json(json);
  } catch (err) {
    console.error("Current playback error:", err);
    res.status(500).json({ error: err.message || "Spotify current playback failed" });
  }
}