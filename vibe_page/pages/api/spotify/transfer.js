// pages/api/spotify/transfer.js
// POST /api/spotify/transfer  { device_id: "<device id>" }
// Proxies the transfer playback request to Spotify. Attempts refresh using refresh token if user's access token is invalid.
// Returns 204 on success (Spotify returns 204). Uses play: true to activate the device on transfer.

import cookie from "cookie";

async function refreshAccessToken(refreshToken) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Missing Spotify client credentials on server");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error("Refresh failed: " + txt);
  }
  const json = await r.json();
  return json; // contains access_token, maybe refresh_token, expires_in
}

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
      const cookieOpts = {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      };
      const cookiesToSet = [
        cookie.serialize("spotify_access_token", tokens.access_token, { ...cookieOpts, maxAge: tokens.expires_in || 3600 }),
        cookie.serialize("spotify_expires_at", String(Date.now() + (tokens.expires_in || 3600) * 1000), {
          ...cookieOpts,
          maxAge: tokens.expires_in || 3600,
        }),
      ];
      if (tokens.refresh_token) {
        cookiesToSet.push(
          cookie.serialize("spotify_refresh_token", tokens.refresh_token, {
            ...cookieOpts,
            maxAge: 30 * 24 * 60 * 60,
          })
        );
      }
      res.setHeader("Set-Cookie", cookiesToSet);
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
        const cookieOpts = {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
        };
        const cookiesToSet = [
          cookie.serialize("spotify_access_token", tokens.access_token, { ...cookieOpts, maxAge: tokens.expires_in || 3600 }),
          cookie.serialize("spotify_expires_at", String(Date.now() + (tokens.expires_in || 3600) * 1000), {
            ...cookieOpts,
            maxAge: tokens.expires_in || 3600,
          }),
        ];
        if (tokens.refresh_token) {
          cookiesToSet.push(
            cookie.serialize("spotify_refresh_token", tokens.refresh_token, {
              ...cookieOpts,
              maxAge: 30 * 24 * 60 * 60,
            })
          );
        }
        res.setHeader("Set-Cookie", cookiesToSet);
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