// pages/api/spotify/transfer.js
// POST /api/spotify/transfer  { device_id: "<device id>" }
// Proxies the transfer playback request to Spotify. Attempts refresh using refresh token if user's access token is invalid.
// Returns 204 on success (Spotify returns 204). Uses play: true to activate the device on transfer.

import cookie from "cookie";
import { refreshAccessToken, buildTokenCookies } from "../../../lib/spotifyAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const cookies = cookie.parse(req.headers.cookie || "");
  let token = cookies.spotify_access_token || null;
  const refreshToken = cookies.spotify_refresh_token || null;

  // parse body
  let body = {};
  try {
    body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch (e) {
    // ignore parse errors
  }

  const deviceId = body.device_id;
  if (!deviceId) return res.status(400).json({ error: "Missing device_id in body" });

  // try to refresh token if missing
  if (!token && refreshToken) {
    try {
      const tokens = await refreshAccessToken(refreshToken);
      token = tokens.access_token;
      res.setHeader("Set-Cookie", buildTokenCookies(tokens));
    } catch (err) {
      console.warn("[/api/spotify/transfer] refresh failed", err.message || err);
      return res.status(401).json({ error: "No valid access token, refresh failed" });
    }
  }

  if (!token) return res.status(401).json({ error: "No access token available. Please reconnect Spotify." });

  try {
    // NOTE: use play: true to activate playback on the browser device immediately after transfer.
    const r = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });

    if (r.status === 401 && refreshToken) {
      // attempt refresh and retry once
      try {
        const tokens = await refreshAccessToken(refreshToken);
        res.setHeader("Set-Cookie", buildTokenCookies(tokens));
        // retry with new token
        const r2 = await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [deviceId], play: true }),
        });
        if (r2.ok || r2.status === 204) return res.status(204).end();
        const txt2 = await r2.text().catch(() => "");
        return res.status(r2.status).json({ error: txt2 || "Spotify transfer failed" });
      } catch (err) {
        console.warn("[/api/spotify/transfer] refresh retry failed", err.message || err);
        return res.status(401).json({ error: "Access token invalid and refresh failed" });
      }
    }

    if (r.ok || r.status === 204) {
      return res.status(204).end();
    } else {
      const txt = await r.text().catch(() => "");
      console.error("[/api/spotify/transfer] spotify returned error", r.status, txt);
      return res.status(r.status).json({ error: txt || "Spotify API error" });
    }
  } catch (err) {
    console.error("[/api/spotify/transfer] unexpected error", err);
    return res.status(500).json({ error: "Server error" });
  }
}
